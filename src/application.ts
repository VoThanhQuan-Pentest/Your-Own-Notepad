import { createCommandTable, type CommandTableHandle } from "./components/command-table";
import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openCommandForm } from "./components/command-form";
import {
  createExplorer,
  type ExplorerFavoriteItem,
} from "./components/explorer";
import { openMenu } from "./components/menu";
import { openConfirm, openModal, openPrompt, showMessage } from "./components/modal";
import { openTableImportForm } from "./components/table-import-form";
import { createToolbar, type ToolbarHandle } from "./components/toolbar";
import { createWelcomeDashboard, type DashboardFavorite } from "./components/welcome-dashboard";
import { buildStressFile, demoCommandFile } from "./demo-data";
import type {
  CommandEntry,
  CommandFile,
  CommandSection,
  CommandSectionLayout,
} from "./models/command-file";
import type { FilesystemEntry } from "./models/filesystem";
import {
  accentThemes,
  defaultCustomThemes,
  defaultSettings,
  favoriteKey,
  isHexColor,
  themeModes,
  type AccentTheme,
  type AppSettings,
  type CustomThemes,
  type FavoriteItem,
  type ThemeMode,
} from "./models/settings";
import { copyText } from "./services/clipboard";
import {
  createCommandFile,
  createFolder,
  listDirectory,
  readCommandFile,
  renameEntry,
  trashEntry,
  writeCommandFile,
} from "./services/filesystem";
import { isTauriRuntime, normalizeServiceError } from "./services/runtime";
import { loadSettings, normalizeDisplayName, saveSettings } from "./services/settings";
import { chooseWorkspace } from "./services/workspace";
import { restoreWindowSize } from "./services/window";
import { button, element } from "./utils/dom";
import { contrastRatio, mixHex } from "./utils/color";
import { SessionHistory } from "./utils/history";
import { createId } from "./utils/ids";
import {
  createSearchDocument,
  createSearchTextCache,
  rankSearchDocuments,
  type RankedSearchResult,
  type SearchDocument,
} from "./utils/search";
import { parseCommandFile, serializeCommandFile } from "./utils/validation";

interface SearchResult {
  filePath: string;
  fileTitle: string;
  sectionId?: string;
  sectionTitle?: string;
  commandId?: string;
  commandName?: string;
  command?: string;
}

interface FocusTarget {
  sectionId?: string;
  commandId?: string;
}

interface LoadedCommandFile {
  path: string;
  file?: CommandFile;
  source?: string;
  error?: string;
  migrated?: boolean;
}

interface WorkspaceSnapshot {
  workspaceRoot: string | null;
  selectedFolder: string | null;
  activeFilePath: string | null;
  activeFile: CommandFile | null;
  entries: FilesystemEntry[];
  files: Map<string, CommandFile>;
  fileSources: Map<string, string>;
  fileRevisions: Map<string, string | null>;
  fileErrors: Map<string, string>;
  expandedFolders: Set<string>;
  transientExpandedSections: Set<string>;
  sectionStateInitializedFiles: Set<string>;
  exampleColumnOverrides: Map<string, boolean>;
  collapsedQuickGroups: Set<string>;
  selectionSectionId: string | null;
}

export class CommandVaultApplication {
  private readonly root: HTMLElement;
  private readonly desktopRuntime = isTauriRuntime();
  private readonly stressMode = new URLSearchParams(window.location.search).has("stress");
  private readonly stressRowCount = stressRowCountFromLocation();
  private readonly skipWelcome = new URLSearchParams(window.location.search).has("skip-welcome");
  private readonly workspace = element("main", "workspace");
  private readonly body = element("div", "app-body");
  private readonly toolbar: ToolbarHandle;
  private explorer: HTMLElement | null = null;
  private activeTable: CommandTableHandle | null = null;
  private appVersion = "0.9.0";
  private settings: AppSettings = structuredClone(defaultSettings);
  private workspaceRoot: string | null = null;
  private selectedFolder: string | null = null;
  private activeFilePath: string | null = null;
  private activeFile: CommandFile | null = null;
  private entries: FilesystemEntry[] = [];
  private readonly files = new Map<string, CommandFile>();
  private readonly fileSources = new Map<string, string>();
  private readonly fileRevisions = new Map<string, string | null>();
  private readonly fileErrors = new Map<string, string>();
  private readonly expandedFolders = new Set<string>();
  private readonly transientExpandedSections = new Set<string>();
  private readonly sectionStateInitializedFiles = new Set<string>();
  private readonly exampleColumnOverrides = new Map<string, boolean>();
  private readonly fileHistory = new SessionHistory<CommandFile>(50, cloneCommandFile);
  private readonly collapsedQuickGroups = new Set<string>();
  private selectionSectionId: string | null = null;
  private workspaceLoadGeneration = 0;
  private searchTimer: number | null = null;
  private searchGeneration = 0;
  private searchIndex: SearchDocument<SearchResult>[] = [];
  private showingDashboard = false;
  private lifecycleTimer: number | null = null;
  private lifecycleLastTick = Date.now();
  private lifecycleNeedsWorkspaceCheck = false;
  private recoveryInFlight = false;
  private workspaceLoading = false;

  constructor(root: HTMLElement) {
    this.root = root;
    this.toolbar = createToolbar({
      onSearch: (query) => this.queueSearch(query),
      onHome: () => this.renderWelcomeDashboard(),
      onSettings: () => this.openSettings(),
    });
  }

  async start(): Promise<void> {
    this.renderShell();
    this.renderLoading("Loading Command Vault…");
    try {
      this.settings = await loadSettings();
    } catch (error) {
      this.settings = structuredClone(defaultSettings);
      const failure = normalizeServiceError(error);
      await showMessage({
        title: "Settings Error",
        message: "Command Vault could not load settings and is using safe defaults.",
        detail: failure.message,
        kind: "error",
      });
    }
    this.applySettings();
    this.toolbar.setProfileName(this.settings.displayName);
    this.installKeyboardShortcuts();
    await this.installWindowPersistence();
    await this.installLifecycleRecovery();

    if (this.desktopRuntime) {
      try {
        this.appVersion = await getVersion();
      } catch (error) {
        console.warn("Could not read application version", normalizeServiceError(error));
      }
    } else {
      this.appVersion = "0.9.0 (development)";
    }

    if (!this.settings.displayName && this.skipWelcome) {
      this.settings.displayName = "Tester";
      this.toolbar.setProfileName(this.settings.displayName);
    } else if (!this.settings.displayName) {
      await this.collectDisplayName();
    }

    if (!this.desktopRuntime) {
      this.loadDevelopmentWorkspace();
      return;
    }

    if (this.settings.lastWorkspace) {
      try {
        await this.openWorkspace(this.settings.lastWorkspace, true);
        return;
      } catch (error) {
        const failure = normalizeServiceError(error);
        this.workspaceRoot = null;
        this.renderExplorer();
        this.renderWorkspaceMissing(failure.message);
        return;
      }
    }

    this.renderExplorer();
    this.renderWelcomeDashboard();
  }

  private renderShell(): void {
    const shell = element("div", "app-shell");
    this.body.append(this.workspace);
    shell.append(this.toolbar.element, this.body);
    this.root.replaceChildren(shell);
  }

  private renderExplorer(): void {
    const next = createExplorer({
      workspaceRoot: this.workspaceRoot,
      entries: this.entries,
      activeFile: this.activeFilePath,
      selectedFolder: this.selectedFolder,
      expandedFolders: this.expandedFolders,
      favoriteFilePaths: new Set(
        this.settings.favorites.flatMap((item) => item.kind === "file" ? [item.path] : []),
      ),
      favoriteFolderPaths: new Set(
        this.settings.favorites.flatMap((item) => item.kind === "folder" ? [item.path] : []),
      ),
      favoriteItems: this.explorerFavoriteItems(),
      collapsedQuickGroups: this.collapsedQuickGroups,
      callbacks: {
        onOpenFile: (path) => void this.openFile(path),
        onSelectFolder: (path) => this.selectFolder(path),
        onCreateFolder: (parent) => void this.newFolder(parent),
        onCreateFile: (parent) => void this.newFile(parent),
        onRename: (entry) => void this.renameFilesystemEntry(entry),
        onDelete: (entry) => void this.deleteFilesystemEntry(entry),
        onToggleFileFavorite: (path) => this.toggleFavorite({ kind: "file", path }),
        onToggleFolderFavorite: (path) => this.toggleFavorite({ kind: "folder", path }),
        onOpenFavoriteFolder: (path) => this.openFavoriteFolder(path),
        onOpenFavoriteCommand: (filePath, commandId) =>
          void this.openFavoriteCommand(filePath, commandId),
        onCopyFavorite: (command, trigger) => void this.copyCommand(command, trigger),
        onRemoveFavorite: (item) => this.removeFavorite(item),
        onToggleQuickGroup: (group, expanded) => {
          this.collapsedQuickGroups[expanded ? "delete" : "add"](group);
          this.renderExplorer();
        },
        onRefresh: () => void this.refreshWorkspaceFromUi(),
      },
    });

    if (this.explorer) {
      this.explorer.replaceWith(next);
    } else {
      this.body.prepend(next);
    }
    this.explorer = next;
  }

  private explorerFavoriteItems(): ExplorerFavoriteItem[] {
    if (!this.workspaceRoot) {
      return [];
    }
    return this.settings.favorites.flatMap<ExplorerFavoriteItem>((favorite) => {
      const filePath = favorite.kind === "command" ? favorite.filePath : favorite.path;
      if (!isSameOrDescendant(this.workspaceRoot as string, filePath)) {
        return [];
      }
      if (favorite.kind === "folder") {
        const folder = findFilesystemEntry(this.entries, favorite.path);
        return folder?.kind === "folder"
          ? [{ favorite, label: folder.name, detail: favorite.path }]
          : [];
      }
      const file = this.files.get(filePath);
      if (!file) {
        return [];
      }
      if (favorite.kind === "file") {
        return [{ favorite, label: commandFileLabel(filePath), detail: filePath }];
      }
      const location = findCommandInFile(file, favorite.commandId);
      if (!location) {
        return [];
      }
      return [{
        favorite,
        label: location.command.name,
        detail: `${commandFileLabel(filePath)} › ${location.section.title}`,
        command: location.command.command,
      }];
    });
  }

  private toggleFavorite(item: FavoriteItem): void {
    const key = favoriteKey(item);
    const exists = this.settings.favorites.some((favorite) => favoriteKey(favorite) === key);
    this.settings.favorites = exists
      ? this.settings.favorites.filter((favorite) => favoriteKey(favorite) !== key)
      : [item, ...this.settings.favorites].slice(0, 50);
    this.renderExplorer();
    if (item.kind === "command" && item.filePath === this.activeFilePath && this.activeFile) {
      this.renderActiveFile();
    }
    void this.persistSettings(false);
  }

  private removeFavorite(item: FavoriteItem): void {
    const key = favoriteKey(item);
    this.settings.favorites = this.settings.favorites.filter(
      (favorite) => favoriteKey(favorite) !== key,
    );
    this.renderExplorer();
    if (item.kind === "command" && item.filePath === this.activeFilePath && this.activeFile) {
      this.renderActiveFile();
    }
    void this.persistSettings(false);
  }

