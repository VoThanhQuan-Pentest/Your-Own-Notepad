import type {
  CommandEntry,
  CommandFile,
  CommandSection,
  CommandSectionLayout,
} from "../models/command-file.ts";

const CURRENT_VERSION = 2;
const LEGACY_VERSION = 1;
const SECTION_LAYOUTS = new Set<CommandSectionLayout>(["standard", "table"]);
const LEGACY_ACTIONS = new Set(["copy", "run", "open", "open-terminal"]);
const LEGACY_RISKS = new Set(["safe", "caution", "danger"]);
const REMOVED_COMMAND_FIELDS = ["syntax", "action", "risk", "variables"] as const;

export interface ValidationIssue {
  path: string;
  message: string;
}

export type CommandFileParseResult =
  | {
      ok: true;
      data: CommandFile;
      sourceVersion: 1 | 2;
      needsMigration: boolean;
    }
  | {
      ok: false;
      error: {
        kind: "invalid-json" | "invalid-schema" | "unsupported-version";
        message: string;
        issues: ValidationIssue[];
      };
    };

export function parseCommandFile(source: string): CommandFileParseResult {
  let value: unknown;
  try {
    value = JSON.parse(source) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown JSON error";
    return failure("invalid-json", `This file is not valid JSON: ${detail}`);
  }
  return validateCommandFile(value);
}

export function validateCommandFile(value: unknown): CommandFileParseResult {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    return failure("invalid-schema", "The file root must be a JSON object.", [
      { path: "$", message: "Expected an object." },
    ]);
  }

  const sourceVersion = requiredNumber(value, "version", "$", issues);
  if (sourceVersion !== LEGACY_VERSION && sourceVersion !== CURRENT_VERSION) {
    return failure(
      "unsupported-version",
      `Command Vault supports file versions ${LEGACY_VERSION} and ${CURRENT_VERSION}, but this file uses version ${String(sourceVersion)}.`,
      [{ path: "$.version", message: `Expected ${LEGACY_VERSION} or ${CURRENT_VERSION}.` }],
    );
  }

  const title = requiredString(value, "title", "$", issues, true);
  const description = optionalString(value, "description", "$", issues);
  const sectionsValue = requiredArray(value, "sections", "$", issues);
  const sectionIds = new Set<string>();
  const commandIds = new Set<string>();
  const sections: CommandSection[] = [];

  sectionsValue?.forEach((sectionValue, index) => {
    const section = readSection(
      sectionValue,
      `$.sections[${index}]`,
      issues,
      sectionIds,
      commandIds,
      sourceVersion,
    );
    if (section) {
      sections.push(section);
    }
  });

  if (issues.length > 0 || title === undefined || sourceVersion === undefined) {
    return failure(
      "invalid-schema",
      `The command file has ${issues.length} schema ${issues.length === 1 ? "error" : "errors"}.`,
      issues,
    );
  }

  return {
    ok: true,
    data: {
      version: CURRENT_VERSION,
      title,
      ...(description === undefined ? {} : { description }),
      sections,
    },
    sourceVersion,
    needsMigration: sourceVersion === LEGACY_VERSION,
  };
}

export function serializeCommandFile(file: CommandFile): string {
  return `${JSON.stringify({ ...file, version: CURRENT_VERSION }, null, 2)}\n`;
}

function readSection(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  sectionIds: Set<string>,
  commandIds: Set<string>,
  sourceVersion: 1 | 2,
): CommandSection | undefined {
  if (!isRecord(value)) {
    issues.push({ path, message: "Expected a section object." });
    return undefined;
  }

  const id = requiredString(value, "id", path, issues, true);
  const title = requiredString(value, "title", path, issues, true);
  const layout = optionalEnum(value, "layout", path, issues, SECTION_LAYOUTS);
  const commandsValue = requiredArray(value, "commands", path, issues);
  const commands: CommandEntry[] = [];

  addUnique(id, sectionIds, `${path}.id`, "section", issues);
  commandsValue?.forEach((commandValue, index) => {
    const command = readCommand(
      commandValue,
      `${path}.commands[${index}]`,
      issues,
      commandIds,
      sourceVersion,
    );
    if (command) {
      commands.push(command);
    }
  });

  if (id === undefined || title === undefined || commandsValue === undefined) {
    return undefined;
  }
  return { id, title, ...(layout === undefined ? {} : { layout }), commands };
}

