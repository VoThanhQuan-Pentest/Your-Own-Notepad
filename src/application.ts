import { createCommandTable } from "./components/command-table";
import { openCommandForm } from "./components/command-form";
import { createExplorer } from "./components/explorer";
import { openMenu } from "./components/menu";
import { openConfirm, openModal, openPrompt, showMessage } from "./components/modal";
import { createToolbar, type ToolbarHandle } from "./components/toolbar";
import { buildStressFile, demoCommandFile } from "./demo-data";
import type {
  CommandAction,
  CommandEntry,
  CommandFile,
  CommandSection,
  CommandSectionLayout,
} from "./models/command-file";
import type { FilesystemEntry } from "./models/filesystem";
import { defaultSettings, type AppSettings } from "./models/settings";
import { copyText } from "./services/clipboard";
import { executeProgram, openExternal, openTerminal } from "./services/commands";
import {
  createCommandFile,
  createFolder,
  deleteEntry,
  listDirectory,
  readCommandFile,
  renameEntry,
  writeCommandFile,
} from "./services/filesystem";
import { isTauriRuntime, normalizeServiceError } from "./services/runtime";
import { loadSettings, saveSettings } from "./services/settings";
import { chooseWorkspace } from "./services/workspace";
import { restoreWindowSize } from "./services/window";
import { button, element } from "./utils/dom";
import { createId } from "./utils/ids";
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

interface WorkspaceSnapshot {
  workspaceRoot: string | null;
  selectedFolder: string | null;
  activeFilePath: string | null;
  activeFile: CommandFile | null;
  entries: FilesystemEntry[];
  files: Map<string, CommandFile>;
  fileSources: Map<string, string>;
  fileErrors: Map<string, string>;
  expandedFolders: Set<string>;
  transientExpandedSections: Set<string>;
  sectionStateInitializedFiles: Set<string>;
}

export class CommandVaultApplication {
  private readonly root: HTMLElement;
  private readonly desktopRuntime = isTauriRuntime();
  private readonly stressMode = new URLSearchParams(window.location.search).has("stress");
  private readonly workspace = element("main", "workspace");
  private readonly body = element("div", "app-body");
  private readonly toolbar: ToolbarHandle;
  private explorer: HTMLElement | null = null;
  private settings: AppSettings = structuredClone(defaultSettings);
  private workspaceRoot: string | null = null;
  private selectedFolder: string | null = null;
  private activeFilePath: string | null = null;
  private activeFile: CommandFile | null = null;
  private entries: FilesystemEntry[] = [];
  private readonly files = new Map<string, CommandFile>();
  private readonly fileSources = new Map<string, string>();
  private readonly fileErrors = new Map<string, string>();
  private readonly expandedFolders = new Set<string>();
  private readonly transientExpandedSections = new Set<string>();
  private readonly sectionStateInitializedFiles = new Set<string>();

