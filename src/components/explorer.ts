import type { FilesystemEntry } from "../models/filesystem";
import { button, element } from "../utils/dom";
import { openMenu } from "./menu";

interface ExplorerCallbacks {
  onOpenFile(path: string): void;
  onSelectFolder(path: string): void;
  onCreateFolder(parentPath: string): void;
  onCreateFile(parentPath: string): void;
  onRename(entry: FilesystemEntry): void;
  onDelete(entry: FilesystemEntry): void;
  onRefresh(): void;
}

interface ExplorerOptions {
  workspaceRoot: string | null;
  entries: FilesystemEntry[];
  activeFile: string | null;
  selectedFolder: string | null;
  expandedFolders: ReadonlySet<string>;
  callbacks: ExplorerCallbacks;
}

export function createExplorer(options: ExplorerOptions): HTMLElement {
  const explorer = element("aside", "explorer");
  explorer.setAttribute("aria-label", "Workspace explorer");

  const header = element("div", "explorer-header");
  header.append(element("h2", undefined, "EXPLORER"));

  const menu = button("icon-button compact", "⋯");
  menu.title = "Explorer actions";
  menu.setAttribute("aria-label", "Explorer actions");
  menu.addEventListener("click", () => {
    const parent = options.selectedFolder ?? options.workspaceRoot;
    openMenu(menu, [
      {
        label: "New Folder",
        disabled: !parent,
        action: () => {
          if (parent) options.callbacks.onCreateFolder(parent);
        },
      },
      {
        label: "New Command File",
        disabled: !parent,
        action: () => {
          if (parent) options.callbacks.onCreateFile(parent);
        },
      },
      { label: "Refresh", disabled: !options.workspaceRoot, action: options.callbacks.onRefresh },
    ]);
  });
  header.append(menu);

  const content = element("nav", "explorer-content");
  content.setAttribute("aria-label", "Command files");
  if (!options.workspaceRoot) {
    content.append(element("p", "explorer-empty", "Open a workspace to browse command files."));
  } else if (options.entries.length === 0) {
    content.append(element("p", "explorer-empty", "This workspace has no folders or .cmdnote files yet."));
  } else {
    options.entries.forEach((entry) => content.append(createEntry(entry, 0, options)));
  }

  explorer.append(header, content);
  return explorer;
}

function createEntry(entry: FilesystemEntry, depth: number, options: ExplorerOptions): HTMLElement {
  if (entry.kind === "command-file") {
    return createFile(entry, depth, options);
  }

  const group = element("section", "tree-group");
  const row = element(
    "div",
    `tree-entry-row folder-row${entry.path === options.selectedFolder ? " selected" : ""}`,
  );
  row.style.paddingLeft = `${4 + depth * 14}px`;

  const expanded = options.expandedFolders.has(entry.path);
  const folderButton = button("tree-folder", "");
  folderButton.setAttribute("aria-expanded", String(expanded));
  const chevron = element("span", "tree-chevron", expanded ? "▾" : "▸");
  chevron.setAttribute("aria-hidden", "true");
  folderButton.append(chevron, element("span", "tree-label", entry.name));
  folderButton.addEventListener("click", () => options.callbacks.onSelectFolder(entry.path));

  const menuButton = entryMenuButton(entry, options);
  row.append(folderButton, menuButton);
  group.append(row);

  if (expanded) {
    const children = element("div", "tree-files");
    entry.children.forEach((child) => children.append(createEntry(child, depth + 1, options)));
    group.append(children);
  }
  return group;
}

function createFile(entry: FilesystemEntry, depth: number, options: ExplorerOptions): HTMLElement {
  const row = element(
    "div",
    `tree-entry-row file-row${entry.path === options.activeFile ? " active" : ""}`,
  );
  row.style.paddingLeft = `${22 + depth * 14}px`;

  const label = entry.name.replace(/\.cmdnote$/i, "");
  const fileButton = button("tree-file", label);
  if (entry.path === options.activeFile) {
    fileButton.setAttribute("aria-current", "page");
  }
  fileButton.addEventListener("click", () => options.callbacks.onOpenFile(entry.path));
  row.append(fileButton, entryMenuButton(entry, options));
  return row;
}

function entryMenuButton(entry: FilesystemEntry, options: ExplorerOptions): HTMLButtonElement {
  const menu = button("tree-entry-menu", "⋮");
  menu.title = `Actions for ${entry.name}`;
  menu.setAttribute("aria-label", `Actions for ${entry.name}`);
  menu.addEventListener("click", () => {
    const items = [];
    if (entry.kind === "folder") {
      items.push(
        { label: "New Folder", action: () => options.callbacks.onCreateFolder(entry.path) },
        { label: "New Command File", action: () => options.callbacks.onCreateFile(entry.path) },
      );
    }
    items.push(
      { label: "Rename", action: () => options.callbacks.onRename(entry) },
      { label: "Delete", danger: true, action: () => options.callbacks.onDelete(entry) },
    );
    openMenu(menu, items);
  });
  return menu;
}