  private isCommandFavorite(filePath: string, commandId: string): boolean {
    const key = favoriteKey({ kind: "command", filePath, commandId });
    return this.settings.favorites.some((favorite) => favoriteKey(favorite) === key);
  }

  private async openFavoriteCommand(filePath: string, commandId: string): Promise<void> {
    const file = this.files.get(filePath);
    const location = file ? findCommandInFile(file, commandId) : null;
    if (!location) {
      await showMessage({
        title: "Favorite Unavailable",
        message: "This favorite command no longer exists in the current workspace.",
      });
      return;
    }
    await this.openFile(filePath, { sectionId: location.section.id, commandId });
  }

  private openFavoriteFolder(path: string): void {
    if (!this.workspaceRoot || !isSameOrDescendant(this.workspaceRoot, path)) {
      return;
    }
    let current: string | null = path;
    while (current && current !== this.workspaceRoot) {
      this.expandedFolders.add(current);
      current = parentDirectory(current);
    }
    this.selectedFolder = path;
    this.renderExplorer();
    queueMicrotask(() => {
      const row = this.explorer?.querySelector<HTMLElement>(
        `[data-entry-path="${CSS.escape(path)}"]`,
      );
      row?.scrollIntoView({ block: "center" });
      row?.querySelector<HTMLButtonElement>(".tree-folder")?.focus();
    });
  }

  private remapFavoritePaths(oldPath: string, newPath: string): void {
    const remappedFavorites = this.settings.favorites.map((favorite) => {
      if (favorite.kind !== "command") {
        return {
          ...favorite,
          path: remapDescendantPath(oldPath, newPath, favorite.path) ?? favorite.path,
        };
      }
      return {
        ...favorite,
        filePath: remapDescendantPath(oldPath, newPath, favorite.filePath) ?? favorite.filePath,
      };
    });
    this.settings.favorites = [...new Map(
      remappedFavorites.map((favorite) => [favoriteKey(favorite), favorite]),
    ).values()].slice(0, 50);
    void this.persistSettings(false);
  }

  private removeFavoritePaths(path: string): void {
    this.settings.favorites = this.settings.favorites.filter((favorite) => {
      const filePath = favorite.kind === "command" ? favorite.filePath : favorite.path;
      return !isSameOrDescendant(path, filePath);
    });
    void this.persistSettings(false);
  }

  private pruneCommandFavorites(filePath: string, file: CommandFile): boolean {
    const previousLength = this.settings.favorites.length;
    this.settings.favorites = this.settings.favorites.filter(
      (favorite) =>
        favorite.kind !== "command" ||
        favorite.filePath !== filePath ||
        findCommandInFile(file, favorite.commandId) !== null,
    );
    return this.settings.favorites.length !== previousLength;
  }

  private pruneUnavailableFavorites(): boolean {
    if (!this.workspaceRoot) {
      return false;
    }
    const workspaceRoot = this.workspaceRoot;
    const folderPaths = new Set(flattenFolders(this.entries).map((folder) => folder.path));
    const previousFavorites = this.settings.favorites.length;
    this.settings.favorites = this.settings.favorites.filter((favorite) => {
      const filePath = favorite.kind === "command" ? favorite.filePath : favorite.path;
      if (!isSameOrDescendant(workspaceRoot, filePath) || this.fileErrors.has(filePath)) {
        return true;
      }
      if (favorite.kind === "folder") {
        return folderPaths.has(favorite.path);
      }
      const file = this.files.get(filePath);
      if (!file) {
        return false;
      }
      return favorite.kind === "file" || findCommandInFile(file, favorite.commandId) !== null;
    });
    return previousFavorites !== this.settings.favorites.length;
  }

  private async chooseAndOpenWorkspace(): Promise<void> {
    if (!this.desktopRuntime) {
      await showMessage({
        title: "Desktop Feature",
        message: "The native folder picker is available in the Tauri desktop window.",
      });
      return;
    }

    const previous = this.captureWorkspaceSnapshot();
    try {
      const selected = await chooseWorkspace();
      if (selected) {
        await this.openWorkspace(selected, false);
      }
    } catch (error) {
      this.restoreWorkspaceSnapshot(previous);
      this.renderExplorer();
      if (this.activeFile) {
        this.renderActiveFile();
      } else if (this.workspaceRoot) {
        this.renderWorkspaceEmpty();
      } else {
        this.renderNoWorkspace();
      }
      await this.showServiceFailure("Could not open workspace", error);
    }
  }

  private captureWorkspaceSnapshot(): WorkspaceSnapshot {
    return {
      workspaceRoot: this.workspaceRoot,
      selectedFolder: this.selectedFolder,
      activeFilePath: this.activeFilePath,
      activeFile: this.activeFile,
      entries: this.entries,
      files: new Map(this.files),
      fileSources: new Map(this.fileSources),
      fileRevisions: new Map(this.fileRevisions),
      fileErrors: new Map(this.fileErrors),
      expandedFolders: new Set(this.expandedFolders),
      transientExpandedSections: new Set(this.transientExpandedSections),
      sectionStateInitializedFiles: new Set(this.sectionStateInitializedFiles),
      exampleColumnOverrides: new Map(this.exampleColumnOverrides),
      collapsedQuickGroups: new Set(this.collapsedQuickGroups),
      selectionSectionId: this.selectionSectionId,
    };
  }

  private restoreWorkspaceSnapshot(snapshot: WorkspaceSnapshot): void {
    this.workspaceRoot = snapshot.workspaceRoot;
    this.selectedFolder = snapshot.selectedFolder;
    this.activeFilePath = snapshot.activeFilePath;
    this.activeFile = snapshot.activeFile;
    this.entries = snapshot.entries;
    replaceMap(this.files, snapshot.files);
    replaceMap(this.fileSources, snapshot.fileSources);
    replaceMap(this.fileRevisions, snapshot.fileRevisions);
    replaceMap(this.fileErrors, snapshot.fileErrors);
    replaceSet(this.expandedFolders, snapshot.expandedFolders);
    replaceSet(this.transientExpandedSections, snapshot.transientExpandedSections);
    replaceSet(this.sectionStateInitializedFiles, snapshot.sectionStateInitializedFiles);
    replaceMap(this.exampleColumnOverrides, snapshot.exampleColumnOverrides);
    replaceSet(this.collapsedQuickGroups, snapshot.collapsedQuickGroups);
    this.selectionSectionId = snapshot.selectionSectionId;
  }

  private async openWorkspace(path: string, restoreLastFile: boolean): Promise<void> {
    const workspaceChanged = this.settings.lastWorkspace !== path;
    this.workspaceRoot = path;
    this.selectedFolder = path;
    this.activeFile = null;
    this.activeFilePath = null;
    this.entries = [];
    this.files.clear();
    this.fileSources.clear();
    this.fileRevisions.clear();
    this.fileErrors.clear();
    this.expandedFolders.clear();
    this.transientExpandedSections.clear();
    this.sectionStateInitializedFiles.clear();
    this.exampleColumnOverrides.clear();
    this.fileHistory.clear();
    this.collapsedQuickGroups.clear();
    this.selectionSectionId = null;
    this.renderExplorer();
    this.workspaceLoading = true;
    if (this.skipWelcome || !this.settings.displayName) {
      this.renderLoading("Reading workspace…");
    } else {
      this.renderWelcomeDashboard();
    }
    try {
      await this.refreshWorkspace(false);
    } finally {
      this.workspaceLoading = false;
    }

    if (workspaceChanged) {
      this.settings.expandedSections = [];
      this.settings.sectionStateFiles = [];
    }
    this.settings.lastWorkspace = path;
    const candidate = restoreLastFile ? this.settings.lastOpenedFile : null;
    const fileToOpen = candidate && this.files.has(candidate) ? candidate : null;
    await this.persistSettings(false);

    if (fileToOpen && this.skipWelcome) {
      await this.openFile(fileToOpen);
    } else {
      this.renderWelcomeDashboard();
    }
  }

  private async refreshWorkspace(preserveActive: boolean): Promise<void> {
    if (!this.workspaceRoot) {
      return;
    }
    const generation = ++this.workspaceLoadGeneration;
    const workspaceRoot = this.workspaceRoot;
    const active = preserveActive && !this.showingDashboard ? this.activeFilePath : null;
    const entries = await listDirectory(workspaceRoot);
    const fileEntries = flattenFiles(entries);
    const paths = fileEntries.map((entry) => entry.path);
    const entryByPath = new Map(fileEntries.map((entry) => [entry.path, entry]));
    const pathsToLoad = paths.filter((path) => {
      const revision = entryByPath.get(path)?.revision ?? null;
      return revision === null || this.fileRevisions.get(path) !== revision ||
        (!this.files.has(path) && !this.fileErrors.has(path));
    });
    let completed = 0;
    const migratedPaths: string[] = [];
    const loaded = await mapWithConcurrency(pathsToLoad, 4, async (path) => {
      try {
        const source = await readCommandFile(workspaceRoot, path);
        if (generation !== this.workspaceLoadGeneration) {
          return { path, error: "Workspace changed while loading." } satisfies LoadedCommandFile;
        }
        const parsed = parseCommandFile(source);
        if (!parsed.ok) {
          return { path, error: formatParseError(parsed.error.message, parsed.error.issues) } satisfies LoadedCommandFile;
        }
        if (parsed.needsMigration && this.desktopRuntime) {
          try {
            if (generation !== this.workspaceLoadGeneration) {
              return { path, error: "Workspace changed while loading." } satisfies LoadedCommandFile;
            }
            const migrated = await writeCommandFile(
              workspaceRoot,
              path,
              serializeCommandFile(parsed.data),
              source,
            );
            migratedPaths.push(path);
            return { path, file: parsed.data, source: migrated, migrated: true } satisfies LoadedCommandFile;
          } catch (error) {
            return {
              path,
              error: `Migration to version 2 failed: ${normalizeServiceError(error).message}`,
            } satisfies LoadedCommandFile;
          }
        }
        return { path, file: parsed.data, source } satisfies LoadedCommandFile;
      } catch (error) {
        return { path, error: normalizeServiceError(error).message } satisfies LoadedCommandFile;
      } finally {
        completed += 1;
        if (!preserveActive && !this.showingDashboard && generation === this.workspaceLoadGeneration &&
          (completed === pathsToLoad.length || completed % 8 === 0)) {
          this.renderLoading(`Reading workspace ${completed}/${pathsToLoad.length}…`);
        }
      }
    });

    if (generation !== this.workspaceLoadGeneration) {
      return;
    }

    const previousFiles = new Map(this.files);
    const previousSources = new Map(this.fileSources);
    const previousErrors = new Map(this.fileErrors);
    const loadedByPath = new Map(loaded.map((item) => [item.path, item]));
    this.entries = entries;
    this.files.clear();
    this.fileSources.clear();
    this.fileErrors.clear();
    this.fileRevisions.clear();
    paths.forEach((path) => {
      const revision = entryByPath.get(path)?.revision ?? null;
      this.fileRevisions.set(path, revision);
      if (loadedByPath.has(path)) {
        return;
      }
      const previousFile = previousFiles.get(path);
      const previousSource = previousSources.get(path);
      if (previousFile && previousSource !== undefined) {
        this.files.set(path, previousFile);
        this.fileSources.set(path, previousSource);
      } else if (previousErrors.has(path)) {
        this.fileErrors.set(path, previousErrors.get(path) as string);
      }
    });
    loaded.forEach((item) => {
      if ("file" in item && item.file) {
        this.files.set(item.path, item.file);
        this.fileSources.set(item.path, item.source);
      } else {
        this.fileErrors.set(item.path, item.error);
      }
    });
    if (this.pruneUnavailableFavorites()) {
      void this.persistSettings(false);
    }
    this.rebuildSearchIndex();
    entries
      .filter((entry) => entry.kind === "folder")
      .forEach((entry) => this.expandedFolders.add(entry.path));
    this.renderExplorer();

    if (active && this.files.has(active)) {
      await this.openFile(active, undefined, true);
    } else if (active && this.fileErrors.has(active)) {
      this.activeFilePath = active;
      this.activeFile = null;
      this.renderFileError(active, this.fileErrors.get(active) as string);
      this.renderExplorer();
    } else if (preserveActive && active) {
      this.activeFile = null;
      this.activeFilePath = null;
      this.renderWorkspaceEmpty("The previously open file was removed outside Command Vault.");
      this.renderExplorer();
    }

    const migrationFailures = loaded.filter((item) => item.error?.startsWith("Migration to version 2 failed"));
    if (migratedPaths.length > 0 || migrationFailures.length > 0) {
      void showMessage({
        title: "Command File Migration",
        message: `${migratedPaths.length} file${migratedPaths.length === 1 ? "" : "s"} migrated to version 2.${migrationFailures.length ? ` ${migrationFailures.length} file${migrationFailures.length === 1 ? "" : "s"} could not be migrated.` : ""}`,
        detail: [
          migrationFailures.length ? migrationFailures.map((item) => item.path).join("\n") : "",
          `Migrated files require Command Vault ${this.appVersion} or newer.`,
        ].filter(Boolean).join("\n\n"),
        kind: migrationFailures.length ? "error" : "info",
      });
    }
  }

