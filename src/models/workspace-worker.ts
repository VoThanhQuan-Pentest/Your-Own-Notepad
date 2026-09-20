import type { CommandFile } from "./command-file";
import type { ValidationIssue } from "../utils/validation";

export interface SourceFileInput {
  path: string;
  source: string;
}

export type ParsedWorkerFile =
  | { path: string; ok: true; file: CommandFile; needsMigration: boolean }
  | { path: string; ok: false; message: string; issues: ValidationIssue[] };

export interface WorkerSearchResult {
  filePath: string;
  fileTitle: string;
  sectionId?: string;
  sectionTitle?: string;
  commandId?: string;
  commandName?: string;
  command?: string;
  matchKind?: "exact" | "near";
}

export interface WorkerProfileConfig {
  batchSize: number;
  yieldMs: number;
}

export type WorkspaceWorkerRequest =
  | { type: "reset"; generation: number }
  | { type: "configure"; generation: number; profile: WorkerProfileConfig }
  | { type: "parse-files"; requestId: number; files: SourceFileInput[] }
  | { type: "upsert-files"; files: Array<{ path: string; file: CommandFile }> }
  | { type: "remove-files"; paths: string[] }
  | { type: "search"; requestId: number; query: string; limit: number };

export type WorkspaceWorkerResponse =
  | { type: "parsed-files"; requestId: number; results: ParsedWorkerFile[] }
  | { type: "search-results"; requestId: number; results: WorkerSearchResult[] }
  | { type: "worker-error"; requestId?: number; message: string };
