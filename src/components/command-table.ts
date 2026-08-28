import type { CommandEntry, CommandFile, CommandSection } from "../models/command-file";
import { button, element } from "../utils/dom";
import {
  createCommandSection,
  type CommandSectionHandle,
} from "./command-section";
import type { CommandRowCallbacks } from "./command-row";
import type { SectionHighlightLevel } from "../models/settings";
import type { EffectivePerformanceProfile } from "../services/performance";
import { openMenu } from "./menu";

export interface CommandTableCallbacks {
  onUndo(): void;
  onRedo(): void;
  onAddSection(): void;
  onAddTable(): void;
  onAddCommand(sectionId: string): void;
  onSectionToggle(sectionId: string, expanded: boolean): void;
  onExampleColumnToggle(sectionId: string, visible: boolean): void;
  onSectionHighlightToggle(sectionId: string, level: SectionHighlightLevel | null): void;
  onSectionMenu(anchor: HTMLButtonElement, section: CommandSection): void;
  onCommandMenu(anchor: HTMLButtonElement, command: CommandEntry): void;
  onCommandCopy(value: string, trigger: HTMLButtonElement): void;
  onSelectionMode(sectionId: string, active: boolean): void;
  onBulkMove(sectionId: string, commandIds: string[]): void;
  onBulkDelete(sectionId: string, commandIds: string[]): void;
  onCommandReorder(sectionId: string, commandId: string, targetIndex: number): void;
}

export interface CommandTableOptions {
  canUndo: boolean;
  canRedo: boolean;
  selectionSectionId: string | null;
  expandedSections: ReadonlySet<string>;
  sectionStateInitialized?: boolean;
  expandAllSections?: boolean;
  isExampleColumnVisible(section: CommandSection): boolean;
  sectionHighlightLevel(section: CommandSection): SectionHighlightLevel | null;
  performanceProfile: EffectivePerformanceProfile;
  callbacks: CommandTableCallbacks;
}

export interface CommandTableHandle {
  element: HTMLElement;
  update(file: CommandFile, options: CommandTableOptions): void;
  ensureVisible(sectionId?: string, commandId?: string): void;
  refreshLayout(): void;
  setPerformanceProfile(profile: EffectivePerformanceProfile): void;
  dispose(): void;
}

