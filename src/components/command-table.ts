import type { CommandAction, CommandEntry, CommandFile, CommandSection } from "../models/command-file";
import { button, element } from "../utils/dom";
import { createCommandSection } from "./command-section";

export interface CommandTableCallbacks {
  onAddSection(): void;
  onAddCommand(sectionId: string): void;
  onSectionToggle(sectionId: string, expanded: boolean): void;
  onSectionMenu(anchor: HTMLButtonElement, section: CommandSection): void;
  onCommandMenu(anchor: HTMLButtonElement, command: CommandEntry): void;
  onCommandAction(
    action: CommandAction,
    command: CommandEntry,
    generatedCommand: string,
    trigger: HTMLButtonElement,
  ): void;
}

interface CommandTableOptions {
  expandedSections: ReadonlySet<string>;
  sectionStateInitialized?: boolean;
  expandAllSections?: boolean;
  callbacks: CommandTableCallbacks;
}

export function createCommandTable(file: CommandFile, options: CommandTableOptions): HTMLElement {
  const view = element("div", "file-view");
  const header = element("header", "file-header");

  const titleGroup = element("div", "file-title-group");
  titleGroup.append(element("h1", undefined, file.title.toUpperCase()));
  if (file.description) {
    titleGroup.append(element("p", undefined, file.description));
  }
  header.append(titleGroup);

  const addSection = button("primary-button", "+ ADD SECTION");
  addSection.addEventListener("click", options.callbacks.onAddSection);
  header.append(addSection);

  const content = element("div", "command-content");
  if (file.sections.length === 0) {
    const empty = element("section", "content-empty");
    empty.append(element("p", undefined, "No sections yet."));
    const addFirst = button("primary-button", "+ ADD SECTION");
    addFirst.addEventListener("click", options.callbacks.onAddSection);
    empty.append(addFirst);
    content.append(empty);
  } else {
    file.sections.forEach((section, index) => {
      const expanded =
        options.expandAllSections ||
        options.expandedSections.has(section.id) ||
        (!options.sectionStateInitialized && options.expandedSections.size === 0 && index === 0);
      content.append(
        createCommandSection(section, expanded, {
          onToggle: options.callbacks.onSectionToggle,
          onAddCommand: options.callbacks.onAddCommand,
          onSectionMenu: options.callbacks.onSectionMenu,
          rowCallbacks: {
            onAction: options.callbacks.onCommandAction,
            onMenu: options.callbacks.onCommandMenu,
          },
        }),
      );
    });
  }

  view.append(header, content);
  return view;
}