  private async refreshWorkspaceFromUi(): Promise<void> {
    this.fileHistory.clear();
    try {
      const wasDashboard = this.showingDashboard;
      await this.refreshWorkspace(true);
      if (wasDashboard) {
        this.renderWelcomeDashboard();
      }
    } catch (error) {
      const failure = normalizeServiceError(error);
      if (failure.code === "NOT_FOUND" || failure.code === "NOT_A_FOLDER") {
        this.workspaceRoot = null;
        this.selectedFolder = null;
        this.activeFilePath = null;
        this.activeFile = null;
        this.entries = [];
        this.files.clear();
        this.fileSources.clear();
        this.fileRevisions.clear();
        this.fileErrors.clear();
        this.renderExplorer();
        this.renderWorkspaceMissing(failure.message);
        return;
      }
      await this.showServiceFailure("Could not refresh workspace", error);
    }
  }

  private async openFile(path: string, focus?: FocusTarget, useCached = false): Promise<void> {
    if (path !== this.activeFilePath) {
      this.selectionSectionId = null;
    }
    let file = this.files.get(path);
    if (!useCached && this.desktopRuntime && this.workspaceRoot) {
      try {
        const source = await readCommandFile(this.workspaceRoot, path);
        const parsed = parseCommandFile(source);
        if (parsed.ok) {
          const normalizedSource = parsed.needsMigration
            ? await writeCommandFile(
                this.workspaceRoot,
                path,
                serializeCommandFile(parsed.data),
                source,
              )
            : source;
          file = parsed.data;
          this.files.set(path, file);
          this.fileSources.set(path, normalizedSource);
          this.fileErrors.delete(path);
          this.rebuildSearchIndex();
        } else {
          file = undefined;
          this.files.delete(path);
          this.fileSources.delete(path);
          this.fileErrors.set(path, formatParseError(parsed.error.message, parsed.error.issues));
        }
      } catch (error) {
        file = undefined;
        this.files.delete(path);
        this.fileSources.delete(path);
        this.fileErrors.set(path, normalizeServiceError(error).message);
      }
    }
    this.activeFilePath = path;
    this.activeFile = file ?? null;
    this.selectedFolder = parentDirectory(path) ?? this.selectedFolder;
    this.settings.lastOpenedFile = path;
    this.renderExplorer();

    if (!file) {
      this.renderFileError(path, this.fileErrors.get(path) ?? "The command file is unavailable.");
      return;
    }

    if (focus?.sectionId) {
      this.transientExpandedSections.add(sectionStateKey(path, focus.sectionId));
    }
    this.renderActiveFile(focus);
    await this.persistSettings(false);
  }

  private renderActiveFile(focus?: FocusTarget): void {
    if (!this.activeFile || !this.activeFilePath) {
      return;
    }
    this.showingDashboard = false;

    const expanded = new Set<string>();
    if (this.settings.rememberExpandedSections) {
      const prefix = `${this.activeFilePath}::`;
      this.settings.expandedSections
        .filter((key) => key.startsWith(prefix))
        .forEach((key) => expanded.add(key.slice(prefix.length)));
    }
    const transientPrefix = `${this.activeFilePath}::`;
    this.transientExpandedSections.forEach((key) => {
      if (key.startsWith(transientPrefix)) {
        expanded.add(key.slice(transientPrefix.length));
      }
    });
    const sectionStateInitialized =
      this.sectionStateInitializedFiles.has(this.activeFilePath) ||
      (this.settings.rememberExpandedSections &&
        this.settings.sectionStateFiles.includes(this.activeFilePath));

    const table = createCommandTable(this.activeFile, {
      canUndo: this.fileHistory.canUndo(this.activeFilePath),
      canRedo: this.fileHistory.canRedo(this.activeFilePath),
      selectionSectionId: this.selectionSectionId,
      expandedSections: expanded,
      sectionStateInitialized,
      expandAllSections: this.stressMode,
      isExampleColumnVisible: (section) => this.isExampleColumnVisible(section),
      callbacks: {
        onUndo: () => void this.undoCurrentFile(),
        onRedo: () => void this.redoCurrentFile(),
        onAddSection: () => void this.addSection(),
        onAddTable: () => void this.addSection("table"),
        onAddCommand: (sectionId) => void this.addCommand(sectionId),
        onSectionToggle: (sectionId, isExpanded) => this.rememberSection(sectionId, isExpanded),
        onExampleColumnToggle: (sectionId, visible) =>
          this.setExampleColumnVisible(sectionId, visible),
        onSectionMenu: (anchor, section) => this.openSectionMenu(anchor, section),
        onCommandMenu: (anchor, command) => this.openCommandMenu(anchor, command),
        onCommandCopy: (value, trigger) => void this.copyCommand(value, trigger),
        onSelectionMode: (sectionId, active) => this.setSelectionMode(sectionId, active),
        onBulkMove: (sectionId, commandIds) => void this.bulkMoveCommands(sectionId, commandIds),
        onBulkDelete: (sectionId, commandIds) => void this.bulkDeleteCommands(sectionId, commandIds),
        onCommandReorder: (sectionId, commandId, targetIndex) =>
          void this.reorderTableCommand(sectionId, commandId, targetIndex),
      },
    });
    this.activeTable?.dispose();
    this.activeTable = table;
    this.workspace.replaceChildren(table.element);

    if (focus?.commandId || focus?.sectionId) {
      queueMicrotask(() => {
        table.ensureVisible(focus.sectionId, focus.commandId);
        const selector = focus.commandId
          ? `[data-command-id="${CSS.escape(focus.commandId)}"]`
          : `[data-section-id="${CSS.escape(focus.sectionId as string)}"]`;
        const target = this.workspace.querySelector<HTMLElement>(selector);
        target?.scrollIntoView({ block: "center" });
        if (focus.commandId) {
          target?.classList.add("search-highlight");
        }
      });
    }
  }

  private selectFolder(path: string): void {
    this.selectedFolder = path;
    if (this.expandedFolders.has(path)) {
      this.expandedFolders.delete(path);
    } else {
      this.expandedFolders.add(path);
    }
    this.renderExplorer();
  }

  private async newFolder(parent = this.selectedFolder ?? this.workspaceRoot): Promise<void> {
    if (!parent || !this.workspaceRoot) {
      return;
    }
    if (!this.desktopRuntime) {
      await this.desktopOnlyMessage();
      return;
    }
    const name = await openPrompt({ title: "New Folder", label: "Name" });
    if (!name) {
      return;
    }
    try {
      await createFolder(this.workspaceRoot, parent, name);
      this.expandedFolders.add(parent);
      await this.refreshWorkspace(true);
    } catch (error) {
      await this.showServiceFailure("Could not create folder", error);
    }
  }

  private async newFile(parent = this.selectedFolder ?? this.workspaceRoot): Promise<void> {
    if (!parent || !this.workspaceRoot) {
      return;
    }
    if (!this.desktopRuntime) {
      await this.desktopOnlyMessage();
      return;
    }
    const name = await openPrompt({ title: "Create Command File", label: "Name" });
    if (!name) {
      return;
    }
    try {
      const created = await createCommandFile(this.workspaceRoot, parent, name);
      this.expandedFolders.add(parent);
      await this.refreshWorkspace(false);
      await this.openFile(created.path);
    } catch (error) {
      await this.showServiceFailure("Could not create command file", error);
    }
  }

  private async renameFilesystemEntry(entry: FilesystemEntry): Promise<void> {
    if (!this.workspaceRoot || !this.desktopRuntime) {
      await this.desktopOnlyMessage();
      return;
    }
    const initial = entry.kind === "command-file" ? entry.name.replace(/\.cmdnote$/i, "") : entry.name;
    const newName = await openPrompt({
      title: `Rename ${entry.kind === "folder" ? "Folder" : "Command File"}`,
      label: "Name",
      initialValue: initial,
      confirmLabel: "RENAME",
    });
    if (!newName) {
      return;
    }
    try {
      const previousActive = this.activeFilePath;
      const renamed = await renameEntry(this.workspaceRoot, entry.path, newName);
      this.fileHistory.remapPrefix(entry.path, renamed.path);
      this.remapFavoritePaths(entry.path, renamed.path);
      await this.refreshWorkspace(false);
      if (previousActive === entry.path) {
        await this.openFile(renamed.path);
      } else if (previousActive) {
        const remapped = remapDescendantPath(entry.path, renamed.path, previousActive);
        if (remapped && this.files.has(remapped)) {
          await this.openFile(remapped);
        }
      }
    } catch (error) {
      await this.showServiceFailure("Could not rename entry", error);
    }
  }