  constructor(root: HTMLElement) {
    this.root = root;
    this.toolbar = createToolbar({
      onSearch: (query) => this.search(query),
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
    this.installKeyboardShortcuts();
    await this.installWindowPersistence();

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
    this.renderNoWorkspace();
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
      callbacks: {
        onOpenFile: (path) => void this.openFile(path),
        onSelectFolder: (path) => this.selectFolder(path),
        onCreateFolder: (parent) => void this.newFolder(parent),
        onCreateFile: (parent) => void this.newFile(parent),
        onRename: (entry) => void this.renameFilesystemEntry(entry),
        onDelete: (entry) => void this.deleteFilesystemEntry(entry),
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
      fileErrors: new Map(this.fileErrors),
      expandedFolders: new Set(this.expandedFolders),
      transientExpandedSections: new Set(this.transientExpandedSections),
      sectionStateInitializedFiles: new Set(this.sectionStateInitializedFiles),
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
    replaceMap(this.fileErrors, snapshot.fileErrors);
    replaceSet(this.expandedFolders, snapshot.expandedFolders);
    replaceSet(this.transientExpandedSections, snapshot.transientExpandedSections);
    replaceSet(this.sectionStateInitializedFiles, snapshot.sectionStateInitializedFiles);
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
    this.fileErrors.clear();
    this.expandedFolders.clear();
    this.transientExpandedSections.clear();
    this.sectionStateInitializedFiles.clear();
    this.renderLoading("Reading workspace…");
    await this.refreshWorkspace(false);

    if (workspaceChanged) {
      this.settings.expandedSections = [];
      this.settings.sectionStateFiles = [];
    }
    this.settings.lastWorkspace = path;
    const candidate = restoreLastFile ? this.settings.lastOpenedFile : null;
    const firstFile = flattenFiles(this.entries)[0]?.path ?? null;
    const fileToOpen = candidate && this.files.has(candidate) ? candidate : firstFile;
    await this.persistSettings(false);

    if (fileToOpen) {
      await this.openFile(fileToOpen);
    } else {
      this.renderWorkspaceEmpty();
    }
  }

  private async refreshWorkspace(preserveActive: boolean): Promise<void> {
    if (!this.workspaceRoot) {
      return;
    }
    const active = preserveActive ? this.activeFilePath : null;
    const entries = await listDirectory(this.workspaceRoot);
    const paths = flattenFiles(entries).map((entry) => entry.path);
    const loaded = await Promise.all(
      paths.map(async (path) => {
        try {
          const source = await readCommandFile(this.workspaceRoot as string, path);
          const parsed = parseCommandFile(source);
          return parsed.ok
            ? ({ path, file: parsed.data, source } as const)
            : ({ path, error: formatParseError(parsed.error.message, parsed.error.issues) } as const);
        } catch (error) {
          return ({ path, error: normalizeServiceError(error).message } as const);
        }
      }),
    );

    this.entries = entries;
    this.files.clear();
    this.fileSources.clear();
    this.fileErrors.clear();
    loaded.forEach((item) => {
      if ("file" in item && item.file) {
        this.files.set(item.path, item.file);
        this.fileSources.set(item.path, item.source);
      } else {
        this.fileErrors.set(item.path, item.error);
      }
    });
    entries
      .filter((entry) => entry.kind === "folder")
      .forEach((entry) => this.expandedFolders.add(entry.path));
    this.renderExplorer();

    if (active && this.files.has(active)) {
      await this.openFile(active);
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
  }

  private async refreshWorkspaceFromUi(): Promise<void> {
    try {
      await this.refreshWorkspace(true);
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
        this.fileErrors.clear();
        this.renderExplorer();
        this.renderWorkspaceMissing(failure.message);
        return;
      }
      await this.showServiceFailure("Could not refresh workspace", error);
    }
  }

  private async openFile(path: string, focus?: FocusTarget): Promise<void> {
    let file = this.files.get(path);
    if (this.desktopRuntime && this.workspaceRoot) {
      try {
        const source = await readCommandFile(this.workspaceRoot, path);
        const parsed = parseCommandFile(source);
        if (parsed.ok) {
          file = parsed.data;
          this.files.set(path, file);
          this.fileSources.set(path, source);
          this.fileErrors.delete(path);
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
      expandedSections: expanded,
      sectionStateInitialized,
      expandAllSections: this.stressMode,
      callbacks: {
        onAddSection: () => void this.addSection(),
        onAddTable: () => void this.addSection("table"),
        onAddCommand: (sectionId) => void this.addCommand(sectionId),
        onSectionToggle: (sectionId, isExpanded) => this.rememberSection(sectionId, isExpanded),
        onSectionMenu: (anchor, section) => this.openSectionMenu(anchor, section),
        onCommandMenu: (anchor, command) => this.openCommandMenu(anchor, command),
        onCommandAction: (action, command, generated, trigger) =>
          void this.performCommandAction(action, command, generated, trigger),
      },
    });
    this.workspace.replaceChildren(table);

    if (focus?.commandId || focus?.sectionId) {
      queueMicrotask(() => {
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
      title: isFolder ? "Delete Folder" : "Delete Command File",
      message: `Delete "${entry.name}"?`,
      detail: isFolder && entry.children.length > 0 ? "This folder contains entries. Its contents will also be deleted." : undefined,
      confirmLabel: "DELETE",
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    try {
      await deleteEntry(this.workspaceRoot, entry.path, isFolder && entry.children.length > 0);
      if (this.activeFilePath && isSameOrDescendant(entry.path, this.activeFilePath)) {
        this.activeFile = null;
        this.activeFilePath = null;
      }
      await this.refreshWorkspace(true);
      if (!this.activeFilePath) {
        this.renderWorkspaceEmpty();
      }
    } catch (error) {
      const failure = normalizeServiceError(error);
      if (isFolder && failure.code === "FOLDER_NOT_EMPTY") {
        const recursive = await openConfirm({
          title: "Folder Contains Other Files",
          message: `"${entry.name}" contains files that Command Vault does not display.`,
          detail: "Deleting it recursively will remove every file and subfolder inside it.",
          confirmLabel: "DELETE EVERYTHING",
          danger: true,
        });
        if (recursive) {
          try {
            await deleteEntry(this.workspaceRoot, entry.path, true);
            await this.refreshWorkspace(true);
            return;
          } catch (recursiveError) {
            await this.showServiceFailure("Could not delete folder", recursiveError);
            return;
          }
        }
        return;
      }
      await this.showServiceFailure("Could not delete entry", error);
    }
  }

  private async addSection(layout: CommandSectionLayout = "standard"): Promise<void> {
    if (!this.activeFile || !this.activeFilePath) {
      return;
    }
    const tableLayout = layout === "table";
    const name = await openPrompt({
      title: tableLayout ? "Add Compact Table" : "Add Section",
      label: tableLayout ? "Table Name" : "Section Name",
    });
    if (!name) {
      return;
    }
    const existing = new Set(this.activeFile.sections.map((section) => section.id));
    const section: CommandSection = {
      id: createId(name, existing),
      title: name,
      ...(tableLayout ? { layout: "table" as const } : {}),
      commands: [],
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
    await this.updateCurrentFile((file) => {
      file.sections = file.sections.filter((candidate) => candidate.id !== sectionId);
    });
  }

  private openCommandMenu(anchor: HTMLButtonElement, command: CommandEntry): void {
    const location = this.findCommand(command.id);
    if (!location || !this.activeFile) {
      return;
    }
    openMenu(anchor, [
      { label: "Edit", action: () => this.editCommand(command.id) },
      { label: "Duplicate", action: () => this.duplicateCommand(command.id) },
      { label: "Move Up", disabled: location.commandIndex <= 0, action: () => this.moveCommand(command.id, -1) },
      {
        label: "Move Down",
        disabled: location.commandIndex >= location.section.commands.length - 1,
        action: () => this.moveCommand(command.id, 1),
      },
      {
        label: "Move to Section",
        disabled: this.activeFile.sections.length < 2,
        action: () => this.moveCommandToSection(command.id),
      },
      { label: "Delete", danger: true, action: () => this.deleteCommand(command.id) },
    ]);
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

  private async updateCurrentFile(mutator: (file: CommandFile) => void): Promise<void> {
    if (!this.activeFile || !this.activeFilePath) {
      return;
    }
    const next = structuredClone(this.activeFile);
    mutator(next);
    try {
      if (this.desktopRuntime) {
        if (!this.workspaceRoot) {
          throw new Error("No workspace is active.");
        }
        const saved = await writeCommandFile(
          this.workspaceRoot,
          this.activeFilePath,
          serializeCommandFile(next),
          this.fileSources.get(this.activeFilePath) ?? "",
        );
        this.fileSources.set(this.activeFilePath, saved);
      }
      this.activeFile = next;
      this.files.set(this.activeFilePath, next);
      this.renderActiveFile();
    } catch (error) {
      await this.showServiceFailure("Could not save command file", error);
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

  private async performCommandAction(
    action: CommandAction,
    command: CommandEntry,
    generated: string,
    trigger: HTMLButtonElement,
  ): Promise<void> {
    if (action === "copy") {
      try {
        await copyText(generated);
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
      return;
    }

    if (!this.desktopRuntime) {
      await this.desktopOnlyMessage();
      return;
    }

    const needsConfirmation =
      command.risk !== "safe" ||
      ((action === "run" || action === "open-terminal") && this.settings.confirmBeforeRun);
    if (needsConfirmation) {
      const dangerous = command.risk === "danger";
      const confirmed = await openConfirm({
        title: dangerous ? "Execute Dangerous Command?" : "Confirm Command",
        message: dangerous
          ? "This command may modify or delete system data."
          : `Run this ${command.risk} command?`,
        detail: generated,
        confirmLabel: action === "open" ? "OPEN" : "EXECUTE",
        danger: dangerous,
      });
      if (!confirmed) {
        return;
      }
    }

    try {
      if (action === "run") {
        await executeProgram(generated);
      } else if (action === "open-terminal") {
        await openTerminal(generated);
      } else if (action === "open") {
        await openExternal(generated);
      }
    } catch (error) {
      await this.showServiceFailure("Command action failed", error);
    }
  }

  private search(query: string): void {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) {
      this.toolbar.setResults(null);
      return;
    }
    const tokens = normalized.split(/\s+/);
    const results: SearchResult[] = [];

    for (const [filePath, file] of this.files) {
      if (matchesTokens(`${file.title} ${file.description ?? ""}`, tokens)) {
        results.push({ filePath, fileTitle: file.title });
      }
      for (const section of file.sections) {
        if (matchesTokens(section.title, tokens)) {
          results.push({
            filePath,
            fileTitle: file.title,
            sectionId: section.id,
            sectionTitle: section.title,
          });
        }
        for (const command of section.commands) {
          const haystack = [
            command.name,
            command.command,
            command.description,
            command.syntax,
            command.example,
            command.notes,
          ].join(" ");
          if (matchesTokens(haystack, tokens)) {
            results.push({
              filePath,
              fileTitle: file.title,
              sectionId: section.id,
              sectionTitle: section.title,
              commandId: command.id,
              commandName: command.name,
              command: command.command,
            });
          }
          if (results.length >= 100) {
            break;
          }
        }
      }
    }
    this.renderSearchResults(results);
  }

  private renderSearchResults(results: SearchResult[]): void {
    if (results.length === 0) {
      this.toolbar.setResults(element("p", "search-result-empty", "No matching commands."));
      return;
    }
    const list = element("div", "search-result-list");
    results.forEach((result) => {
      const item = button("search-result", "");
      item.append(
        element("span", "search-result-title", result.commandName ?? result.sectionTitle ?? result.fileTitle),
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
    const form = element("form", "modal-form");
    const workspaceField = element("label", "form-field");
    workspaceField.append(element("span", undefined, "Workspace"));
    const workspaceRow = element("div", "settings-workspace-row");
    workspaceRow.append(element("code", undefined, this.workspaceRoot ?? "No workspace selected"));
    const change = button("inline-button", "CHANGE");
    workspaceRow.append(change);
    workspaceField.append(workspaceRow);
    form.append(workspaceField);

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
    const confirmRun = checkboxField(
      form,
      "Confirm before running safe commands",
      this.settings.confirmBeforeRun,
    );

    const save = async (): Promise<void> => {
      const nextUi = Number(uiSize.value);
      const nextCode = Number(codeSize.value);
      const rawScale = Number(uiScale.value);
      const nextScale = clampUiScale(rawScale);
      if (
        nextUi < 11 ||
        nextUi > 20 ||
        nextCode < 11 ||
        nextCode > 22 ||
        !Number.isFinite(rawScale) ||
        rawScale < 75 ||
        rawScale > 200
      ) {
        modal.setError("Font sizes or UI scale are outside the supported range.");
        return;
      }
      const next: AppSettings = {
        ...this.settings,
        uiFontSize: nextUi,
        codeFontSize: nextCode,
        uiScale: nextScale,
        rememberExpandedSections: remember.checked,
        confirmBeforeRun: confirmRun.checked,
        ...(!remember.checked ? { expandedSections: [], sectionStateFiles: [] } : {}),
      };
      try {
        await saveSettings(next);
        this.settings = next;
        this.applySettings();
        modal.close(false);
      } catch (error) {
        modal.setError(normalizeServiceError(error).message);
      }
    };

    const modal = openModal("Settings", form, [
      { label: "CANCEL", action: () => modal.close() },
      {
        label: "SAVE",
        primary: true,
        action: save,
      },
    ]);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void save();
    });
    change.addEventListener("click", () => {
      modal.close(false);
      void this.chooseAndOpenWorkspace();
    });
  }

  private applySettings(): void {
    const scale = clampUiScale(this.settings.uiScale);
    this.settings.uiScale = scale;
    document.documentElement.style.setProperty("--ui-font-size", `${this.settings.uiFontSize}px`);
    document.documentElement.style.setProperty("--code-font-size", `${this.settings.codeFontSize}px`);
    document.documentElement.style.setProperty("--ui-scale-factor", String(scale / 100));
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

  private renderNoWorkspace(): void {
    this.renderEmptyState(
      "No workspace selected",
      "Choose a folder where Command Vault will keep real folders and .cmdnote files.",
      "OPEN FOLDER",
      () => void this.chooseAndOpenWorkspace(),
    );
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
      `${path}\n\n${detail}\n\nThe original file was not modified.`,
      "REFRESH",
      () => void this.refreshWorkspaceFromUi(),
      true,
    );
  }

  private renderLoading(message: string): void {
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
    const state = element("section", `empty-state${error ? " error-state" : ""}`);
    const icon = element("div", "empty-state-icon", error ? "!" : ">_");
    icon.setAttribute("aria-hidden", "true");
    state.append(icon, element("h1", undefined, title), element("p", undefined, message));
    const actionButton = button("primary-button", actionLabel);
    actionButton.addEventListener("click", action);
    state.append(actionButton);
    this.workspace.replaceChildren(state);
  }

  private loadDevelopmentWorkspace(): void {
    const file = this.stressMode ? buildStressFile() : demoCommandFile;
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
      message: "Filesystem and process actions are available in the Tauri desktop window.",
    });
  }
}

function flattenFiles(entries: FilesystemEntry[]): FilesystemEntry[] {
  return entries.flatMap((entry) =>
    entry.kind === "command-file" ? [entry] : flattenFiles(entry.children),
  );
}

function commandIds(file: CommandFile): Set<string> {
  return new Set(file.sections.flatMap((section) => section.commands.map((command) => command.id)));
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

function matchesTokens(value: string, tokens: string[]): boolean {
  const normalized = value.toLocaleLowerCase();
  return tokens.every((token) => normalized.includes(token));
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

function parentDirectory(path: string): string | null {
  const separator = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return separator > 0 ? path.slice(0, separator) : null;
}

function sectionStateKey(filePath: string, sectionId: string): string {
  return `${filePath}::${sectionId}`;
}

function demoFilesystemEntries(): FilesystemEntry[] {
  const file = (path: string, name: string): FilesystemEntry => ({
    name,
    path,
    kind: "command-file",
    children: [],
  });
  return [
    {
      name: "Network",
      path: "/demo/Network",
      kind: "folder",
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
      children: [file("/demo/Linux/Terminal.cmdnote", "Terminal.cmdnote")],
    },
    {
      name: "Development",
      path: "/demo/Development",
      kind: "folder",
      children: [file("/demo/Development/Git.cmdnote", "Git.cmdnote")],
    },
    { name: "Other", path: "/demo/Other", kind: "folder", children: [] },
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
