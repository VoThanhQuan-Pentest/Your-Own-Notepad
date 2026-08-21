import type {
  CommandAction,
  CommandEntry,
  CommandFile,
  CommandRisk,
  CommandSection,
  CommandSectionLayout,
  CommandVariable,
} from "../models/command-file.ts";

const SUPPORTED_VERSION = 1;
const ACTIONS = new Set<CommandAction>(["copy", "run", "open", "open-terminal"]);
const RISKS = new Set<CommandRisk>(["safe", "caution", "danger"]);
const SECTION_LAYOUTS = new Set<CommandSectionLayout>(["standard", "table"]);

export interface ValidationIssue {
  path: string;
  message: string;
}

export type CommandFileParseResult =
  | { ok: true; data: CommandFile }
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

  if (typeof value.version === "number" && value.version !== SUPPORTED_VERSION) {
    return failure(
      "unsupported-version",
      `Command Vault supports file version ${SUPPORTED_VERSION}, but this file uses version ${value.version}.`,
      [{ path: "$.version", message: `Expected ${SUPPORTED_VERSION}.` }],
    );
  }

  const version = requiredNumber(value, "version", "$", issues);
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
    );
    if (section) {
      sections.push(section);
    }
  });

  if (issues.length > 0 || version === undefined || title === undefined) {
    return failure(
      "invalid-schema",
      `The command file has ${issues.length} schema ${issues.length === 1 ? "error" : "errors"}.`,
      issues,
    );
  }

  return {
    ok: true,
    data: {
      version,
      title,
      ...(description === undefined ? {} : { description }),
      sections,
    },
  };
}

export function serializeCommandFile(file: CommandFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

function readSection(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  sectionIds: Set<string>,
  commandIds: Set<string>,
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

  if (id && sectionIds.has(id)) {
    issues.push({ path: `${path}.id`, message: `Duplicate section id "${id}".` });
  } else if (id) {
    sectionIds.add(id);
  }

  commandsValue?.forEach((commandValue, index) => {
    const command = readCommand(
      commandValue,
      `${path}.commands[${index}]`,
      issues,
      commandIds,
    );
    if (command) {
      commands.push(command);
    }
  });

  if (id === undefined || title === undefined || commandsValue === undefined) {
    return undefined;
  }

  return {
    id,
    title,
    ...(layout === undefined ? {} : { layout }),
    commands,
  };
}

function readCommand(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  commandIds: Set<string>,
): CommandEntry | undefined {
  if (!isRecord(value)) {
    issues.push({ path, message: "Expected a command object." });
    return undefined;
  }

  const id = requiredString(value, "id", path, issues, true);
  const name = requiredString(value, "name", path, issues, true);
  const command = requiredString(value, "command", path, issues, true);
  const action = requiredEnum(value, "action", path, issues, ACTIONS);
  const risk = requiredEnum(value, "risk", path, issues, RISKS);
  const description = optionalString(value, "description", path, issues);
  const syntax = optionalString(value, "syntax", path, issues);
  const example = optionalString(value, "example", path, issues);
  const notes = optionalString(value, "notes", path, issues);
  const variablesValue = optionalArray(value, "variables", path, issues);
  const variables: CommandVariable[] = [];
  const variableNames = new Set<string>();

  if (id && commandIds.has(id)) {
    issues.push({ path: `${path}.id`, message: `Duplicate command id "${id}".` });
  } else if (id) {
    commandIds.add(id);
  }

  variablesValue?.forEach((variableValue, index) => {
    const variable = readVariable(
      variableValue,
      `${path}.variables[${index}]`,
      issues,
      variableNames,
    );
    if (variable) {
      variables.push(variable);
    }
  });

  if (
    id === undefined ||
    name === undefined ||
    command === undefined ||
    action === undefined ||
    risk === undefined
  ) {
    return undefined;
  }

  return {
    id,
    name,
    command,
    action,
    risk,
    ...(description === undefined ? {} : { description }),
    ...(syntax === undefined ? {} : { syntax }),
    ...(example === undefined ? {} : { example }),
    ...(notes === undefined ? {} : { notes }),
    ...(variablesValue === undefined ? {} : { variables }),
  };
}

function readVariable(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  names: Set<string>,
): CommandVariable | undefined {
  if (!isRecord(value)) {
    issues.push({ path, message: "Expected a variable object." });
    return undefined;
  }

  const name = requiredString(value, "name", path, issues, true);
  const defaultValue = optionalString(value, "default", path, issues);

  if (name && !/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) {
    issues.push({
      path: `${path}.name`,
      message: "Use letters, numbers, underscores, or hyphens and start with a letter.",
    });
  }

  if (name && names.has(name)) {
    issues.push({ path: `${path}.name`, message: `Duplicate variable name "${name}".` });
  } else if (name) {
    names.add(name);
  }

  if (name === undefined) {
    return undefined;
  }

  return {
    name,
    ...(defaultValue === undefined ? {} : { default: defaultValue }),
  };
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

function optionalArray(
  value: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): unknown[] | undefined {
  if (value[key] === undefined) {
    return undefined;
  }
  return requiredArray(value, key, path, issues);
}

function requiredEnum<T extends string>(
  value: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
  options: ReadonlySet<T>,
): T | undefined {
  const candidate = value[key];
  if (typeof candidate !== "string" || !options.has(candidate as T)) {
    issues.push({
      path: `${path}.${key}`,
      message: `Expected one of: ${Array.from(options).join(", ")}.`,
    });
    return undefined;
  }
  return candidate as T;
}

function optionalEnum<T extends string>(
  value: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
  options: ReadonlySet<T>,
): T | undefined {
  if (value[key] === undefined) {
    return undefined;
  }
  return requiredEnum(value, key, path, issues, options);
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