function readCommand(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  commandIds: Set<string>,
  sourceVersion: 1 | 2,
): CommandEntry | undefined {
  if (!isRecord(value)) {
    issues.push({ path, message: "Expected a command object." });
    return undefined;
  }

  const id = requiredString(value, "id", path, issues, true);
  const name = requiredString(value, "name", path, issues, true);
  const command = requiredString(value, "command", path, issues, true);
  const description = optionalString(value, "description", path, issues);
  const example = optionalString(value, "example", path, issues);
  const notes = optionalString(value, "notes", path, issues);
  addUnique(id, commandIds, `${path}.id`, "command", issues);

  if (sourceVersion === CURRENT_VERSION) {
    REMOVED_COMMAND_FIELDS.forEach((field) => {
      if (field in value) {
        issues.push({
          path: `${path}.${field}`,
          message: `"${field}" was removed in command file version ${CURRENT_VERSION}.`,
        });
      }
    });
  } else {
    validateLegacyCommand(value, path, issues);
  }

  if (id === undefined || name === undefined || command === undefined) {
    return undefined;
  }
  return {
    id,
    name,
    command,
    ...(description === undefined ? {} : { description }),
    ...(example === undefined ? {} : { example }),
    ...(notes === undefined ? {} : { notes }),
  };
}

function validateLegacyCommand(
  value: Record<string, unknown>,
  path: string,
  issues: ValidationIssue[],
): void {
  const action = requiredString(value, "action", path, issues, true);
  const risk = requiredString(value, "risk", path, issues, true);
  optionalString(value, "syntax", path, issues);
  if (action && !LEGACY_ACTIONS.has(action)) {
    issues.push({ path: `${path}.action`, message: "Unsupported legacy action." });
  }
  if (risk && !LEGACY_RISKS.has(risk)) {
    issues.push({ path: `${path}.risk`, message: "Unsupported legacy risk." });
  }
  if (value.variables !== undefined && !Array.isArray(value.variables)) {
    issues.push({ path: `${path}.variables`, message: "Expected an array when provided." });
  }
}

function addUnique(
  value: string | undefined,
  seen: Set<string>,
  path: string,
  label: string,
  issues: ValidationIssue[],
): void {
  if (!value) {
    return;
  }
  if (seen.has(value)) {
    issues.push({ path, message: `Duplicate ${label} id "${value}".` });
    return;
  }
  seen.add(value);
}

function requiredString(
  value: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
  nonEmpty: boolean,
): string | undefined {
  const candidate = value[key];
  if (typeof candidate !== "string" || (nonEmpty && candidate.trim().length === 0)) {
    issues.push({
      path: `${path}.${key}`,
      message: nonEmpty ? "Expected a non-empty string." : "Expected a string.",
    });
    return undefined;
  }
  return candidate;
}

function optionalString(
  value: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): string | undefined {
  const candidate = value[key];
  if (candidate === undefined) {
    return undefined;
  }
  if (typeof candidate !== "string") {
    issues.push({ path: `${path}.${key}`, message: "Expected a string when provided." });
    return undefined;
  }
  return candidate;
}

function requiredNumber(
  value: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): number | undefined {
  const candidate = value[key];
  if (typeof candidate !== "number" || !Number.isInteger(candidate)) {
    issues.push({ path: `${path}.${key}`, message: "Expected an integer." });
    return undefined;
  }
  return candidate;
}

function requiredArray(
  value: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): unknown[] | undefined {
  const candidate = value[key];
  if (!Array.isArray(candidate)) {
    issues.push({ path: `${path}.${key}`, message: "Expected an array." });
    return undefined;
  }
  return candidate;
}

function optionalEnum<T extends string>(
  value: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
  options: ReadonlySet<T>,
): T | undefined {
  const candidate = value[key];
  if (candidate === undefined) {
    return undefined;
  }
  if (typeof candidate !== "string" || !options.has(candidate as T)) {
    issues.push({ path: `${path}.${key}`, message: `Expected one of: ${Array.from(options).join(", ")}.` });
    return undefined;
  }
  return candidate as T;
}

function failure(
  kind: "invalid-json" | "invalid-schema" | "unsupported-version",
  message: string,
  issues: ValidationIssue[] = [],
): CommandFileParseResult {
  return { ok: false, error: { kind, message, issues } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