  private async deleteFilesystemEntry(entry: FilesystemEntry): Promise<void> {
    if (!this.workspaceRoot || !this.desktopRuntime) {
      await this.desktopOnlyMessage();
      return;
    }
    const isFolder = entry.kind === "folder";
    const confirmed = await openConfirm({
      title: isFolder ? "Move Folder to Trash" : "Move Command File to Trash",
      message: `Move "${entry.name}" to the system Trash?`,
      detail: isFolder && entry.children.length > 0
        ? "The folder and all of its contents can be restored from the system Trash."
        : "The entry can be restored from the system Trash.",
      confirmLabel: "MOVE TO TRASH",
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    try {
      await trashEntry(this.workspaceRoot, entry.path);
      this.fileHistory.deletePrefix(entry.path);
      this.removeFavoritePaths(entry.path);
      if (this.activeFilePath && isSameOrDescendant(entry.path, this.activeFilePath)) {
        this.activeFile = null;
        this.activeFilePath = null;
      }
      await this.refreshWorkspace(true);
      if (!this.activeFilePath) {
        this.renderWorkspaceEmpty();
      }
    } catch (error) {
      await this.showServiceFailure("Could not move entry to Trash", error);
    }
  }

  private async addSection(layout: CommandSectionLayout = "standard"): Promise<void> {
    if (!this.activeFile || !this.activeFilePath) {
      return;
    }
    if (layout === "table") {
      await this.addTable();
      return;
    }
    const name = await openPrompt({ title: "Add Section", label: "Section Name" });
    if (!name) {
      return;
    }
    const existing = new Set(this.activeFile.sections.map((section) => section.id));
    const section: CommandSection = {
      id: createId(name, existing),
      title: name,
      commands: [],
    };
    await this.updateCurrentFile((file) => file.sections.push(section));
    this.transientExpandedSections.add(sectionStateKey(this.activeFilePath, section.id));
    this.renderActiveFile();
  }

  private async addTable(): Promise<void> {
    if (!this.activeFile || !this.activeFilePath) {
      return;
    }
    const imported = await openTableImportForm(
      commandIds(this.activeFile),
      this.activeFile.sections.flatMap((section) => section.commands.map((command) => command.command)),
    );
    if (!imported) {
      return;
    }
    const sectionIds = new Set(this.activeFile.sections.map((section) => section.id));
    const section: CommandSection = {
      id: createId(imported.title, sectionIds),
      title: imported.title,
      layout: "table",
      commands: imported.commands,
    };
    await this.updateCurrentFile((file) => file.sections.push(section));
    this.transientExpandedSections.add(sectionStateKey(this.activeFilePath, section.id));
    this.renderActiveFile();
  }

  private async addCommand(sectionId: string): Promise<void> {
    if (!this.activeFile || !this.activeFilePath) {
      return;
    }
    const existing = commandIds(this.activeFile);
    const targetSection = this.activeFile.sections.find((section) => section.id === sectionId);
    const command = await openCommandForm(null, existing, {
      tableRow: targetSection?.layout === "table",
      tableRowNumber: (targetSection?.commands.length ?? 0) + 1,
    });
    if (!command) {
      return;
    }
    await this.updateCurrentFile((file) => {
      const section = file.sections.find((candidate) => candidate.id === sectionId);
      section?.commands.push(command);
    });
    this.transientExpandedSections.add(sectionStateKey(this.activeFilePath, sectionId));
    this.renderActiveFile();
  }

  private openSectionMenu(anchor: HTMLButtonElement, section: CommandSection): void {
    if (!this.activeFile || !this.activeFilePath) {
      return;
    }
    const index = this.activeFile.sections.findIndex((candidate) => candidate.id === section.id);
    openMenu(anchor, [
      { label: "Rename", action: () => this.renameSection(section.id) },
      {
        label: section.layout === "table" ? "Use Standard Rows" : "Use Compact Table",
        action: () =>
          this.setSectionLayout(
            section.id,
            section.layout === "table" ? "standard" : "table",
          ),
      },
      { label: "Move Up", disabled: index <= 0, action: () => this.moveSection(index, index - 1) },
      {
        label: "Move Down",
        disabled: index < 0 || index >= this.activeFile!.sections.length - 1,
        action: () => this.moveSection(index, index + 1),
      },
      { label: "Delete", danger: true, action: () => this.deleteSection(section.id) },
    ]);
  }

  private async renameSection(sectionId: string): Promise<void> {
    const section = this.activeFile?.sections.find((candidate) => candidate.id === sectionId);
    if (!section) {
      return;
    }
    const name = await openPrompt({
      title: "Rename Section",
      label: "Section Name",
      initialValue: section.title,
      confirmLabel: "RENAME",
    });
    if (!name) {
      return;
    }
    await this.updateCurrentFile((file) => {
      const target = file.sections.find((candidate) => candidate.id === sectionId);
      if (target) {
        target.title = name;
      }
    });
  }

  private async moveSection(from: number, to: number): Promise<void> {
    await this.updateCurrentFile((file) => moveItem(file.sections, from, to));
  }

  private async setSectionLayout(
    sectionId: string,
    layout: CommandSectionLayout,
  ): Promise<void> {
    await this.updateCurrentFile((file) => {
      const section = file.sections.find((candidate) => candidate.id === sectionId);
      if (!section) {
        return;
      }
      if (layout === "table") {
        section.layout = "table";
      } else {
        delete section.layout;
      }
    });
  }

  private async deleteSection(sectionId: string): Promise<void> {
    const section = this.activeFile?.sections.find((candidate) => candidate.id === sectionId);
    if (!section) {
      return;
    }
    const confirmed = await openConfirm({
      title: "Delete Section",
      message: `Delete "${section.title}"?`,
      detail: section.commands.length > 0 ? `This section contains ${section.commands.length} commands.` : undefined,
      confirmLabel: "DELETE",
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    const wasSelecting = this.selectionSectionId === sectionId;
    if (wasSelecting) {
      this.selectionSectionId = null;
    }
    const saved = await this.updateCurrentFile((file) => {
      file.sections = file.sections.filter((candidate) => candidate.id !== sectionId);
    });
    if (!saved && wasSelecting) {
      this.selectionSectionId = sectionId;
    }
  }

  private openCommandMenu(anchor: HTMLButtonElement, command: CommandEntry): void {
    const location = this.findCommand(command.id);
    if (!location || !this.activeFile || !this.activeFilePath) {
      return;
    }
    const filePath = this.activeFilePath;
    const items = [
      { label: "Edit", action: () => this.editCommand(command.id) },
      {
        label: this.isCommandFavorite(filePath, command.id)
          ? "Remove Favorite"
          : "Add Favorite",
        action: () => this.toggleFavorite({
          kind: "command",
          filePath,
          commandId: command.id,
        }),
      },
      { label: "Duplicate", action: () => this.duplicateCommand(command.id) },
      { label: "Move Up", disabled: location.commandIndex <= 0, action: () => this.moveCommand(command.id, -1) },
      {
        label: "Move Down",
        disabled: location.commandIndex >= location.section.commands.length - 1,
        action: () => this.moveCommand(command.id, 1),
      },
      ...(location.section.layout === "table"
        ? [
            {
              label: "Move to Top",
              disabled: location.commandIndex <= 0,
              action: () => this.reorderTableCommand(location.section.id, command.id, 0),
            },
            {
              label: "Move to Bottom",
              disabled: location.commandIndex >= location.section.commands.length - 1,
              action: () => this.reorderTableCommand(
                location.section.id,
                command.id,
                location.section.commands.length - 1,
              ),
            },
            {
              label: "Move to Position…",
              disabled: location.section.commands.length < 2,
              action: () => this.moveTableCommandToPosition(command.id),
            },
          ]
        : []),
      {
        label: "Move to Section",
        disabled: this.activeFile.sections.length < 2,
        action: () => this.moveCommandToSection(command.id),
      },
      { label: "Delete", danger: true, action: () => this.deleteCommand(command.id) },
    ];
    openMenu(anchor, items);
  }

  private async editCommand(commandId: string): Promise<void> {
    const location = this.findCommand(commandId);
    if (!location || !this.activeFile) {
      return;
    }
    const ids = commandIds(this.activeFile);
    ids.delete(commandId);
    const edited = await openCommandForm(location.command, ids, {
      tableRow: location.section.layout === "table",
    });
    if (!edited) {
      return;
    }
    await this.updateCurrentFile((file) => {
      const target = findCommandInFile(file, commandId);
      if (target) {
        target.section.commands[target.commandIndex] = edited;
      }
    });
  }

  private async duplicateCommand(commandId: string): Promise<void> {
    if (!this.activeFile) {
      return;
    }
    await this.updateCurrentFile((file) => {
      const location = findCommandInFile(file, commandId);
      if (!location) {
        return;
      }
      const copy = structuredClone(location.command);
      copy.name = `${copy.name} Copy`;
      copy.id = createId(copy.name, commandIds(file));
      location.section.commands.splice(location.commandIndex + 1, 0, copy);
    });
  }

  private async moveCommand(commandId: string, delta: number): Promise<void> {
    await this.updateCurrentFile((file) => {
      const location = findCommandInFile(file, commandId);
      if (location) {
        moveItem(
          location.section.commands,
          location.commandIndex,
          location.commandIndex + delta,
        );
      }
    });
  }

  private async reorderTableCommand(
    sectionId: string,
    commandId: string,
    targetIndex: number,
  ): Promise<void> {
    const saved = await this.updateCurrentFile((file) => {
      const section = file.sections.find((candidate) => candidate.id === sectionId);
      const sourceIndex = section?.commands.findIndex((command) => command.id === commandId) ?? -1;
      if (!section || section.layout !== "table" || sourceIndex < 0) {
        return;
      }
      moveItem(section.commands, sourceIndex, Math.max(0, Math.min(section.commands.length - 1, targetIndex)));
    });
    if (saved) {
      queueMicrotask(() => {
        this.workspace.querySelector<HTMLButtonElement>(
          `[data-command-id="${CSS.escape(commandId)}"] .row-drag-handle`,
        )?.focus();
      });
    }
  }

  private async moveTableCommandToPosition(commandId: string): Promise<void> {
    const location = this.findCommand(commandId);
    if (!location || location.section.layout !== "table") {
      return;
    }
    const count = location.section.commands.length;
    const position = await openPrompt({
      title: "Move Table Row",
      label: `Position (1–${count})`,
      initialValue: String(location.commandIndex + 1),
      confirmLabel: "MOVE",
      validate: (value) => {
        const number = Number(value);
        return Number.isInteger(number) && number >= 1 && number <= count
          ? null
          : `Enter a whole number from 1 to ${count}.`;
      },
    });
    if (!position) {
      return;
    }
    await this.reorderTableCommand(location.section.id, commandId, Number(position) - 1);
  }

  private async moveCommandToSection(commandId: string): Promise<void> {
    if (!this.activeFile || !this.activeFilePath) {
      return;
    }
    const location = this.findCommand(commandId);
    if (!location) {
      return;
    }
    const targetId = await chooseSection(
      this.activeFile.sections.filter((section) => section.id !== location.section.id),
    );
    if (!targetId) {
      return;
    }
    await this.updateCurrentFile((file) => {
      const source = findCommandInFile(file, commandId);
      const target = file.sections.find((section) => section.id === targetId);
      if (!source || !target) {
        return;
      }
      const [moved] = source.section.commands.splice(source.commandIndex, 1);
      if (moved) {
        target.commands.push(moved);
      }
    });
    this.transientExpandedSections.add(sectionStateKey(this.activeFilePath, targetId));
    this.renderActiveFile();
  }

  private async deleteCommand(commandId: string): Promise<void> {
    const location = this.findCommand(commandId);
    if (!location) {
      return;
    }
    const confirmed = await openConfirm({
      title: "Delete Command",
      message: `Delete "${location.command.name}"?`,
      detail: location.command.command,
      confirmLabel: "DELETE",
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    await this.updateCurrentFile((file) => {
      const target = findCommandInFile(file, commandId);
      if (target) {
        target.section.commands.splice(target.commandIndex, 1);
      }
    });
  }

  private async updateCurrentFile(mutator: (file: CommandFile) => void): Promise<boolean> {
    if (!this.activeFile || !this.activeFilePath) {
      return false;
    }
    const path = this.activeFilePath;
    const previous = cloneCommandFile(this.activeFile);
    const next = cloneCommandFile(this.activeFile);
    mutator(next);
    if (serializeCommandFile(next) === serializeCommandFile(previous)) {
      return false;
    }
    return this.saveCurrentFile(next, () => this.fileHistory.record(path, previous));
  }

  private async undoCurrentFile(): Promise<void> {
    if (!this.activeFile || !this.activeFilePath) {
      return;
    }
    const path = this.activeFilePath;
    const current = cloneCommandFile(this.activeFile);
    const previous = this.fileHistory.peekUndo(path);
    if (!previous) {
      return;
    }
    const selection = this.selectionSectionId;
    this.selectionSectionId = null;
    const saved = await this.saveCurrentFile(
      previous,
      () => this.fileHistory.commitUndo(path, current),
    );
    if (!saved) {
      this.selectionSectionId = selection;
    }
  }

  private async redoCurrentFile(): Promise<void> {
    if (!this.activeFile || !this.activeFilePath) {
      return;
    }
    const path = this.activeFilePath;
    const current = cloneCommandFile(this.activeFile);
    const next = this.fileHistory.peekRedo(path);
    if (!next) {
      return;
    }
    const selection = this.selectionSectionId;
    this.selectionSectionId = null;
    const saved = await this.saveCurrentFile(next, () => this.fileHistory.commitRedo(path, current));
    if (!saved) {
      this.selectionSectionId = selection;
    }
  }

  private async saveCurrentFile(next: CommandFile, onCommitted: () => void): Promise<boolean> {
    if (!this.activeFilePath) {
      return false;
    }
    const path = this.activeFilePath;
    try {
      if (this.desktopRuntime) {
        if (!this.workspaceRoot) {
          throw new Error("No workspace is active.");
        }
        const saved = await writeCommandFile(
          this.workspaceRoot,
          path,
          serializeCommandFile(next),
          this.fileSources.get(path) ?? "",
        );
        this.fileSources.set(path, saved);
      }
      onCommitted();
      this.activeFile = next;
      this.files.set(path, next);
      const hasFavoriteCommands = this.settings.favorites.some(
        (favorite) => favorite.kind === "command" && favorite.filePath === path,
      );
      const prunedFavorites = this.pruneCommandFavorites(path, next);
      if (hasFavoriteCommands || prunedFavorites) {
        this.renderExplorer();
      }
      if (prunedFavorites) {
        void this.persistSettings(false);
      }
      this.rebuildSearchIndex();
      this.renderActiveFile();
      return true;
    } catch (error) {
      await this.showServiceFailure("Could not save command file", error);
      return false;
    }
  }

  private findCommand(commandId: string) {
    return this.activeFile ? findCommandInFile(this.activeFile, commandId) : null;
  }

  private rememberSection(sectionId: string, expanded: boolean): void {
    if (!this.activeFilePath) {
      return;
    }
    const key = sectionStateKey(this.activeFilePath, sectionId);
    this.sectionStateInitializedFiles.add(this.activeFilePath);
    this.transientExpandedSections[expanded ? "add" : "delete"](key);
    if (!this.settings.rememberExpandedSections) {
      return;
    }
    const set = new Set(this.settings.expandedSections);
    set[expanded ? "add" : "delete"](key);
    this.settings.expandedSections = [...set];
    const stateFiles = new Set(this.settings.sectionStateFiles);
    stateFiles.add(this.activeFilePath);
    this.settings.sectionStateFiles = [...stateFiles];
    void this.persistSettings(false);
  }

  private isExampleColumnVisible(section: CommandSection): boolean {
    if (!this.activeFilePath) {
      return false;
    }
    if (!section.commands.some((command) => command.example?.trim())) {
      return false;
    }
    return this.exampleColumnOverrides.get(sectionStateKey(this.activeFilePath, section.id)) ?? true;
  }

  private setExampleColumnVisible(sectionId: string, visible: boolean): void {
    if (!this.activeFilePath) {
      return;
    }
    this.exampleColumnOverrides.set(sectionStateKey(this.activeFilePath, sectionId), visible);
  }

  private setSelectionMode(sectionId: string, active: boolean): void {
    this.selectionSectionId = active ? sectionId : null;
    this.renderActiveFile();
  }

  private async bulkDeleteCommands(sectionId: string, commandIds: string[]): Promise<void> {
    if (!this.activeFile || commandIds.length === 0) {
      return;
    }
    const selected = new Set(commandIds);
    const section = this.activeFile.sections.find((candidate) => candidate.id === sectionId);
    const count = section?.commands.filter((command) => selected.has(command.id)).length ?? 0;
    if (count === 0) {
      return;
    }
    const confirmed = await openConfirm({
      title: "Delete Selected Commands",
      message: `Delete ${count} selected ${count === 1 ? "command" : "commands"}?`,
      detail: "The entire batch can be restored with one Undo action during this session.",
      confirmLabel: "DELETE SELECTED",
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    this.selectionSectionId = null;
    if (this.activeFilePath) {
      this.transientExpandedSections.add(sectionStateKey(this.activeFilePath, sectionId));
    }
    const saved = await this.updateCurrentFile((file) => {
      const target = file.sections.find((candidate) => candidate.id === sectionId);
      if (target) {
        target.commands = target.commands.filter((command) => !selected.has(command.id));
      }
    });
    if (!saved) {
      this.selectionSectionId = sectionId;
    }
  }

  private async bulkMoveCommands(sectionId: string, commandIds: string[]): Promise<void> {
    if (!this.activeFile || !this.activeFilePath || commandIds.length === 0) {
      return;
    }
    const targetId = await chooseSection(
      this.activeFile.sections.filter((section) => section.id !== sectionId),
    );
    if (!targetId) {
      return;
    }
    const selected = new Set(commandIds);
    this.selectionSectionId = null;
    this.transientExpandedSections.add(sectionStateKey(this.activeFilePath, sectionId));
    this.transientExpandedSections.add(sectionStateKey(this.activeFilePath, targetId));
    const saved = await this.updateCurrentFile((file) => {
      const source = file.sections.find((section) => section.id === sectionId);
      const target = file.sections.find((section) => section.id === targetId);
      if (!source || !target) {
        return;
      }
      const moved = source.commands.filter((command) => selected.has(command.id));
      source.commands = source.commands.filter((command) => !selected.has(command.id));
      target.commands.push(...moved);
    });
    if (!saved) {
      this.selectionSectionId = sectionId;
    }
  }

  private async copyCommand(value: string, trigger: HTMLButtonElement): Promise<void> {
    try {
      await copyText(value);
      if (trigger.classList.contains("example-copy")) {
        trigger.classList.add("copied");
        window.setTimeout(() => trigger.classList.remove("copied"), 1200);
        return;
      }
      const previous = trigger.textContent;
      trigger.textContent = "COPIED";
      window.setTimeout(() => {
        if (trigger.isConnected) {
          trigger.textContent = previous;
        }
      }, 1200);
    } catch (error) {
      await this.showServiceFailure("Could not copy command", error);
    }
  }

  private queueSearch(query: string): void {
    if (this.searchTimer !== null) {
      window.clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    const generation = ++this.searchGeneration;
    if (!query.trim()) {
      this.toolbar.setResults(null);
      return;
    }
    this.searchTimer = window.setTimeout(() => {
      this.searchTimer = null;
      this.search(query, generation);
    }, 120);
  }

  private search(query: string, generation: number): void {
    if (generation !== this.searchGeneration) {
      return;
    }
    if (!query.trim()) {
      this.toolbar.setResults(null);
      return;
    }
    this.renderSearchResults(rankSearchDocuments(this.searchIndex, query, 100));
  }

  private rebuildSearchIndex(): void {
    const records: SearchDocument<SearchResult>[] = [];
    const textCache = createSearchTextCache();
    let order = 0;
    this.files.forEach((file, filePath) => {
      records.push(createSearchDocument(
        { filePath, fileTitle: file.title },
        [
          { text: file.title, priority: 3 },
          { text: file.description, priority: 1 },
        ],
        order++,
        textCache,
      ));
      file.sections.forEach((section) => {
        records.push(createSearchDocument(
          {
            filePath,
            fileTitle: file.title,
            sectionId: section.id,
            sectionTitle: section.title,
          },
          [
            { text: section.title, priority: 3 },
            { text: file.title, priority: 2 },
          ],
          order++,
          textCache,
        ));
        section.commands.forEach((command) => {
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
              { text: command.name, priority: 3 },
              { text: command.command, priority: 3 },
              { text: section.title, priority: 2 },
              { text: file.title, priority: 2 },
              { text: command.description, priority: 1 },
              { text: command.example, priority: 1 },
              { text: command.notes, priority: 1 },
            ],
            order++,
            textCache,
          ));
        });
      });
    });
    this.searchIndex = records;
  }

  private renderSearchResults(results: RankedSearchResult<SearchResult>[]): void {
    if (results.length === 0) {
      this.toolbar.setResults(element("p", "search-result-empty", "No matching commands."));
      return;
    }
    const list = element("div", "search-result-list");
    results.forEach((ranked) => {
      const result = ranked.result;
      const item = button("search-result", "");
      item.setAttribute("role", "option");
      const title = element("span", "search-result-title-row");
      title.append(
        element("span", "search-result-title", result.commandName ?? result.sectionTitle ?? result.fileTitle),
      );
      if (ranked.matchKind === "near") {
        title.append(element("span", "search-result-near", "NEAR"));
      }
      item.append(
        title,
        element(
          "span",
          "search-result-path",
          [result.fileTitle, result.sectionTitle].filter(Boolean).join(" › "),
        ),
      );
      if (result.command) {
        item.append(element("code", "search-result-command", result.command));
      }
      item.addEventListener("click", () => {
        this.toolbar.clearSearch();
        void this.openFile(result.filePath, {
          sectionId: result.sectionId,
          commandId: result.commandId,
        });
      });
      list.append(item);
    });
    this.toolbar.setResults(list);
  }

  private openSettings(): void {
    const originalThemeMode = this.settings.themeMode;
    const originalAccentTheme = this.settings.accentTheme;
    const originalCustomThemes = structuredClone(this.settings.customThemes);
    const form = element("form", "modal-form");
    const profileField = element("label", "form-field");
    profileField.append(element("span", undefined, "Local profile name"));
    const profileName = element("input");
    profileName.type = "text";
    profileName.maxLength = 64;
    profileName.autocomplete = "name";
    profileName.value = this.settings.displayName ?? "";
    profileField.append(profileName);
    form.append(profileField);
    const workspaceField = element("label", "form-field");
    workspaceField.append(element("span", undefined, "Workspace"));
    const workspaceRow = element("div", "settings-workspace-row");
    workspaceRow.append(element("code", undefined, this.workspaceRoot ?? "No workspace selected"));
    const change = button("inline-button", "CHANGE");
    workspaceRow.append(change);
    workspaceField.append(workspaceRow);
    form.append(workspaceField);

    const versionField = element("label", "form-field");
    versionField.append(element("span", undefined, "Command Vault version"));
    versionField.append(element("code", "settings-version", this.appVersion));
    form.append(versionField);

    const theme = themeField(
      form,
      this.settings.themeMode,
      this.settings.accentTheme,
      this.settings.customThemes,
      (mode, accent, customThemes) => this.applyTheme(mode, accent, customThemes),
    );
    const sizes = element("div", "form-columns");
    const uiScale = scaleField(form, this.settings.uiScale);
    const uiSize = numberField(sizes, "UI font size", this.settings.uiFontSize, 11, 20);
    const codeSize = numberField(sizes, "Code font size", this.settings.codeFontSize, 11, 22);
    form.append(sizes);
    const remember = checkboxField(
      form,
      "Remember expanded sections",
      this.settings.rememberExpandedSections,
    );

    const save = async (): Promise<void> => {
      const nextDisplayName = normalizeDisplayName(profileName.value);
      const nextUi = Number(uiSize.value);
      const nextCode = Number(codeSize.value);
      const rawScale = Number(uiScale.value);
      const nextScale = clampUiScale(rawScale);
      if (
        !nextDisplayName ||
        nextUi < 11 ||
        nextUi > 20 ||
        nextCode < 11 ||
        nextCode > 22 ||
        !Number.isFinite(rawScale) ||
        rawScale < 75 ||
        rawScale > 200
      ) {
        modal.setError(
          !nextDisplayName
            ? "Local profile name must contain 1 to 32 characters."
            : "Font sizes or UI scale are outside the supported range.",
        );
        return;
      }
      if (!theme.valid()) {
        modal.setError("Custom theme colors must use #RRGGBB format.");
        return;
      }
      const next: AppSettings = {
        ...this.settings,
        displayName: nextDisplayName,
        uiFontSize: nextUi,
        codeFontSize: nextCode,
        uiScale: nextScale,
        themeMode: theme.mode(),
        accentTheme: theme.accent(),
        customThemes: theme.customThemes(),
        rememberExpandedSections: remember.checked,
        ...(!remember.checked ? { expandedSections: [], sectionStateFiles: [] } : {}),
      };
      try {
        await saveSettings(next);
        this.settings = next;
        this.applySettings();
        this.toolbar.setProfileName(nextDisplayName);
        modal.close(false);
      } catch (error) {
        modal.setError(normalizeServiceError(error).message);
      }
    };

    const modal = openModal(
      "Settings",
      form,
      [
        { label: "CANCEL", action: () => modal.close() },
        {
          label: "SAVE",
          primary: true,
          action: save,
        },
      ],
      false,
      () => this.applyTheme(originalThemeMode, originalAccentTheme, originalCustomThemes),
    );
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void save();
    });
    change.addEventListener("click", () => {
      modal.close();
      void this.chooseAndOpenWorkspace();
    });
  }

  private applySettings(): void {
    const scale = clampUiScale(this.settings.uiScale);
    this.settings.uiScale = scale;
    document.documentElement.style.setProperty("--ui-font-size", `${this.settings.uiFontSize}px`);
    document.documentElement.style.setProperty("--code-font-size", `${this.settings.codeFontSize}px`);
    document.documentElement.style.setProperty("--ui-scale-factor", String(scale / 100));
    this.applyTheme(this.settings.themeMode, this.settings.accentTheme, this.settings.customThemes);
  }

  private applyTheme(mode: ThemeMode, accent: AccentTheme, customThemes: CustomThemes): void {
    document.documentElement.dataset.theme = mode;
    document.documentElement.dataset.accent = accent;
    const custom = customThemes[mode];
    document.documentElement.dataset.customTheme = String(custom.enabled);
    document.documentElement.style.setProperty("--custom-background", custom.background);
    document.documentElement.style.setProperty("--custom-text", custom.text);
    document.documentElement.style.setProperty("--custom-accent", custom.accent);
  }

  private setUiScale(value: number): void {
    const next = clampUiScale(value);
    if (next === this.settings.uiScale) {
      return;
    }
    this.settings.uiScale = next;
    this.applySettings();
    void this.persistSettings(false);
  }

  private async persistSettings(reportFailure: boolean): Promise<void> {
    try {
      await saveSettings(this.settings);
    } catch (error) {
      if (reportFailure) {
        throw error;
      }
      console.error("Could not save settings", normalizeServiceError(error));
    }
  }

  private installKeyboardShortcuts(): void {
    document.addEventListener("keydown", (event) => {
      if (
        event.key === "Escape" &&
        this.toolbar.input.value &&
        !document.querySelector(".modal-overlay, .context-menu")
      ) {
        this.toolbar.clearSearch();
        this.toolbar.input.blur();
        return;
      }
      if (!event.ctrlKey) {
        return;
      }
      const key = event.key.toLowerCase();
      const activeForm = document.querySelector<HTMLFormElement>(".modal-form");
      if (document.querySelector(".modal-overlay")) {
        if (key === "s" && activeForm) {
          event.preventDefault();
          activeForm.requestSubmit();
        }
        return;
      }
      if ((key === "z" || key === "y") && isTextEditingTarget(event.target)) {
        return;
      }
      if (key === "k") {
        event.preventDefault();
        this.toolbar.focusSearch();
      } else if (key === ",") {
        event.preventDefault();
        this.openSettings();
      } else if (key === "+" || key === "=") {
        event.preventDefault();
        this.setUiScale(this.settings.uiScale + 10);
      } else if (key === "-") {
        event.preventDefault();
        this.setUiScale(this.settings.uiScale - 10);
      } else if (key === "0") {
        event.preventDefault();
        this.setUiScale(100);
      } else if (key === "n" && event.shiftKey) {
        event.preventDefault();
        void this.newFolder();
      } else if (key === "n") {
        event.preventDefault();
        void this.newFile();
      } else if (key === "s") {
        event.preventDefault();
      } else if (key === "z" && event.shiftKey) {
        event.preventDefault();
        void this.redoCurrentFile();
      } else if (key === "z") {
        event.preventDefault();
        void this.undoCurrentFile();
      } else if (key === "y") {
        event.preventDefault();
        void this.redoCurrentFile();
      }
    });
  }

  private async installWindowPersistence(): Promise<void> {
    if (!this.desktopRuntime) {
      return;
    }
    if (this.settings.windowWidth && this.settings.windowHeight) {
      try {
        await restoreWindowSize(this.settings.windowWidth, this.settings.windowHeight);
      } catch (error) {
        console.error("Could not restore window size", normalizeServiceError(error));
      }
    }

    let saveTimer: number | null = null;
    window.addEventListener("resize", () => {
      if (saveTimer !== null) {
        window.clearTimeout(saveTimer);
      }
      saveTimer = window.setTimeout(() => {
        saveTimer = null;
        this.settings.windowWidth = window.innerWidth;
        this.settings.windowHeight = window.innerHeight;
        void this.persistSettings(false);
      }, 400);
    });
  }

  private async installLifecycleRecovery(): Promise<void> {
    const markHidden = (): void => {
      this.lifecycleLastTick = Date.now();
    };
    const markVisible = (): void => {
      const elapsed = Date.now() - this.lifecycleLastTick;
      this.lifecycleLastTick = Date.now();
      this.scheduleLifecycleRecovery(elapsed > 5_000);
    };
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") markVisible();
      else markHidden();
    });
    window.addEventListener("pageshow", markVisible);
    window.addEventListener("focus", markVisible);
    if (this.desktopRuntime) {
      try {
        await getCurrentWindow().onFocusChanged(({ payload: focused }) => {
          if (focused) markVisible();
          else markHidden();
        });
      } catch (error) {
        console.warn("Could not install native focus recovery", normalizeServiceError(error));
      }
    }
    window.setInterval(() => {
      const now = Date.now();
      const delayed = now - this.lifecycleLastTick > 15_000;
      this.lifecycleLastTick = now;
      if (delayed && document.visibilityState === "visible") {
        this.scheduleLifecycleRecovery(true);
      }
    }, 5_000);
    if ("__COMMAND_VAULT_E2E__" in window) {
      (window as unknown as { __COMMAND_VAULT_TRIGGER_RECOVERY__: () => void })
        .__COMMAND_VAULT_TRIGGER_RECOVERY__ = () => this.scheduleLifecycleRecovery(true);
    }
  }

  private scheduleLifecycleRecovery(checkWorkspace: boolean): void {
    this.lifecycleNeedsWorkspaceCheck ||= checkWorkspace;
    if (this.lifecycleTimer !== null) {
      window.clearTimeout(this.lifecycleTimer);
    }
    this.lifecycleTimer = window.setTimeout(() => {
      this.lifecycleTimer = null;
      void this.recoverLifecycle();
    }, 100);
  }

  private async recoverLifecycle(): Promise<void> {
    this.activeTable?.refreshLayout();
    const shouldCheckWorkspace = this.lifecycleNeedsWorkspaceCheck;
    this.lifecycleNeedsWorkspaceCheck = false;
    if (!shouldCheckWorkspace || !this.workspaceRoot || this.recoveryInFlight) {
      return;
    }
    if (document.querySelector(".modal-overlay")) {
      this.lifecycleNeedsWorkspaceCheck = true;
      this.lifecycleTimer = window.setTimeout(() => {
        this.lifecycleTimer = null;
        void this.recoverLifecycle();
      }, 750);
      return;
    }
    this.recoveryInFlight = true;
    const wasDashboard = this.showingDashboard;
    this.setRecoveryNotice("RESTORING WORKSPACE…");
    try {
      await this.refreshWorkspace(true);
      if (wasDashboard) {
        this.renderWelcomeDashboard();
      }
      this.activeTable?.refreshLayout();
      this.setRecoveryNotice(null);
    } catch (error) {
      const failure = normalizeServiceError(error);
      this.setRecoveryNotice(`RECOVERY FAILED · ${failure.message}`, true);
    } finally {
      this.recoveryInFlight = false;
    }
  }

  private setRecoveryNotice(message: string | null, retry = false): void {
    this.root.querySelector(".recovery-notice")?.remove();
    if (!message) {
      return;
    }
    const notice = element("div", `recovery-notice${retry ? " error" : ""}`);
    notice.append(element("span", undefined, message));
    if (retry) {
      const action = button("inline-button", "RETRY");
      action.addEventListener("click", () => this.scheduleLifecycleRecovery(true));
      notice.append(action);
    }
    this.root.querySelector(".app-shell")?.append(notice);
  }

  private renderNoWorkspace(): void {
    this.renderEmptyState(
      "No workspace selected",
      "Choose a folder where Command Vault will keep real folders and .cmdnote files.",
      "OPEN FOLDER",
      () => void this.chooseAndOpenWorkspace(),
    );
  }

  private async collectDisplayName(): Promise<void> {
    this.showingDashboard = false;
    this.renderExplorer();
    this.clearActiveTable();
    await new Promise<void>((resolve) => {
      const onboarding = element("section", "profile-onboarding");
      const panel = element("div", "profile-onboarding-panel");
      const mark = element("span", "profile-onboarding-mark", "◇");
      const eyebrow = element("p", "welcome-eyebrow", "LOCAL PROFILE · NO ACCOUNT REQUIRED");
      const title = element("h1", undefined, "Who’s using Command Vault?");
      const description = element(
        "p",
        "profile-onboarding-copy",
        "Choose the name shown in your private local workspace. Nothing is sent online.",
      );
      const form = element("form", "profile-onboarding-form");
      const label = element("label");
      label.append(element("span", undefined, "DISPLAY NAME"));
      const input = element("input");
      input.type = "text";
      input.maxLength = 64;
      input.autocomplete = "name";
      input.placeholder = "Your name";
      label.append(input);
      const error = element("p", "profile-onboarding-error");
      error.hidden = true;
      const submit = button("primary-button profile-enter", "ENTER VAULT");
      submit.addEventListener("click", () => form.requestSubmit());
      form.append(label, error, submit);
      panel.append(mark, eyebrow, title, description, form);
      onboarding.append(panel);
      this.workspace.replaceChildren(onboarding);

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const displayName = normalizeDisplayName(input.value);
        if (!displayName) {
          error.textContent = "Use a name from 1 to 32 characters.";
          error.hidden = false;
          input.focus();
          return;
        }
        submit.disabled = true;
        try {
          this.settings.displayName = displayName;
          await saveSettings(this.settings);
          this.toolbar.setProfileName(displayName);
          resolve();
        } catch (saveError) {
          submit.disabled = false;
          error.textContent = normalizeServiceError(saveError).message;
          error.hidden = false;
        }
      });
      queueMicrotask(() => input.focus());
    });
  }

