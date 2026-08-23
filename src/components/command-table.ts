import type { CommandEntry, CommandFile, CommandSection } from "../models/command-file";
import { button, element } from "../utils/dom";
import {
  createCommandSection,
  type CommandSectionHandle,
} from "./command-section";
import type { CommandRowCallbacks } from "./command-row";

export interface CommandTableCallbacks {
  onAddSection(): void;
  onAddTable(): void;
  onAddCommand(sectionId: string): void;
  onSectionToggle(sectionId: string, expanded: boolean): void;
  onExampleColumnToggle(sectionId: string, visible: boolean): void;
  onSectionMenu(anchor: HTMLButtonElement, section: CommandSection): void;
  onCommandMenu(anchor: HTMLButtonElement, command: CommandEntry): void;
  onCommandCopy(value: string, trigger: HTMLButtonElement): void;
}

interface CommandTableOptions {
  expandedSections: ReadonlySet<string>;
  sectionStateInitialized?: boolean;
  expandAllSections?: boolean;
  isExampleColumnVisible(section: CommandSection): boolean;
  callbacks: CommandTableCallbacks;
}

export interface CommandTableHandle {
  element: HTMLElement;
  ensureVisible(sectionId?: string, commandId?: string): void;
  dispose(): void;
}

export function createCommandTable(file: CommandFile, options: CommandTableOptions): CommandTableHandle {
  const view = element("div", "file-view");
  const header = element("header", "file-header");
  const titleGroup = element("div", "file-title-group");
  titleGroup.append(element("h1", undefined, file.title.toUpperCase()));
  if (file.description) {
    titleGroup.append(element("p", undefined, file.description));
  }
  header.append(titleGroup);

  const headerActions = element("div", "file-header-actions");
  const addSection = button("secondary-button", "+ ADD SECTION");
  addSection.addEventListener("click", options.callbacks.onAddSection);
  const addTable = button("primary-button", "+ ADD TABLE");
  addTable.addEventListener("click", options.callbacks.onAddTable);
  headerActions.append(addSection, addTable);
  header.append(headerActions);

  const content = element("div", "command-content");
  const sectionHandles = new Map<string, CommandSectionHandle>();
  if (file.sections.length === 0) {
    const empty = element("section", "content-empty");
    empty.append(element("p", undefined, "No sections yet."));
    const addFirst = button("primary-button", "+ ADD SECTION");
    addFirst.addEventListener("click", options.callbacks.onAddSection);
    const addFirstTable = button("secondary-button", "+ ADD TABLE");
    addFirstTable.addEventListener("click", options.callbacks.onAddTable);
    const emptyActions = element("div", "content-empty-actions");
    emptyActions.append(addFirst, addFirstTable);
    empty.append(emptyActions);
    content.append(empty);
  } else {
    const rowCallbacks: CommandRowCallbacks = {
      onCopy: options.callbacks.onCommandCopy,
      onMenu: options.callbacks.onCommandMenu,
    };
    file.sections.forEach((section, index) => {
      const expanded =
        options.expandAllSections ||
        options.expandedSections.has(section.id) ||
        (!options.sectionStateInitialized && options.expandedSections.size === 0 && index === 0);
      const handle = createCommandSection(section, expanded, {
        onToggle: options.callbacks.onSectionToggle,
        onExampleColumnToggle: options.callbacks.onExampleColumnToggle,
        onAddCommand: options.callbacks.onAddCommand,
        onSectionMenu: options.callbacks.onSectionMenu,
        showExampleColumn: options.isExampleColumnVisible(section),
        rowCallbacks,
        getScrollRoot: () => content,
      });
      sectionHandles.set(section.id, handle);
      content.append(handle.element);
    });
  }

  view.append(header, content);
  return {
    element: view,
    ensureVisible(sectionId, commandId) {
      if (!sectionId) {
        return;
      }
      sectionHandles.get(sectionId)?.ensureCommandVisible(commandId);
    },
    dispose() {
      sectionHandles.forEach((handle) => handle.dispose());
      sectionHandles.clear();
    },
  };
}
