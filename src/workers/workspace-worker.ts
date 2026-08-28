/// <reference lib="webworker" />

import type { CommandFile } from "../models/command-file";
import type {
  ParsedWorkerFile,
  WorkerSearchResult,
  WorkspaceWorkerRequest,
  WorkspaceWorkerResponse,
} from "../models/workspace-worker";
import { createSearchDocument, createSearchTextCache, normalizeSearchText, rankSearchDocuments, type SearchDocument } from "../utils/search";
import { parseCommandFile } from "../utils/validation";

const files = new Map<string, CommandFile>();
const documentsByFile = new Map<string, SearchDocument<WorkerSearchResult>[]>();
let index: SearchDocument<WorkerSearchResult>[] = [];
let tokenIndex = new Map<string, Set<SearchDocument<WorkerSearchResult>>>();
let indexBuild = Promise.resolve();

self.addEventListener("message", (event: MessageEvent<WorkspaceWorkerRequest>) => {
  void handleRequest(event.data);
});

async function handleRequest(request: WorkspaceWorkerRequest): Promise<void> {
  try {
    if (request.type === "reset") {
      files.clear();
      documentsByFile.clear();
      index = [];
      tokenIndex = new Map();
      indexBuild = Promise.resolve();
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
      request.files.forEach(({ path, file }) => files.set(path, file));
      indexBuild = indexBuild.then(async () => {
        for (const { path, file } of request.files) {
          documentsByFile.set(path, await buildFileDocuments(path, file));
        }
        flattenIndex();
      });
      return;
    }
    if (request.type === "remove-files") {
      request.paths.forEach((path) => files.delete(path));
      indexBuild = indexBuild.then(() => {
        request.paths.forEach((path) => documentsByFile.delete(path));
        flattenIndex();
      });
      return;
    }
    await indexBuild;
    const normalizedQuery = normalizeSearchText(request.query);
    const queryTokens = normalizedQuery ? [...new Set(normalizedQuery.split(" "))] : [];
    const indexedSets = queryTokens.map((token) => tokenIndex.get(token)).filter(Boolean) as Array<Set<SearchDocument<WorkerSearchResult>>>;
    let exactCandidates: SearchDocument<WorkerSearchResult>[] = [];
    if (indexedSets.length === queryTokens.length && indexedSets.length > 0) {
      const [smallest, ...rest] = [...indexedSets].sort((left, right) => left.size - right.size);
      exactCandidates = [...smallest].filter((document) => rest.every((set) => set.has(document)));
    }
    const ranked = rankSearchDocuments(
      exactCandidates.length > 0 ? exactCandidates : index,
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
    for (const command of section.commands) {
      records.push(createSearchDocument(
        {
          filePath,
          fileTitle: file.title,
          sectionId: section.id,
          sectionTitle: section.title,
          commandId: command.id,
          commandName: command.name,
          command: command.command,
        },
        [
          { text: command.name, priority: 3 }, { text: command.command, priority: 3 },
          { text: section.title, priority: 2 }, { text: file.title, priority: 2 },
          { text: command.description, priority: 1 }, { text: command.example, priority: 1 },
          { text: command.notes, priority: 1 },
        ],
        order++,
        cache,
      ));
      processed += 1;
      if (processed % 200 === 0 || performance.now() - sliceStarted >= 8) {
        await workerYield();
        sliceStarted = performance.now();
      }
    }
  }
  return records;
}

function flattenIndex(): void {
  index = [...documentsByFile.values()].flat();
  tokenIndex = new Map();
  index.forEach((document, order) => {
    document.order = order;
    const tokens = new Set(document.fields.flatMap((field) => field.text.tokens));
    tokens.forEach((token) => {
      let documents = tokenIndex.get(token);
      if (!documents) {
        documents = new Set();
        tokenIndex.set(token, documents);
      }
      documents.add(document);
    });
  });
}

function workerYield(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function post(response: WorkspaceWorkerResponse): void {
  self.postMessage(response);
}
