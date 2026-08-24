import type { CommandEntry } from "../models/command-file";
import { createId } from "./ids";

const MAX_SOURCE_LENGTH = 500_000;
const MAX_ROWS = 1_000;

export type TablePasteFormat = "markdown" | "tsv" | "csv";

export interface TableImportIssue {
  severity: "error" | "warning";
  message: string;
  row?: number;
}

export interface TableImportPreview {
  format: TablePasteFormat | null;
  commands: CommandEntry[];
  issues: TableImportIssue[];
  duplicates: TableImportDuplicate[];
}

export interface TableImportDuplicate {
  commandId: string;
  row: number;
  kind: "existing" | "pasted";
}

interface GridRow {
  cells: string[];
  row: number;
}

interface ParsedGrid {
  format: TablePasteFormat;
  header: GridRow;
  rows: GridRow[];
}

type ColumnTarget =
  | "command"
  | "service"
  | "description"
  | "example"
  | "notes";

interface ColumnDefinition {
  header: string;
  index: number;
  target?: ColumnTarget;
}

const COLUMN_ALIASES: Record<ColumnTarget, ReadonlySet<string>> = {
  command: new Set([
    "command",
    "cmd",
    "lenh",
    "caulenh",
    "port",
    "ports",
    "value",
    "giatri",
  ]),
  service: new Set(["service", "dichvu"]),
  description: new Set([
    "description",
    "desc",
    "information",
    "info",
    "mota",
    "thongtin",
    "function",
    "chucnang",
  ]),
  example: new Set(["example", "examples", "vidu"]),
  notes: new Set(["note", "notes", "ghichu"]),
};

const DEPRECATED_HEADERS = new Map([
  ["syntax", "Syntax"],
  ["cuphap", "Syntax"],
  ["action", "Action"],
  ["hanhdong", "Action"],
  ["risk", "Risk"],
  ["ruiro", "Risk"],
  ["mucdoruiro", "Risk"],
  ["variable", "Variables"],
  ["variables", "Variables"],
  ["var", "Variables"],
  ["vars", "Variables"],
  ["bien", "Variables"],
]);