  private renderWelcomeDashboard(): void {
    if (!this.settings.displayName) {
      return;
    }
    this.showingDashboard = true;
    this.toolbar.clearSearch();
    this.clearActiveTable();
    const continuePath = this.settings.lastOpenedFile && this.files.has(this.settings.lastOpenedFile)
      ? this.settings.lastOpenedFile
      : null;
    const firstPath = flattenFiles(this.entries)[0]?.path ?? null;
    const favorites: DashboardFavorite[] = this.explorerFavoriteItems().map((item) => ({
      label: item.label,
      detail: item.detail,
      onOpen: () => {
        if (item.favorite.kind === "folder") {
          this.openFavoriteFolder(item.favorite.path);
        } else if (item.favorite.kind === "file") {
          void this.openFile(item.favorite.path);
        } else {
          void this.openFavoriteCommand(item.favorite.filePath, item.favorite.commandId);
        }
      },
    }));
    const counts = [...this.files.values()].reduce(
      (total, file) => {
        total.sections += file.sections.length;
        total.commands += file.sections.reduce((count, section) => count + section.commands.length, 0);
        return total;
      },
      {
        folders: flattenFolders(this.entries).length,
        files: this.files.size,
        sections: 0,
        commands: 0,
      },
    );
    const dashboard = createWelcomeDashboard({
      displayName: this.settings.displayName,
      workspaceRoot: this.workspaceRoot,
      continueLabel: continuePath ? commandFileLabel(continuePath) : null,
      counts,
      favorites,
      loading: this.workspaceLoading,
      onContinue: () => {
        const target = continuePath ?? firstPath;
        if (target) {
          void this.openFile(target);
        } else if (this.workspaceRoot) {
          void this.newFile();
        } else {
          void this.chooseAndOpenWorkspace();
        }
      },
      onOpenWorkspace: () => void this.chooseAndOpenWorkspace(),
      onCreateFile: () => void this.newFile(),
    });
    this.workspace.replaceChildren(dashboard);
  }

