import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";

import type { FilesystemEntry } from "../models/filesystem";
import { defaultSettings, type AppSettings } from "../models/settings";

interface MockState {
  folders: string[];
  files: Record<string, string>;
  settings: AppSettings;
  calls: string[];
}

const STORAGE_KEY = "command-vault.e2e-state";
const WORKSPACE = "/e2e/CommandVault";
const parameters = new URLSearchParams(window.location.search);
if (parameters.has("reset")) {
  sessionStorage.removeItem(STORAGE_KEY);
}
let state = loadState();

mockWindows("main");
mockIPC((command, rawPayload) => {
  state.calls.push(command);
  persist();
  const payload = (rawPayload ?? {}) as Record<string, unknown>;
  switch (command) {
    case "load_settings":
      return structuredClone(state.settings);
    case "save_settings":
      state.settings = structuredClone(payload.settings as AppSettings);
      persist();
      return null;
    case "plugin:app|version":
      return "0.7.0-test";
    case "list_directory":
      return buildTree(String(payload.workspaceRoot));
    case "read_command_file":
      return readFile(String(payload.filePath));
    case "write_command_file":
      return writeFile(
        String(payload.filePath),
        String(payload.content),
        String(payload.expectedContent),
      );
    case "create_folder":
      return createFolder(String(payload.parentPath), String(payload.name));
    case "create_command_file":
      return createFile(String(payload.parentPath), String(payload.name));
    case "rename_entry":
      return renameEntry(String(payload.entryPath), String(payload.newName));
    case "trash_entry":
      deleteEntry(String(payload.entryPath), true);
      return null;
    case "plugin:dialog|open":
      return WORKSPACE;
    default:
      if (command.startsWith("plugin:dialog|")) {
        return WORKSPACE;
      }
      throw { code: "UNMOCKED_COMMAND", message: `No E2E handler for ${command}.` };
  }
});

Object.defineProperty(window, "__COMMAND_VAULT_E2E__", {
  configurable: true,
  get: () => structuredClone(state),
});
exposeState();

await import("../main");

function loadState(): MockState {
  const source = sessionStorage.getItem(STORAGE_KEY);
  if (source) {
    const loaded = JSON.parse(source) as MockState;
    return { ...loaded, calls: loaded.calls ?? [] };
  }
  const initial: MockState = {
    folders: [WORKSPACE],
    files: {},
    settings: structuredClone(defaultSettings),
    calls: [],
  };
  if (parameters.get("fixture") === "basic") {
    const path = `${WORKSPACE}/Nmap.cmdnote`;
    const gitPath = `${WORKSPACE}/Git.cmdnote`;
    initial.files[path] = `${JSON.stringify({
      version: 2,
      title: "Nmap",
      description: "Network commands",
      sections: [
        {
          id: "discovery",
          title: "Discovery",
          commands: [
            {
              id: "ping-scan",
              name: "Ping Scan",
              command: "nmap -sn 192.168.1.0/24",
              description: "Discover active hosts.",
              example: "nmap -sn 192.168.1.0/24",
              notes: "Authorized networks only.",
            },
            {
              id: "arp-scan",
              name: "ARP Scan",
              command: "nmap -PR 192.168.1.0/24",
              description: "Discover local hosts with ARP.",
              example: "nmap -PR 192.168.1.0/24",
              notes: "Local network only.",
            },
          ],
        },
        {
          id: "archive",
          title: "Archive",
          layout: "table",
          commands: [],
        },
      ],
    }, null, 2)}\n`;
    initial.settings.lastWorkspace = WORKSPACE;
    initial.settings.lastOpenedFile = path;
    initial.files[gitPath] = `${JSON.stringify({
      version: 2,
      title: "Git",
      description: "Git commands",
      sections: [],
    }, null, 2)}\n`;
  }
  return initial;
}

function persist(): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  exposeState();
}

function exposeState(): void {
  let output = document.querySelector<HTMLOutputElement>("#e2e-state");
  if (!output) {
    output = document.createElement("output");
    output.id = "e2e-state";
    output.hidden = true;
    document.body.append(output);
  }
  output.dataset.state = JSON.stringify(state);
}

