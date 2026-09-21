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
      return "0.16.0-test";
    case "get_power_profile":
      return parameters.has("system-power-saver") ? "power-saver" : "performance";
    case "list_directory":
      return buildTree(String(payload.workspaceRoot));
    case "read_command_file":
      return readFileForIpc(String(payload.filePath));
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
  if (parameters.has("interrupted-startup")) {
    initial.settings.startupInProgress = true;
  }
  if (parameters.has("last-performance")) {
    initial.settings.lastStartupMode = "performance";
  } else if (parameters.has("last-battery")) {
    initial.settings.lastStartupMode = "battery-saver";
  }
  if (parameters.get("fixture") === "basic") {
    initial.settings.displayName = "Tester";
    initial.settings.performanceMode = parameters.has("auto-performance") ? "auto" : "full";
    initial.settings.startupModePreference = parameters.has("ask-startup")
      ? "ask"
      : ((parameters.get("startup-preference") as any) ?? "performance");
    if (!initial.settings.lastStartupMode) {
      initial.settings.lastStartupMode = "performance";
    }
    const path = `${WORKSPACE}/Nmap.cmdnote`;
    const gitPath = `${WORKSPACE}/Git.cmdnote`;
    initial.folders.push(`${WORKSPACE}/References`, `${WORKSPACE}/References/Nested`);
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
              example: [
                "nmap -sn 192.168.1.0/24",
                "nmap -sV 192.168.1.10",
                "nmap -p 22,80,443 192.168.1.10",
                "nmap --script banner 192.168.1.10",
                "nmap -O 192.168.1.10",
                "nmap -A 192.168.1.10",
                "nmap --reason 192.168.1.10",
                "nmap --traceroute 192.168.1.10",
              ].join("\n"),
              notes: "Authorized networks only.",
            },
            {
              id: "arp-scan",
              name: "ARP Scan",
              command: "nmap -PR 192.168.1.0/24",
              description: "Discover local hosts with ARP.",
              example: [
                "nmap -PR 192.168.1.0/24",
                "arp-scan --localnet",
                "ip neigh show",
                "arp -an",
                "nmap -sn --send-eth 192.168.1.0/24",
                "nmap --packet-trace -PR 192.168.1.10",
                "nmap --reason -PR 192.168.1.10",
              ].join("\n"),
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
        {
          id: "reorder-table",
          title: "Reorder Table",
          layout: "table",
          commands: [
            { id: "table-alpha", name: "Alpha", command: "echo alpha", description: "Alpha row." },
            { id: "table-beta", name: "Beta", command: "echo beta", description: "Beta row." },
            { id: "table-gamma", name: "Gamma", command: "echo gamma", description: "Gamma row." },
          ],
        },
      ],
    }, null, 2)}\n`;
    initial.settings.lastWorkspace = WORKSPACE;
    initial.settings.lastOpenedFile = path;
    initial.files[gitPath] = `${JSON.stringify({
      version: 2,
      title: "Git",
      description: "Git commands",
      sections: [
        {
          id: "example-cases",
          title: "Example Cases",
          commands: [
            {
              id: "example-one-line",
              name: "One Line Example",
              command: "echo one",
              description: "One line.",
              example: "echo one",
            },
            {
              id: "example-six-lines",
              name: "Six Line Example",
              command: "echo six",
              description: "Exactly six lines.",
              example: Array.from({ length: 6 }, (_, index) => `echo line-${index + 1}`).join("\n"),
            },
            {
              id: "example-fifty-lines",
              name: "Fifty Line Example",
              command: "echo fifty",
              description: "Fifty lines.",
              example: Array.from({ length: 50 }, (_, index) => `echo line-${String(index + 1).padStart(2, "0")}`).join("\n"),
            },
          ],
        },
        {
          id: "table-example-cases",
          title: "Table Example Cases",
          layout: "table",
          commands: [
            {
              id: "table-multiline-example",
              name: "Table Row 1",
              command: "git log --oneline",
              description: "Compact multiline example.",
              example: Array.from({ length: 8 }, (_, index) => `git show commit-${index + 1}`).join("\n"),
            },
          ],
        },
      ],
    }, null, 2)}\n`;
  }
  if (parameters.has("large-tree")) {
    Array.from({ length: 30 }, (_, index) => index + 1).forEach((number) => {
      const suffix = String(number).padStart(2, "0");
      const folder = `${WORKSPACE}/Long Folder ${suffix}`;
      const file = `${folder}/Long File ${suffix}.cmdnote`;
      initial.folders.push(folder);
      initial.files[file] = `${JSON.stringify({
        version: 2,
        title: `Long File ${suffix}`,
        description: "Explorer viewport fixture",
        sections: [{
          id: `long-section-${suffix}`,
          title: `Long Section ${suffix}`,
          commands: [{
            id: `long-command-${suffix}`,
            name: `Long Command ${suffix}`,
            command: `echo ${suffix}`,
            description: "Viewport test command.",
          }],
        }],
      }, null, 2)}\n`;
    });
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
      revision: null,
    }));
  const files = Object.keys(state.files)
    .filter((path) => parentPath(path) === parent)
    .map((path) => ({
      name: basename(path),
      path,
      kind: "command-file" as const,
      children: [],
      revision: revisionFor(path),
    }));
  return [...folders, ...files].sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "folder" ? -1 : 1;
    return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  });
}

function revisionFor(path: string): string {
  const source = state.files[path] ?? "";
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${source.length}:${hash >>> 0}`;
}

function readFile(path: string): string {
  const source = state.files[path];
  if (source === undefined) throw { code: "NOT_FOUND", message: "File not found." };
  return source;
}

function readFileForIpc(path: string): string | Promise<string> {
  if (!parameters.has("slow-files")) {
    return readFile(path);
  }
  const delay = path.endsWith("Git.cmdnote") ? 180 : 15;
  return new Promise((resolve) => window.setTimeout(() => resolve(readFile(path)), delay));
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