  private renderWorkspaceMissing(detail: string): void {
    this.renderEmptyState(
      "Workspace not found",
      detail,
      "CHOOSE ANOTHER FOLDER",
      () => void this.chooseAndOpenWorkspace(),
      true,
    );
  }

  private renderWorkspaceEmpty(detail = "Create a folder or command file from the Explorer menu."): void {
    this.renderEmptyState("Workspace is ready", detail, "+ NEW COMMAND FILE", () => void this.newFile());
  }

  private renderFileError(path: string, detail: string): void {
    this.renderEmptyState(
      "Command file could not be loaded",
      `${path}\n\n${detail}\n\nCurrent Command Vault version: ${this.appVersion}\nInstall a version compatible with this command file format.\n\nThe original file was not modified.`,
      "REFRESH",
      () => void this.refreshWorkspaceFromUi(),
      true,
    );
  }

  private renderLoading(message: string): void {
    this.showingDashboard = false;
    this.clearActiveTable();
    const state = element("section", "empty-state loading-state");
    state.append(element("div", "empty-state-icon", "…"), element("h1", undefined, message));
    this.workspace.replaceChildren(state);
  }

  private renderEmptyState(
    title: string,
    message: string,
    actionLabel: string,
    action: () => void,
    error = false,
  ): void {
    this.showingDashboard = false;
    this.clearActiveTable();
    const state = element("section", `empty-state${error ? " error-state" : ""}`);
    const icon = element("div", "empty-state-icon", error ? "!" : ">_");
    icon.setAttribute("aria-hidden", "true");
    state.append(icon, element("h1", undefined, title), element("p", undefined, message));
    const actionButton = button("primary-button", actionLabel);
    actionButton.addEventListener("click", action);
    state.append(actionButton);
    this.workspace.replaceChildren(state);
  }

