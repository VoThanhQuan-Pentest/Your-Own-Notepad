import type { CommandFile } from "../models/command-file";
import type {
  ParsedWorkerFile,
  SourceFileInput,
  WorkerSearchResult,
  WorkspaceWorkerRequest,
  WorkspaceWorkerResponse,
} from "../models/workspace-worker";
import { createSearchDocument, createSearchTextCache, normalizeSearchText, rankSearchDocuments, type SearchDocument } from "../utils/search";
import { parseCommandFile } from "../utils/validation";

export class WorkspaceWorkerClient {
  private worker: Worker | null = null;
  private requestId = 0;
  private readonly pendingParse = new Map<number, { resolve(value: ParsedWorkerFile[]): void; reject(error: Error): void }>();
  private readonly pendingSearch = new Map<number, { resolve(value: WorkerSearchResult[]): void; reject(error: Error): void }>();
  private readonly fallbackFiles = new Map<string, CommandFile>();
  private fallbackIndex: SearchDocument<WorkerSearchResult>[] = [];
  private fallbackBuild = Promise.resolve();

  constructor() {
    if (new URLSearchParams(window.location.search).has("disable-worker")) return;
    try {
      this.worker = new Worker(new URL("../workers/workspace-worker.ts", import.meta.url), { type: "module" });
      this.worker.addEventListener("message", (event: MessageEvent<WorkspaceWorkerResponse>) => this.onMessage(event.data));
      this.worker.addEventListener("error", () => this.disableWorker("Workspace worker failed."));
    } catch {
      this.worker = null;
    }
  }

  reset(generation: number): void {
    this.fallbackFiles.clear();
    this.fallbackIndex = [];
    this.fallbackBuild = Promise.resolve();
    this.post({ type: "reset", generation });
  }

  async parseFiles(files: SourceFileInput[]): Promise<ParsedWorkerFile[]> {
    if (!this.worker) return this.parseFallback(files);
    const requestId = ++this.requestId;
    return new Promise<ParsedWorkerFile[]>((resolve, reject) => {
      this.pendingParse.set(requestId, { resolve, reject });
      this.post({ type: "parse-files", requestId, files });
    }).catch(() => this.parseFallback(files));
  }

  upsertFiles(files: Array<{ path: string; file: CommandFile }>): void {
    files.forEach(({ path, file }) => this.fallbackFiles.set(path, file));
    if (!this.worker) this.queueFallbackIndexBuild();
    this.post({ type: "upsert-files", files });
  }

  removeFiles(paths: string[]): void {
    paths.forEach((path) => this.fallbackFiles.delete(path));
    if (!this.worker) this.queueFallbackIndexBuild();
    this.post({ type: "remove-files", paths });
  }

  async search(query: string, limit: number): Promise<WorkerSearchResult[]> {
    if (!this.worker) {
      await this.fallbackBuild;
      return rankSearchDocuments(this.searchCandidates(this.fallbackIndex, query), query, limit)
        .map(({ result, matchKind }) => ({ ...result, matchKind }));
    }
    const requestId = ++this.requestId;
    return new Promise<WorkerSearchResult[]>((resolve, reject) => {
      this.pendingSearch.set(requestId, { resolve, reject });
      this.post({ type: "search", requestId, query, limit });
    }).catch(async () => {
      await this.fallbackBuild;
      return rankSearchDocuments(this.searchCandidates(this.fallbackIndex, query), query, limit)
        .map(({ result, matchKind }) => ({ ...result, matchKind }));
    });
  }

  private post(request: WorkspaceWorkerRequest): void {
    this.worker?.postMessage(request);
  }

  private onMessage(response: WorkspaceWorkerResponse): void {
    if (response.type === "parsed-files") {
      const pending = this.pendingParse.get(response.requestId);
      this.pendingParse.delete(response.requestId);
      pending?.resolve(response.results);
      return;
    }
    if (response.type === "search-results") {
      const pending = this.pendingSearch.get(response.requestId);
      this.pendingSearch.delete(response.requestId);
      pending?.resolve(response.results);
      return;
    }
    if (response.requestId !== undefined) {
      const pending = this.pendingParse.get(response.requestId) ?? this.pendingSearch.get(response.requestId);
      this.pendingParse.delete(response.requestId);
      this.pendingSearch.delete(response.requestId);
      pending?.reject(new Error(response.message));
    }
  }

  private disableWorker(message: string): void {
    this.worker?.terminate();
    this.worker = null;
    const error = new Error(message);
    this.pendingParse.forEach(({ reject }) => reject(error));
    this.pendingSearch.forEach(({ reject }) => reject(error));
    this.pendingParse.clear();
    this.pendingSearch.clear();
    this.queueFallbackIndexBuild();
  }

  private async parseFallback(files: SourceFileInput[]): Promise<ParsedWorkerFile[]> {
    const results: ParsedWorkerFile[] = [];
    let sliceStarted = performance.now();
    for (const { path, source } of files) {
      const parsed = parseCommandFile(source);
      results.push(parsed.ok
        ? { path, ok: true, file: parsed.data, needsMigration: parsed.needsMigration }
        : { path, ok: false, message: parsed.error.message, issues: parsed.error.issues });
      if (performance.now() - sliceStarted >= 8) {
        await yieldToMain();
        sliceStarted = performance.now();
      }
    }
    return results;
  }

  private queueFallbackIndexBuild(): void {
    this.fallbackBuild = this.fallbackBuild.then(() => this.rebuildFallbackIndex());
  }

  private async rebuildFallbackIndex(): Promise<void> {
    const records: SearchDocument<WorkerSearchResult>[] = [];
    const cache = createSearchTextCache();
    let order = 0;
    let processed = 0;
    let sliceStarted = performance.now();
    for (const [filePath, file] of this.fallbackFiles) {
      records.push(createSearchDocument({ filePath, fileTitle: file.title }, [
        { text: file.title, priority: 3 }, { text: file.description, priority: 1 },
      ], order++, cache));
      for (const section of file.sections) {
        records.push(createSearchDocument({ filePath, fileTitle: file.title, sectionId: section.id, sectionTitle: section.title }, [
          { text: section.title, priority: 3 }, { text: file.title, priority: 2 },
        ], order++, cache));
        for (const command of section.commands) {
          records.push(createSearchDocument({
            filePath, fileTitle: file.title, sectionId: section.id, sectionTitle: section.title,
            commandId: command.id, commandName: command.name, command: command.command,
          }, [
            { text: command.name, priority: 3 }, { text: command.command, priority: 3 },
            { text: section.title, priority: 2 }, { text: file.title, priority: 2 },
            { text: command.description, priority: 1 }, { text: command.example, priority: 1 },
            { text: command.notes, priority: 1 },
          ], order++, cache));
          processed += 1;
          if (processed % 200 === 0 || performance.now() - sliceStarted >= 8) {
            await yieldToMain();
            sliceStarted = performance.now();
          }
        }
      }
    }
    this.fallbackIndex = records;
  }

  private searchCandidates(
    documents: SearchDocument<WorkerSearchResult>[],
    query: string,
  ): SearchDocument<WorkerSearchResult>[] {
    const normalized = normalizeSearchText(query);
    if (!normalized) return documents;
    const exact = documents.filter((document) =>
      document.fields.some((field) => field.text.normalized.includes(normalized)),
    );
    return exact.length > 0 ? exact : documents;
  }
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}
