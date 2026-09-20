/// <reference lib="webworker" />

import type { CommandFile } from "../models/command-file";
import type {
  ParsedWorkerFile,
  WorkerSearchResult,
  WorkspaceWorkerRequest,
  WorkspaceWorkerResponse,
} from "../models/workspace-worker";
import { createSearchDocument, createSearchTextCache, rankSearchDocuments, selectSearchCandidates, type SearchDocument } from "../utils/search";
import { parseCommandFile } from "../utils/validation";

const files = new Map<string, CommandFile>();
const documentsByFile = new Map<string, SearchDocument<WorkerSearchResult>[]>();
let index: SearchDocument<WorkerSearchResult>[] = [];
let indexBuild = Promise.resolve();
let currentGeneration = 0;
let workerBatchSize = 200;
let workerYieldMs = 8;

self.addEventListener("message", (event: MessageEvent<WorkspaceWorkerRequest>) => {
  void handleRequest(event.data);
});

async function handleRequest(request: WorkspaceWorkerRequest): Promise<void> {
  try {
    if (request.type === "reset") {
      currentGeneration = request.generation;
      files.clear();
      documentsByFile.clear();
      index = [];
      indexBuild = Promise.resolve();
      return;
    }
    if (request.type === "configure") {
      if (request.generation >= currentGeneration) {
        workerBatchSize = request.profile.batchSize;
        workerYieldMs = request.profile.yieldMs;
      }
      return;
    }
    if (request.type === "parse-files") {
      const results = request.files.map<ParsedWorkerFile>(({ path, source }) => {
        const parsed = parseCommandFile(source);
        return parsed.ok
          ? { path, ok: true, file: parsed.data, needsMigration: parsed.needsMigration }
          : {
              path,
              ok: false,
              message: parsed.error.message,
              issues: parsed.error.issues,
            };
      });
      post({ type: "parsed-files", requestId: request.requestId, results });
      return;
    }
    if (request.type === "upsert-files") {
      const generation = currentGeneration;
      request.files.forEach(({ path, file }) => files.set(path, file));
      indexBuild = indexBuild.then(async () => {
        if (generation !== currentGeneration) {
          return;
        }
        for (const { path, file } of request.files) {
          const docs = await buildFileDocuments(path, file, generation);
          if (generation !== currentGeneration) {
            return;
          }
          documentsByFile.set(path, docs);
        }
        if (generation !== currentGeneration) {
          return;
        }
        flattenIndex();
      });
      return;
    }
    if (request.type === "remove-files") {
      const generation = currentGeneration;
      request.paths.forEach((path) => files.delete(path));
      indexBuild = indexBuild.then(() => {
        if (generation !== currentGeneration) {
          return;
        }
        request.paths.forEach((path) => documentsByFile.delete(path));
        flattenIndex();
      });
      return;
    }
    const generation = currentGeneration;
    await indexBuild;
    if (generation !== currentGeneration) {
      return;
    }
    const ranked = rankSearchDocuments(
      selectSearchCandidates(index, request.query),
      request.query,
      request.limit,
    );
    post({
      type: "search-results",
      requestId: request.requestId,
      results: ranked.map(({ result, matchKind }) => ({ ...result, matchKind })),
    });
  } catch (error) {
    post({
      type: "worker-error",
      requestId: "requestId" in request ? request.requestId : undefined,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function buildFileDocuments(
  filePath: string,
  file: CommandFile,
  generation: number,
): Promise<SearchDocument<WorkerSearchResult>[]> {
  const records: SearchDocument<WorkerSearchResult>[] = [];
  const cache = createSearchTextCache();
  let order = 0;
  records.push(createSearchDocument(
    { filePath, fileTitle: file.title },
    [{ text: file.title, priority: 3 }, { text: file.description, priority: 1 }],
    order++,
    cache,
  ));
  let processed = 0;
  let sliceStarted = performance.now();
  for (const section of file.sections) {
    records.push(createSearchDocument(
      { filePath, fileTitle: file.title, sectionId: section.id, sectionTitle: section.title },
      [{ text: section.title, priority: 3 }, { text: file.title, priority: 2 }],
      order++,
      cache,
    ));
    const isTable = section.layout === "table";
    for (const [commandIndex, command] of section.commands.entries()) {
      const displayCommandName = isTable
        ? `Table Row ${String(commandIndex + 1).padStart(2, "0")}`
        : command.name;
      records.push(createSearchDocument(
        {
          filePath,
          fileTitle: file.title,
          sectionId: section.id,
          sectionTitle: section.title,
          commandId: command.id,
          commandName: displayCommandName,
          command: command.command,
        },
        [
          { text: displayCommandName, priority: 3 },
          ...(command.name !== displayCommandName ? [{ text: command.name, priority: 3 as const }] : []),
          { text: command.command, priority: 3 },
          { text: section.title, priority: 2 },
          { text: file.title, priority: 2 },
          { text: command.description, priority: 1 },
          { text: command.example, priority: 1 },
          { text: command.notes, priority: 1 },
        ],
        order++,
        cache,
      ));
      processed += 1;
      if (processed % workerBatchSize === 0 || performance.now() - sliceStarted >= workerYieldMs) {
        await workerYield();
        if (generation !== currentGeneration) {
          return [];
        }
        sliceStarted = performance.now();
      }
    }
  }
  return records;
}

function flattenIndex(): void {
  index = [...documentsByFile.values()].flat();
  index.forEach((document, order) => {
    document.order = order;
  });
}

function workerYield(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function post(response: WorkspaceWorkerResponse): void {
  self.postMessage(response);
}