export function parseTablePaste(
  source: string,
  tableName: string,
  existingCommandIds: ReadonlySet<string>,
  existingCommands: readonly string[] = [],
): TableImportPreview {
  const issues: TableImportIssue[] = [];
  const duplicates: TableImportDuplicate[] = [];
  const existingNormalized = new Set(existingCommands.map(normalizeDuplicateCommand));
  const pastedNormalized = new Set<string>();
  const normalized = normalizeSource(source);
  if (!normalized) {
    return { format: null, commands: [], issues, duplicates };
  }
  if (normalized.length > MAX_SOURCE_LENGTH) {
    return {
      format: null,
      commands: [],
      issues: [
        {
          severity: "error",
          message: `The pasted table is too large. Limit it to ${MAX_SOURCE_LENGTH.toLocaleString()} characters.`,
        },
      ],
      duplicates,
    };
  }

  const parsed = parseGrid(normalized, issues);
  if (!parsed) {
    return { format: null, commands: [], issues, duplicates };
  }
  if (parsed.rows.length > MAX_ROWS) {
    issues.push({
      severity: "error",
      message: `The pasted table has ${parsed.rows.length.toLocaleString()} rows. Limit it to ${MAX_ROWS.toLocaleString()} rows.`,
    });
    return { format: parsed.format, commands: [], issues, duplicates };
  }

  const columns = mapColumns(parsed.header, issues);
  if (!columns) {
    return { format: parsed.format, commands: [], issues, duplicates };
  }

  const unknownHeaders = columns.filter((column) => !column.target).map((column) => column.header);
  if (unknownHeaders.length > 0) {
    issues.push({
      severity: "warning",
      message: `Unrecognized columns will be kept in Notes: ${unknownHeaders.join(", ")}.`,
    });
  }

  const commandIds = new Set(existingCommandIds);
  const commands: CommandEntry[] = [];
  parsed.rows.forEach((row, index) => {
    if (row.cells.length > columns.length) {
      const extra = row.cells.slice(columns.length).some((cell) => cell.trim().length > 0);
      if (extra) {
        issues.push({
          severity: "error",
          row: row.row,
          message: `Expected ${columns.length} columns but found ${row.cells.length}.`,
        });
      }
    }
    if (row.cells.length < columns.length) {
      issues.push({
        severity: "error",
        row: row.row,
        message: `Expected ${columns.length} columns but found ${row.cells.length}.`,
      });
    }

    const values = new Map<ColumnTarget, string>();
    const unknownValues: Array<{ header: string; value: string }> = [];
    columns.forEach((column) => {
      const rawValue = (row.cells[column.index] ?? "").trim();
      const value = column.target === "example" ? normalizeExampleBreaks(rawValue) : rawValue;
      if (column.target) {
        values.set(column.target, value);
      } else if (value) {
        unknownValues.push({ header: column.header, value });
      }
    });

    const commandValue = values.get("command") ?? "";
    if (!commandValue) {
      issues.push({ severity: "error", row: row.row, message: "Command/Port/Value is required." });
      return;
    }
    const service = values.get("service") ?? "";
    const command = service ? `${commandValue}\t${service}` : commandValue;

    let description = values.get("description") ?? "";
    if (!description && unknownValues.length > 0) {
      const first = unknownValues.shift();
      if (first) {
        description = `${first.header}: ${first.value}`;
      }
    }
    const importedNotes = unknownValues.map((item) => `${item.header}: ${item.value}`).join("\n");
    const notes = joinNonEmpty(values.get("notes"), importedNotes);
    const rowNumber = index + 1;
    const name = `Table Row ${rowNumber}`;
    const id = createId(`${tableName} row ${rowNumber}`, commandIds);
    commandIds.add(id);

    const entry: CommandEntry = {
      id,
      name,
      command,
      ...(description ? { description } : {}),
      ...(values.get("example") ? { example: values.get("example") } : {}),
      ...(notes ? { notes } : {}),
    };
    commands.push(entry);

    const duplicateKey = normalizeDuplicateCommand(command);
    const duplicateKind = existingNormalized.has(duplicateKey)
      ? "existing"
      : pastedNormalized.has(duplicateKey)
        ? "pasted"
        : null;
    if (duplicateKind) {
      duplicates.push({ commandId: id, row: row.row, kind: duplicateKind });
      issues.push({
        severity: "warning",
        row: row.row,
        message: duplicateKind === "existing"
          ? "This command already exists in the current command file and will be skipped by default."
          : "This command is duplicated earlier in the pasted table and will be skipped by default.",
      });
    }
    pastedNormalized.add(duplicateKey);
  });

  if (commands.length === 0 && !issues.some((issue) => issue.severity === "error")) {
    issues.push({ severity: "error", message: "The pasted table does not contain any data rows." });
  }
  return { format: parsed.format, commands, issues, duplicates };
}

export function hasTableImportErrors(preview: TableImportPreview): boolean {
  return preview.issues.some((issue) => issue.severity === "error");
}

export function importableCommands(
  preview: TableImportPreview,
  includeDuplicates: boolean,
): CommandEntry[] {
  if (includeDuplicates) {
    return preview.commands;
  }
  const duplicateIds = new Set(preview.duplicates.map((item) => item.commandId));
  return preview.commands.filter((command) => !duplicateIds.has(command.id));
}

export function normalizeDuplicateCommand(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeExampleBreaks(value: string): string {
  return value.replace(/<br\s*\/?\s*>/gi, "\n");
}

function normalizeSource(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) {
    return "";
  }
  const fenced = [...trimmed.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((match) => match[1]?.trim() ?? "");
  const candidate = fenced.find((value) => value.includes("|") || value.includes("\t") || value.includes(","));
  return (candidate ?? trimmed).replace(/^\uFEFF/, "").trim();
}

function parseGrid(source: string, issues: TableImportIssue[]): ParsedGrid | null {
  const markdown = parseMarkdown(source);
  if (markdown) {
    return markdown;
  }
  if (source.includes("\t")) {
    return parseDelimited(source, "\t", "tsv", issues);
  }
  if (source.includes(",")) {
    return parseDelimited(source, ",", "csv", issues);
  }
  issues.push({
    severity: "error",
    message: "Paste a Markdown, TSV, or CSV table with a header row.",
  });
  return null;
}

function parseMarkdown(source: string): ParsedGrid | null {
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length - 1; index += 1) {
    const headerLine = lines[index] ?? "";
    const separatorLine = lines[index + 1] ?? "";
    if (!hasPipe(headerLine) || !isMarkdownSeparator(separatorLine)) {
      continue;
    }
    const header = splitMarkdownLine(headerLine);
    const rows: GridRow[] = [];
    for (let dataIndex = index + 2; dataIndex < lines.length; dataIndex += 1) {
      const line = lines[dataIndex] ?? "";
      if (!line.trim()) {
        break;
      }
      if (!hasPipe(line)) {
        break;
      }
      const cells = splitMarkdownLine(line);
      if (cells.some((cell) => cell.trim())) {
        rows.push({ cells, row: dataIndex + 1 });
      }
    }
    return { format: "markdown", header: { cells: header, row: index + 1 }, rows };
  }
  return null;
}

