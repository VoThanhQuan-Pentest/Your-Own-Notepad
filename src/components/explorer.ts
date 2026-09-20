import type { FilesystemEntry } from "../models/filesystem";
import { favoriteKey, type FavoriteItem } from "../models/settings";
import { button, element } from "../utils/dom";
import { openMenu } from "./menu";
import { createIcon } from "./icons";

interface ExplorerCallbacks {
  onOpenFile(path: string): void;
  onSelectFolder(path: string): void;
  onCreateFolder(parentPath: string): void;
  onCreateFile(parentPath: string): void;
  onRename(entry: FilesystemEntry): void;
  onDelete(entry: FilesystemEntry): void;
  onToggleFileFavorite(path: string): void;
  onToggleFolderFavorite(path: string): void;
  onOpenFavoriteFolder(path: string): void;
  onOpenFavoriteCommand(filePath: string, commandId: string): void;
  onCopyFavorite(command: string, trigger: HTMLButtonElement): void;
  onRemoveFavorite(item: FavoriteItem): void;
  onToggleQuickGroup(group: string, expanded: boolean): void;
  onRefresh(): void;
}

export interface ExplorerFavoriteItem {
  favorite: FavoriteItem;
  label: string;
  detail: string;
  command?: string;
}

export interface ExplorerViewportState {
  scrollTop: number;
  scrollLeft: number;
  anchorKey: string | null;
  anchorOffset: number;
  focusAnchorKey: string | null;
  focusControl: string | null;
}

interface ExplorerOptions {
  workspaceRoot: string | null;
  entries: FilesystemEntry[];
  activeFile: string | null;
  pendingFile: string | null;
  selectedFolder: string | null;
  expandedFolders: ReadonlySet<string>;
  favoriteFilePaths: ReadonlySet<string>;
  favoriteFolderPaths: ReadonlySet<string>;
  favoriteItems: ExplorerFavoriteItem[];
  collapsedQuickGroups: ReadonlySet<string>;
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
    appendQuickAccess(content, options);
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
  row.dataset.entryPath = entry.path;
  row.dataset.explorerAnchor = `entry:${entry.path}`;
  row.style.paddingLeft = `${4 + depth * 14}px`;

  const expanded = options.expandedFolders.has(entry.path);
  const folderButton = button("tree-folder", "");
  folderButton.dataset.explorerControl = "folder";
  folderButton.setAttribute("aria-expanded", String(expanded));
  const chevron = createIcon("chevron", `tree-disclosure${expanded ? " expanded" : ""}`);
  folderButton.append(
    chevron,
    createIcon(expanded ? "folder-open" : "folder", "tree-kind-icon"),
    element("span", "tree-label", entry.name),
  );
  folderButton.addEventListener("click", () => options.callbacks.onSelectFolder(entry.path));

  const menuButton = entryMenuButton(entry, options);
  row.append(
    folderButton,
    favoriteToggle(
      entry.name,
      options.favoriteFolderPaths.has(entry.path),
      () => options.callbacks.onToggleFolderFavorite(entry.path),
    ),
    menuButton,
  );
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
    `tree-entry-row file-row${entry.path === options.activeFile ? " active" : ""}${entry.path === options.pendingFile ? " loading" : ""}`,
  );
  row.dataset.entryPath = entry.path;
  row.dataset.explorerAnchor = `entry:${entry.path}`;
  row.style.paddingLeft = `${22 + depth * 14}px`;

  const label = entry.name.replace(/\.cmdnote$/i, "");
  const fileButton = button("tree-file", "");
  fileButton.dataset.explorerControl = "file";
  fileButton.append(createIcon("command-file", "tree-kind-icon"), element("span", "tree-label", label));
  if (entry.path === options.activeFile) {
    fileButton.setAttribute("aria-current", "page");
  }
  if (entry.path === options.pendingFile) {
    fileButton.setAttribute("aria-busy", "true");
    fileButton.append(element("span", "tree-file-loading"));
  }
  fileButton.addEventListener("click", () => options.callbacks.onOpenFile(entry.path));
  row.append(
    fileButton,
    favoriteToggle(
      entry.name,
      options.favoriteFilePaths.has(entry.path),
      () => options.callbacks.onToggleFileFavorite(entry.path),
    ),
    entryMenuButton(entry, options),
  );
  return row;
}

function entryMenuButton(entry: FilesystemEntry, options: ExplorerOptions): HTMLButtonElement {
  const menu = button("tree-entry-menu", "⋮");
  menu.dataset.explorerControl = "menu";
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
    items.push({ label: "Rename", action: () => options.callbacks.onRename(entry) });
    items.push({ label: "Delete", danger: true, action: () => options.callbacks.onDelete(entry) });
    openMenu(menu, items);
  });
  return menu;
}