  private clearActiveTable(): void {
    this.activeTable?.dispose();
    this.activeTable = null;
  }

  private loadDevelopmentWorkspace(): void {
    const file = this.stressMode ? buildStressFile(this.stressRowCount) : demoCommandFile;
    const nmapPath = "/demo/Network/Nmap.cmdnote";
    this.workspaceRoot = "/demo";
    this.selectedFolder = "/demo/Network";
    this.activeFilePath = nmapPath;
    this.activeFile = file;
    this.entries = demoFilesystemEntries();
    this.files.set(nmapPath, file);
    this.fileSources.set(nmapPath, serializeCommandFile(file));
    this.files.set("/demo/Network/Wireshark.cmdnote", { ...demoCommandFile, title: "Wireshark" });
    this.files.set("/demo/Network/tcpdump.cmdnote", { ...demoCommandFile, title: "tcpdump" });
    this.files.set("/demo/Linux/Terminal.cmdnote", { ...demoCommandFile, title: "Linux Terminal" });
    this.files.set("/demo/Development/Git.cmdnote", { ...demoCommandFile, title: "Git" });
    this.rebuildSearchIndex();
    this.expandedFolders.add("/demo/Network");
    this.expandedFolders.add("/demo/Linux");
    this.expandedFolders.add("/demo/Development");
    this.expandedFolders.add("/demo/Other");
    this.renderExplorer();
    this.renderActiveFile();
  }

  private async showServiceFailure(title: string, error: unknown): Promise<void> {
    const failure = normalizeServiceError(error);
    await showMessage({ title, message: failure.message, detail: failure.code, kind: "error" });
  }

  private desktopOnlyMessage(): Promise<void> {
    return showMessage({
      title: "Desktop Feature",
      message: "Filesystem actions are available in the Tauri desktop window.",
    });
  }
}

function flattenFiles(entries: FilesystemEntry[]): FilesystemEntry[] {
  return entries.flatMap((entry) =>
    entry.kind === "command-file" ? [entry] : flattenFiles(entry.children),
  );
}

function flattenFolders(entries: FilesystemEntry[]): FilesystemEntry[] {
  return entries.flatMap((entry) =>
    entry.kind === "folder" ? [entry, ...flattenFolders(entry.children)] : [],
  );
}