function parseDelimited(
  source: string,
  delimiter: "\t" | ",",
  format: TablePasteFormat,
  issues: TableImportIssue[],
): ParsedGrid | null {
  const rows: GridRow[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let rowNumber = 1;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] ?? "";
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && character === delimiter) {
      cells.push(cleanCell(cell));
      cell = "";
      continue;
    }
    if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && source[index + 1] === "\n") {
        index += 1;
      }
      cells.push(cleanCell(cell));
      if (cells.some((value) => value.trim())) {
        rows.push({ cells, row: rowNumber });
      }
      cells = [];
      cell = "";
      rowNumber += 1;
      continue;
    }
    cell += character;
  }
  if (quoted) {
    issues.push({ severity: "error", row: rowNumber, message: "Unclosed quoted value." });
    return null;
  }
  cells.push(cleanCell(cell));
  if (cells.some((value) => value.trim())) {
    rows.push({ cells, row: rowNumber });
  }
  const header = rows.shift();
  if (!header) {
    issues.push({ severity: "error", message: "The pasted table is empty." });
    return null;
  }
  return { format, header, rows };
}

function mapColumns(header: GridRow, issues: TableImportIssue[]): ColumnDefinition[] | null {
  const usedTargets = new Set<ColumnTarget>();
  const columns = header.cells.map((rawHeader, index) => {
    const headerName = cleanCell(rawHeader) || `Column ${index + 1}`;
    const deprecated = DEPRECATED_HEADERS.get(normalizeHeader(headerName));
    if (deprecated) {
      issues.push({
        severity: "error",
        row: header.row,
        message: `Remove deprecated column "${deprecated}" before importing.`,
      });
    }
    const target = findColumnTarget(headerName);
    if (target && usedTargets.has(target)) {
      issues.push({
        severity: "error",
        row: header.row,
        message: `The "${headerName}" column duplicates another ${target} column.`,
      });
    }
    if (target) {
      usedTargets.add(target);
    }
    return { header: headerName, index, ...(target ? { target } : {}) };
  });
  if (!usedTargets.has("command")) {
    issues.push({
      severity: "error",
      row: header.row,
      message: "Add a Command, Port, or Value column to the table header.",
    });
  }
  return issues.some((issue) => issue.severity === "error") ? null : columns;
}

function findColumnTarget(header: string): ColumnTarget | undefined {
  const normalized = normalizeHeader(header);
  return (Object.keys(COLUMN_ALIASES) as ColumnTarget[]).find((target) =>
    COLUMN_ALIASES[target].has(normalized),
  );
}

function isMarkdownSeparator(value: string): boolean {
  const cells = splitMarkdownLine(value);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function hasPipe(value: string): boolean {
  let escaped = false;
  for (const character of value) {
    if (character === "|" && !escaped) {
      return true;
    }
    escaped = character === "\\" && !escaped;
    if (character !== "\\") {
      escaped = false;
    }
  }
  return false;
}

function splitMarkdownLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let escaped = false;
  for (const character of line.trim()) {
    if (escaped) {
      cell += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "|") {
      cells.push(cleanCell(cell));
      cell = "";
      continue;
    }
    cell += character;
  }
  if (escaped) {
    cell += "\\";
  }
  cells.push(cleanCell(cell));
  if (cells[0] === "") {
    cells.shift();
  }
  if (cells[cells.length - 1] === "") {
    cells.pop();
  }
  return cells;
}

function cleanCell(value: string): string {
  const trimmed = value.trim().replace(/<br\s*\/?>/gi, "\n");
  const inlineCode = trimmed.match(/^`([\s\S]*)`$/);
  return inlineCode?.[1]?.trim() ?? trimmed;
}

function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function joinNonEmpty(...values: Array<string | undefined>): string {
  return values.filter((value): value is string => Boolean(value?.trim())).join("\n\n");
}