function appendQuickAccess(container: HTMLElement, options: ExplorerOptions): void {
  if (options.favoriteItems.length > 0) {
    container.append(
      quickGroup("favorites", "FAVORITES", options.favoriteItems.map((item) => {
        const row = element("div", "quick-access-row");
        row.dataset.explorerAnchor = `favorite:${favoriteKey(item.favorite)}`;
        const open = button("quick-access-main", "");
        open.dataset.explorerControl = "favorite-main";
        open.append(createIcon("heart", "quick-favorite-icon"), element("span", undefined, item.label));
        open.title = item.detail;
        open.addEventListener("click", () => {
          if (item.favorite.kind === "folder") {
            options.callbacks.onOpenFavoriteFolder(item.favorite.path);
          } else if (item.favorite.kind === "file") {
            options.callbacks.onOpenFile(item.favorite.path);
          } else {
            options.callbacks.onOpenFavoriteCommand(item.favorite.filePath, item.favorite.commandId);
          }
        });
        row.append(open);
        if (item.command) {
          const copy = button("quick-access-action", "COPY");
          copy.dataset.explorerControl = "favorite-copy";
          copy.title = `Copy ${item.label}`;
          copy.setAttribute("aria-label", `Copy favorite ${item.label}`);
          copy.addEventListener("click", () => options.callbacks.onCopyFavorite(item.command as string, copy));
          row.append(copy);
        }
        const remove = button("quick-access-remove favorite-remove", "");
        remove.dataset.explorerControl = "favorite-remove";
        remove.append(createIcon("heart"));
        remove.title = `Remove ${item.label} from Favorites`;
        remove.setAttribute("aria-label", `Remove favorite ${item.label}`);
        remove.addEventListener("click", () => options.callbacks.onRemoveFavorite(item.favorite));
        row.append(remove);
        return row;
      }), options),
    );
  }

}

function quickGroup(
  id: string,
  label: string,
  rows: HTMLElement[],
  options: ExplorerOptions,
): HTMLElement {
  const group = element("section", "quick-access-group");
  group.dataset.explorerAnchor = `quick:${id}`;
  const expanded = !options.collapsedQuickGroups.has(id);
  const toggle = button("quick-access-heading", "");
  toggle.dataset.explorerControl = "quick-toggle";
  toggle.setAttribute("aria-expanded", String(expanded));
  const chevron = createIcon("chevron", `tree-disclosure${expanded ? " expanded" : ""}`);
  toggle.append(
    chevron,
    ...(id === "favorites" ? [createIcon("heart", "quick-heading-icon")] : []),
    element("span", undefined, label),
    element("span", "quick-access-count", String(rows.length)),
  );
  const content = element("div", "quick-access-items");
  content.hidden = !expanded;
  content.append(...rows);
  toggle.addEventListener("click", () => options.callbacks.onToggleQuickGroup(id, !expanded));
  group.append(toggle, content);
  return group;
}

function favoriteToggle(
  label: string,
  selected: boolean,
  onToggle: () => void,
): HTMLButtonElement {
  const control = button("tree-favorite-toggle", "");
  control.dataset.explorerControl = "favorite";
  control.append(createIcon("heart"));
  control.classList.toggle("selected", selected);
  control.setAttribute("aria-pressed", String(selected));
  control.setAttribute(
    "aria-label",
    selected ? `Remove ${label} from Favorites` : `Add ${label} to Favorites`,
  );
  control.title = selected ? "Remove from Favorites" : "Add to Favorites";
  control.addEventListener("click", onToggle);
  return control;
}

export function captureExplorerViewport(explorer: HTMLElement): ExplorerViewportState | null {
  const content = explorer.querySelector<HTMLElement>(".explorer-content");
  if (!content) {
    return null;
  }
  const contentRect = content.getBoundingClientRect();
  const anchor = [...content.querySelectorAll<HTMLElement>("[data-explorer-anchor]")]
    .find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return rect.bottom > contentRect.top && rect.top < contentRect.bottom;
    }) ?? null;
  const active = document.activeElement instanceof HTMLElement && explorer.contains(document.activeElement)
    ? document.activeElement
    : null;
  const focusAnchor = active?.closest<HTMLElement>("[data-explorer-anchor]") ?? null;
  return {
    scrollTop: content.scrollTop,
    scrollLeft: content.scrollLeft,
    anchorKey: anchor?.dataset.explorerAnchor ?? null,
    anchorOffset: anchor ? anchor.getBoundingClientRect().top - contentRect.top : 0,
    focusAnchorKey: focusAnchor?.dataset.explorerAnchor ?? null,
    focusControl: active?.dataset.explorerControl ?? null,
  };
}

export function restoreExplorerViewport(
  explorer: HTMLElement,
  state: ExplorerViewportState | null,
  revealPath?: string,
): void {
  const content = explorer.querySelector<HTMLElement>(".explorer-content");
  if (!content) {
    return;
  }
  if (state) {
    content.scrollTop = state.scrollTop;
    content.scrollLeft = state.scrollLeft;
    if (state.anchorKey && state.scrollTop > 0) {
      const anchor = content.querySelector<HTMLElement>(
        `[data-explorer-anchor="${CSS.escape(state.anchorKey)}"]`,
      );
      if (anchor) {
        const contentTop = content.getBoundingClientRect().top;
        content.scrollTop += anchor.getBoundingClientRect().top - contentTop - state.anchorOffset;
      }
    }
    if (state.focusAnchorKey && state.focusControl) {
      content.querySelector<HTMLElement>(
        `[data-explorer-anchor="${CSS.escape(state.focusAnchorKey)}"] ` +
          `[data-explorer-control="${CSS.escape(state.focusControl)}"]`,
      )?.focus({ preventScroll: true });
    }
  }
  if (revealPath) {
    content.querySelector<HTMLElement>(`[data-entry-path="${CSS.escape(revealPath)}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}