function findFilesystemEntry(
  entries: FilesystemEntry[],
  path: string,
): FilesystemEntry | null {
  for (const entry of entries) {
    if (entry.path === path) {
      return entry;
    }
    if (entry.kind === "folder") {
      const nested = findFilesystemEntry(entry.children, path);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < values.length) {
      const index = next;
      next += 1;
      const value = values[index] as T;
      results[index] = await mapper(value);
      if ((index + 1) % 8 === 0) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

function commandIds(file: CommandFile): Set<string> {
  return new Set(file.sections.flatMap((section) => section.commands.map((command) => command.id)));
}

function cloneCommandFile(file: CommandFile): CommandFile {
  return {
    ...file,
    sections: file.sections.map((section) => ({
      ...section,
      commands: section.commands.map((command) => ({ ...command })),
    })),
  };
}

function findCommandInFile(file: CommandFile, id: string) {
  for (const section of file.sections) {
    const commandIndex = section.commands.findIndex((command) => command.id === id);
    if (commandIndex >= 0) {
      return { section, command: section.commands[commandIndex] as CommandEntry, commandIndex };
    }
  }
  return null;
}

function moveItem<T>(items: T[], from: number, to: number): void {
  if (from < 0 || to < 0 || from >= items.length || to >= items.length || from === to) {
    return;
  }
  const [item] = items.splice(from, 1);
  if (item !== undefined) {
    items.splice(to, 0, item);
  }
}

function replaceMap<K, V>(target: Map<K, V>, source: ReadonlyMap<K, V>): void {
  target.clear();
  source.forEach((value, key) => target.set(key, value));
}

function replaceSet<T>(target: Set<T>, source: ReadonlySet<T>): void {
  target.clear();
  source.forEach((value) => target.add(value));
}

function formatParseError(message: string, issues: Array<{ path: string; message: string }>): string {
  const details = issues.slice(0, 8).map((issue) => `${issue.path}: ${issue.message}`);
  return [message, ...details].join("\n");
}

function remapDescendantPath(oldRoot: string, newRoot: string, candidate: string): string | null {
  if (!isSameOrDescendant(oldRoot, candidate)) {
    return null;
  }
  return `${newRoot}${candidate.slice(oldRoot.length)}`;
}

function isSameOrDescendant(parent: string, candidate: string): boolean {
  return (
    candidate === parent || candidate.startsWith(`${parent}/`) || candidate.startsWith(`${parent}\\`)
  );
}

function isTextEditingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function parentDirectory(path: string): string | null {
  const separator = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return separator > 0 ? path.slice(0, separator) : null;
}

function commandFileLabel(path: string): string {
  const separator = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return path.slice(separator + 1).replace(/\.cmdnote$/i, "");
}

function sectionStateKey(filePath: string, sectionId: string): string {
  return `${filePath}::${sectionId}`;
}

function stressRowCountFromLocation(): number {
  const raw = new URLSearchParams(window.location.search).get("stress");
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 100;
  }
  return Math.min(5_000, Math.max(1, Math.floor(parsed)));
}

function demoFilesystemEntries(): FilesystemEntry[] {
  const file = (path: string, name: string): FilesystemEntry => ({
    name,
    path,
    kind: "command-file",
    children: [],
    revision: "demo",
  });
  return [
    {
      name: "Network",
      path: "/demo/Network",
      kind: "folder",
      revision: null,
      children: [
        file("/demo/Network/Wireshark.cmdnote", "Wireshark.cmdnote"),
        file("/demo/Network/Nmap.cmdnote", "Nmap.cmdnote"),
        file("/demo/Network/tcpdump.cmdnote", "tcpdump.cmdnote"),
      ],
    },
    {
      name: "Linux",
      path: "/demo/Linux",
      kind: "folder",
      revision: null,
      children: [file("/demo/Linux/Terminal.cmdnote", "Terminal.cmdnote")],
    },
    {
      name: "Development",
      path: "/demo/Development",
      kind: "folder",
      revision: null,
      children: [file("/demo/Development/Git.cmdnote", "Git.cmdnote")],
    },
    { name: "Other", path: "/demo/Other", kind: "folder", children: [], revision: null },
  ];
}

function numberField(
  parent: HTMLElement,
  labelText: string,
  value: number,
  min: number,
  max: number,
): HTMLInputElement {
  const label = element("label", "form-field");
  label.append(element("span", undefined, labelText));
  const input = element("input");
  input.type = "number";
  input.value = String(value);
  input.min = String(min);
  input.max = String(max);
  label.append(input);
  parent.append(label);
  return input;
}

function scaleField(parent: HTMLElement, value: number): HTMLInputElement {
  const field = element("section", "form-field scale-field");
  const header = element("div", "scale-field-header");
  header.append(element("span", undefined, "UI scale"));
  const output = element("output", "scale-output", `${value}%`);
  header.append(output);

  const controls = element("div", "scale-controls");
  const range = element("input");
  range.type = "range";
  range.min = "75";
  range.max = "200";
  range.step = "5";
  range.value = String(value);
  range.setAttribute("aria-label", "UI scale slider");

  const number = element("input", "scale-number");
  number.type = "number";
  number.min = "75";
  number.max = "200";
  number.step = "5";
  number.value = String(value);
  number.setAttribute("aria-label", "UI scale percentage");

  const reset = button("inline-button", "RESET");
  reset.title = "Reset UI scale to 100%";
  reset.addEventListener("click", () => sync(100));
  range.addEventListener("input", () => sync(Number(range.value)));
  number.addEventListener("input", () => {
    const parsed = Number(number.value);
    if (Number.isFinite(parsed)) {
      range.value = String(Math.min(200, Math.max(75, parsed)));
      output.textContent = `${parsed}%`;
    }
  });

  controls.append(range, number, element("span", "scale-percent", "%"), reset);
  field.append(
    header,
    controls,
    element("p", "form-help", "Scale the entire interface. Shortcuts: Ctrl++, Ctrl+-, Ctrl+0."),
  );
  parent.append(field);
  return number;

  function sync(next: number): void {
    const normalized = clampUiScale(next);
    range.value = String(normalized);
    number.value = String(normalized);
    output.textContent = `${normalized}%`;
  }
}

function clampUiScale(value: number): number {
  if (!Number.isFinite(value)) {
    return 100;
  }
  return Math.min(200, Math.max(75, Math.round(value)));
}

function checkboxField(parent: HTMLElement, labelText: string, checked: boolean): HTMLInputElement {
  const label = element("label", "checkbox-field");
  const input = element("input");
  input.type = "checkbox";
  input.checked = checked;
  label.append(input, element("span", undefined, labelText));
  parent.append(label);
  return input;
}

function themeField(
  parent: HTMLElement,
  initialMode: ThemeMode,
  initialAccent: AccentTheme,
  initialCustomThemes: CustomThemes,
  onPreview: (mode: ThemeMode, accent: AccentTheme, customThemes: CustomThemes) => void,
): {
  mode(): ThemeMode;
  accent(): AccentTheme;
  customThemes(): CustomThemes;
  valid(): boolean;
} {
  const customThemes = structuredClone(initialCustomThemes);
  const field = element("fieldset", "appearance-field");
  field.append(element("legend", "form-legend", "Appearance"));

  const modeGroup = element("div", "theme-mode-options");
  const modeInputs = new Map<ThemeMode, HTMLInputElement>();
  themeModes.forEach((mode) => {
    const label = element("label", "theme-mode-option");
    const input = element("input", "theme-choice-input");
    input.type = "radio";
    input.name = "theme-mode";
    input.value = mode;
    input.checked = mode === initialMode;
    const card = element("span", "theme-mode-card");
    card.append(
      element("span", `theme-mode-preview ${mode}`),
      element("span", undefined, mode.toUpperCase()),
    );
    input.addEventListener("change", () => {
      loadCustomMode();
      preview();
    });
    modeInputs.set(mode, input);
    label.append(input, card);
    modeGroup.append(label);
  });

  const accentLabel = element("span", "appearance-subtitle", "Accent color");
  const accentGroup = element("div", "theme-accent-options");
  const accentInputs = new Map<AccentTheme, HTMLInputElement>();
  accentThemes.forEach((accent) => {
    const label = element("label", "theme-accent-option");
    const input = element("input", "theme-choice-input");
    input.type = "radio";
    input.name = "accent-theme";
    input.value = accent;
    input.checked = accent === initialAccent;
    input.addEventListener("change", preview);
    accentInputs.set(accent, input);
    label.append(
      input,
      element("span", `theme-accent-swatch ${accent}`),
      element("span", "theme-accent-name", accent.toUpperCase()),
    );
    accentGroup.append(label);
  });

  const customToggle = element("label", "checkbox-field custom-theme-toggle");
  const customEnabled = element("input");
  customEnabled.type = "checkbox";
  customEnabled.addEventListener("change", () => {
    customThemes[selectedMode()].enabled = customEnabled.checked;
    refreshCustomState();
    preview();
  });
  customToggle.append(
    customEnabled,
    element("span", undefined, "Use custom colors for this mode"),
  );

  const editor = element("div", "custom-theme-editor");
  const background = colorControl(editor, "Background");
  const text = colorControl(editor, "Text");
  const accent = colorControl(editor, "Accent");
  const contrast = element("p", "custom-theme-contrast");
  contrast.setAttribute("role", "status");
  const previewCard = element("div", "custom-theme-preview");
  previewCard.append(
    element("strong", undefined, "COMMAND VAULT PREVIEW"),
    element("p", undefined, "Information text and active accent"),
    element("code", undefined, "nmap -sV 192.168.1.10"),
    element("span", "custom-theme-preview-button", "COPY"),
  );
  const reset = button("inline-button custom-theme-reset", "RESET CURRENT MODE");
  reset.addEventListener("click", () => {
    customThemes[selectedMode()] = structuredClone(defaultCustomThemes[selectedMode()]);
    loadCustomMode();
    preview();
  });

  [background, text, accent].forEach((control) => {
    control.color.addEventListener("input", () => {
      control.hex.value = control.color.value;
      updateDraft();
    });
    control.hex.addEventListener("input", updateDraft);
  });

  field.append(
    modeGroup,
    accentLabel,
    accentGroup,
    customToggle,
    editor,
    contrast,
    previewCard,
    reset,
  );
  parent.append(field);
  loadCustomMode();
  return {
    mode: selectedMode,
    accent: selectedAccent,
    customThemes: () => structuredClone(customThemes),
    valid: () => themeModes.every((mode) => validColors(customThemes[mode])),
  };

  function selectedMode(): ThemeMode {
    return themeModes.find((mode) => modeInputs.get(mode)?.checked) ?? initialMode;
  }

  function selectedAccent(): AccentTheme {
    return accentThemes.find((accent) => accentInputs.get(accent)?.checked) ?? initialAccent;
  }

  function preview(): void {
    const colors = customThemes[selectedMode()];
    updateContrast(colors);
    if (validColors(colors)) {
      onPreview(selectedMode(), selectedAccent(), structuredClone(customThemes));
    }
  }

  function updateDraft(): void {
    const mode = selectedMode();
    customThemes[mode] = {
      enabled: customEnabled.checked,
      background: background.hex.value.trim().toLowerCase(),
      text: text.hex.value.trim().toLowerCase(),
      accent: accent.hex.value.trim().toLowerCase(),
    };
    refreshInputValidity();
    preview();
  }

  function loadCustomMode(): void {
    const colors = customThemes[selectedMode()];
    customEnabled.checked = colors.enabled;
    syncControl(background, colors.background);
    syncControl(text, colors.text);
    syncControl(accent, colors.accent);
    refreshCustomState();
    refreshInputValidity();
    updateContrast(colors);
  }

  function refreshCustomState(): void {
    const enabled = customEnabled.checked;
    editor.classList.toggle("disabled", !enabled);
    [background, text, accent].forEach((control) => {
      control.color.disabled = !enabled;
      control.hex.disabled = !enabled;
    });
    accentInputs.forEach((input) => {
      input.disabled = enabled;
    });
  }

  function refreshInputValidity(): void {
    [background, text, accent].forEach((control) => {
      control.hex.classList.toggle("invalid", !isHexColor(control.hex.value.trim()));
    });
  }

  function updateContrast(colors: CustomThemes["dark"]): void {
    if (!validColors(colors)) {
      contrast.className = "custom-theme-contrast warning";
      contrast.textContent = "Enter valid #RRGGBB values to preview this theme.";
      return;
    }
    const panel = mixHex(colors.background, colors.text, 0.94);
    const textRatio = Math.min(
      contrastRatio(colors.text, colors.background),
      contrastRatio(colors.text, panel),
    );
    const accentRatio = Math.min(
      contrastRatio(colors.accent, colors.background),
      contrastRatio(colors.accent, panel),
    );
    const warning = colors.enabled && (textRatio < 4.5 || accentRatio < 4.5);
    contrast.className = `custom-theme-contrast${warning ? " warning" : ""}`;
    contrast.textContent = colors.enabled
      ? `Text ${textRatio.toFixed(2)}:1 · Accent ${accentRatio.toFixed(2)}:1${warning ? " · Low contrast warning" : " · Contrast looks good"}`
      : "Custom colors are off; the selected preset is active.";
  }
}

interface ColorControl {
  color: HTMLInputElement;
  hex: HTMLInputElement;
}

function colorControl(parent: HTMLElement, name: string): ColorControl {
  const label = element("label", "custom-color-control");
  label.append(element("span", undefined, name));
  const inputs = element("span", "custom-color-inputs");
  const color = element("input");
  color.type = "color";
  color.setAttribute("aria-label", `${name} color picker`);
  const hex = element("input");
  hex.type = "text";
  hex.maxLength = 7;
  hex.spellcheck = false;
  hex.setAttribute("aria-label", `${name} HEX`);
  inputs.append(color, hex);
  label.append(inputs);
  parent.append(label);
  return { color, hex };
}

function syncControl(control: ColorControl, value: string): void {
  control.hex.value = value;
  if (isHexColor(value)) {
    control.color.value = value;
  }
}

function validColors(colors: CustomThemes["dark"]): boolean {
  return isHexColor(colors.background) && isHexColor(colors.text) && isHexColor(colors.accent);
}

function chooseSection(sections: CommandSection[]): Promise<string | null> {
  return new Promise((resolve) => {
    const form = element("form", "modal-form");
    const label = element("label", "form-field");
    label.append(element("span", undefined, "Section"));
    const select = element("select");
    sections.forEach((section) => {
      const option = element("option", undefined, section.title);
      option.value = section.id;
      select.append(option);
    });
    label.append(select);
    form.append(label);
    const modal = openModal(
      "Move to Section",
      form,
      [
        { label: "CANCEL", action: () => finish(null) },
        { label: "MOVE", primary: true, action: () => finish(select.value) },
      ],
      false,
      () => resolve(null),
    );
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      finish(select.value);
    });
    function finish(value: string | null): void {
      modal.close(false);
      resolve(value);
    }
  });
}