function buildTree(root: string): FilesystemEntry[] {
  assert(root === WORKSPACE, "Unexpected workspace root.");
  return childrenOf(root);
}

function childrenOf(parent: string): FilesystemEntry[] {
  const folders = state.folders
    .filter((path) => path !== parent && parentPath(path) === parent)
    .map((path) => ({
      name: basename(path),
      path,
      kind: "folder" as const,
      children: childrenOf(path),
    }));
  const files = Object.keys(state.files)
    .filter((path) => parentPath(path) === parent)
    .map((path) => ({
      name: basename(path),
      path,
      kind: "command-file" as const,
      children: [],
    }));
  return [...folders, ...files].sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "folder" ? -1 : 1;
    return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  });
}

function readFile(path: string): string {
  const source = state.files[path];
  if (source === undefined) throw { code: "NOT_FOUND", message: "File not found." };
  return source;
}

function writeFile(path: string, source: string, expected: string): string {
  if (readFile(path) !== expected) {
    throw { code: "FILE_CHANGED", message: "File changed on disk." };
  }
  const normalized = `${JSON.stringify(JSON.parse(source), null, 2)}\n`;
  state.files[path] = normalized;
  persist();
  return normalized;
}

function createFolder(parent: string, name: string): { path: string } {
  const path = join(parent, name.trim());
  assert(!state.folders.includes(path) && state.files[path] === undefined, "Entry exists.");
  state.folders.push(path);
  persist();
  return { path };
}

function createFile(parent: string, name: string): { path: string } {
  const cleanName = name.toLocaleLowerCase().endsWith(".cmdnote") ? name : `${name}.cmdnote`;
  const path = join(parent, cleanName);
  assert(!state.folders.includes(path) && state.files[path] === undefined, "Entry exists.");
  state.files[path] = `${JSON.stringify(
    { version: 2, title: cleanName.replace(/\.cmdnote$/i, ""), description: "", sections: [] },
    null,
    2,
  )}\n`;
  persist();
  return { path };
}

function renameEntry(source: string, newName: string): { path: string } {
  if (state.files[source] !== undefined) {
    const fileName = newName.toLocaleLowerCase().endsWith(".cmdnote")
      ? newName
      : `${newName}.cmdnote`;
    const target = join(parentPath(source), fileName);
    state.files[target] = state.files[source] as string;
    delete state.files[source];
    persist();
    return { path: target };
  }

  assert(state.folders.includes(source), "Entry not found.");
  const target = join(parentPath(source), newName);
  state.folders = state.folders.map((path) => remap(source, target, path));
  state.files = Object.fromEntries(
    Object.entries(state.files).map(([path, value]) => [remap(source, target, path), value]),
  );
  persist();
  return { path: target };
}

function deleteEntry(path: string, recursive: boolean): void {
  if (state.files[path] !== undefined) {
    delete state.files[path];
    persist();
    return;
  }
  const hasChildren =
    state.folders.some((candidate) => candidate !== path && isDescendant(path, candidate)) ||
    Object.keys(state.files).some((candidate) => isDescendant(path, candidate));
  if (hasChildren && !recursive) {
    throw { code: "FOLDER_NOT_EMPTY", message: "Folder is not empty." };
  }
  state.folders = state.folders.filter(
    (candidate) => candidate !== path && !isDescendant(path, candidate),
  );
  state.files = Object.fromEntries(
    Object.entries(state.files).filter(([candidate]) => !isDescendant(path, candidate)),
  );
  persist();
}

function remap(oldRoot: string, newRoot: string, path: string): string {
  return path === oldRoot || isDescendant(oldRoot, path)
    ? `${newRoot}${path.slice(oldRoot.length)}`
    : path;
}

function isDescendant(parent: string, candidate: string): boolean {
  return candidate.startsWith(`${parent}/`);
}

function join(parent: string, name: string): string {
  return `${parent.replace(/\/$/, "")}/${name}`;
}

function parentPath(path: string): string {
  return path.slice(0, path.lastIndexOf("/"));
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw { code: "E2E_ASSERTION", message };
}