export function createCommandTable(file: CommandFile, options: CommandTableOptions): CommandTableHandle {
  const view = element("div", "file-view");
  const header = element("header", "file-header");
  const titleGroup = element("div", "file-title-group");
  const title = element("h1");
  const description = element("p");
  titleGroup.append(title, description);
  header.append(titleGroup);

  const headerActions = element("div", "file-header-actions");
  const undo = button("secondary-button history-button", "UNDO");
  undo.disabled = !options.canUndo;
  undo.title = "Undo last file change (Ctrl+Z)";
  undo.addEventListener("click", options.callbacks.onUndo);
  const redo = button("secondary-button history-button", "REDO");
  redo.disabled = !options.canRedo;
  redo.title = "Redo last undone change (Ctrl+Y or Ctrl+Shift+Z)";
  redo.addEventListener("click", options.callbacks.onRedo);
  const addSection = button("secondary-button file-add-section", "+ ADD SECTION");
  addSection.addEventListener("click", options.callbacks.onAddSection);
  const addTable = button("primary-button file-add-table", "+ ADD TABLE");
  addTable.addEventListener("click", options.callbacks.onAddTable);
  const overflow = button("icon-button file-overflow-menu", "⋮");
  overflow.title = "File actions";
  overflow.setAttribute("aria-label", "File actions");
  overflow.addEventListener("click", () => openMenu(overflow, [
    { label: "Undo", disabled: undo.disabled, action: options.callbacks.onUndo },
    { label: "Redo", disabled: redo.disabled, action: options.callbacks.onRedo },
    { label: "Add Section", action: options.callbacks.onAddSection },
    { label: "Add Table", action: options.callbacks.onAddTable },
  ]));
  headerActions.append(undo, redo, addSection, addTable, overflow);
  header.append(headerActions);

  const content = element("div", "command-content");
  const sectionHandles = new Map<string, CommandSectionHandle>();
  const sectionFingerprints = new Map<string, string>();

  function createSectionHandle(
    section: CommandSection,
    index: number,
    currentFile: CommandFile,
    currentOptions: CommandTableOptions,
  ): CommandSectionHandle {
    const expanded =
      currentOptions.expandAllSections ||
      currentOptions.expandedSections.has(section.id) ||
      (!currentOptions.sectionStateInitialized && currentOptions.expandedSections.size === 0 && index === 0);
    const rowCallbacks: CommandRowCallbacks = {
      onCopy: currentOptions.callbacks.onCommandCopy,
      onMenu: currentOptions.callbacks.onCommandMenu,
    };
    return createCommandSection(section, expanded, {
        onToggle: currentOptions.callbacks.onSectionToggle,
        onExampleColumnToggle: currentOptions.callbacks.onExampleColumnToggle,
        onSectionHighlightToggle: currentOptions.callbacks.onSectionHighlightToggle,
        onAddCommand: currentOptions.callbacks.onAddCommand,
        onSectionMenu: currentOptions.callbacks.onSectionMenu,
        onSelectionMode: currentOptions.callbacks.onSelectionMode,
        onBulkMove: currentOptions.callbacks.onBulkMove,
        onBulkDelete: currentOptions.callbacks.onBulkDelete,
        onCommandReorder: currentOptions.callbacks.onCommandReorder,
        showExampleColumn: currentOptions.isExampleColumnVisible(section),
        highlightLevel: currentOptions.sectionHighlightLevel(section),
        selectionActive: currentOptions.selectionSectionId === section.id,
        canMoveSelection: currentFile.sections.length > 1,
        rowCallbacks,
        getScrollRoot: () => content,
        performanceProfile: currentOptions.performanceProfile,
        deferInitialContent: currentOptions.performanceProfile.mode !== "full" && index > 0,
      });
  }

  function update(nextFile: CommandFile, nextOptions: CommandTableOptions): void {
    title.textContent = nextFile.title.toUpperCase();
    description.textContent = nextFile.description ?? "";
    description.hidden = !nextFile.description;
    undo.disabled = !nextOptions.canUndo;
    redo.disabled = !nextOptions.canRedo;
    if (nextFile.sections.length === 0) {
      sectionHandles.forEach((handle) => handle.dispose());
      sectionHandles.clear();
      sectionFingerprints.clear();
      const empty = element("section", "content-empty");
      empty.append(element("p", undefined, "No sections yet."));
      const addFirst = button("primary-button", "+ ADD SECTION");
      addFirst.addEventListener("click", nextOptions.callbacks.onAddSection);
      const addFirstTable = button("secondary-button", "+ ADD TABLE");
      addFirstTable.addEventListener("click", nextOptions.callbacks.onAddTable);
      const emptyActions = element("div", "content-empty-actions");
      emptyActions.append(addFirst, addFirstTable);
      empty.append(emptyActions);
      content.replaceChildren(empty);
      return;
    }

    const nextIds = new Set(nextFile.sections.map((section) => section.id));
    sectionHandles.forEach((handle, id) => {
      if (!nextIds.has(id)) {
        handle.dispose();
        sectionHandles.delete(id);
        sectionFingerprints.delete(id);
      }
    });
    const fragment = document.createDocumentFragment();
    nextFile.sections.forEach((section, index) => {
      const desiredExpanded = nextOptions.expandAllSections ||
        nextOptions.expandedSections.has(section.id) ||
        (!nextOptions.sectionStateInitialized && nextOptions.expandedSections.size === 0 && index === 0);
      const fingerprint = `${JSON.stringify(section)}|${nextOptions.selectionSectionId === section.id}|${nextFile.sections.length > 1}|${desiredExpanded}`;
      let handle = sectionHandles.get(section.id);
      if (!handle || sectionFingerprints.get(section.id) !== fingerprint) {
        handle?.dispose();
        handle = createSectionHandle(section, index, nextFile, nextOptions);
        sectionHandles.set(section.id, handle);
        sectionFingerprints.set(section.id, fingerprint);
      }
      fragment.append(handle.element);
    });
    content.replaceChildren(fragment);
  }

  view.append(header, content);
  const handle: CommandTableHandle = {
    element: view,
    update,
    ensureVisible(sectionId, commandId) {
      if (!sectionId) {
        return;
      }
      sectionHandles.get(sectionId)?.ensureCommandVisible(commandId);
    },
    refreshLayout() {
      sectionHandles.forEach((handle) => handle.refreshLayout());
    },
    setPerformanceProfile(profile) {
      sectionHandles.forEach((handle) => handle.setPerformanceProfile(profile));
    },
    dispose() {
      sectionHandles.forEach((handle) => handle.dispose());
      sectionHandles.clear();
    },
  };
  update(file, options);
  return handle;
}
