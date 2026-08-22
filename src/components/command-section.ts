import type { CommandSection } from "../models/command-file";
import { button, element } from "../utils/dom";
import { createCommandRow, type CommandRowCallbacks, type CommandRowHandle } from "./command-row";

interface CommandSectionCallbacks {
  onToggle(sectionId: string, expanded: boolean): void;
  onExampleColumnToggle(sectionId: string, visible: boolean): void;
  onAddCommand(sectionId: string): void;
  onSectionMenu(anchor: HTMLButtonElement, section: CommandSection): void;
  rowCallbacks: CommandRowCallbacks;
  showExampleColumn: boolean;
}

export function createCommandSection(
  section: CommandSection,
  initiallyExpanded: boolean,
  callbacks: CommandSectionCallbacks,
): HTMLElement {
  const wrapper = element("section", "command-section");
  wrapper.dataset.sectionId = section.id;

  const header = element("div", "section-header");
  const toggle = button("section-toggle", "");
  toggle.setAttribute("aria-expanded", String(initiallyExpanded));

  const chevron = element("span", "section-chevron", initiallyExpanded ? "▾" : "▸");
  chevron.setAttribute("aria-hidden", "true");
  toggle.append(chevron, element("span", "section-title", section.title));
  if (section.layout === "table") {
    toggle.append(element("span", "section-layout-badge", "TABLE"));
  }

  const count = element("span", "section-count", String(section.commands.length));
  count.title = `${section.commands.length} ${section.commands.length === 1 ? "command" : "commands"}`;
  header.append(toggle, count);

  const hasExamples = section.layout === "table" && section.commands.some((command) => command.example?.trim());
  if (hasExamples) {
    const examples = button(
      `section-examples${callbacks.showExampleColumn ? " active" : ""}`,
      "EXAMPLES",
    );
    examples.setAttribute("aria-pressed", String(callbacks.showExampleColumn));
    examples.title = callbacks.showExampleColumn ? "Hide Example column" : "Show Example column";
    examples.setAttribute(
      "aria-label",
      callbacks.showExampleColumn ? "Hide Example column" : "Show Example column",
    );
    examples.addEventListener("click", () =>
      callbacks.onExampleColumnToggle(section.id, !callbacks.showExampleColumn),
    );
    header.append(examples);
  }

  const add = button("section-add", "+");
  const rowLabel = section.layout === "table" ? "row" : "command";
  add.title = `Add ${rowLabel} to ${section.title}`;
  add.setAttribute("aria-label", `Add ${rowLabel} to ${section.title}`);
  add.addEventListener("click", () => callbacks.onAddCommand(section.id));
  header.append(add);

  const menu = button("row-menu section-menu", "⋮");
  menu.title = `Actions for ${section.title}`;
  menu.setAttribute("aria-label", `Actions for ${section.title}`);
  menu.addEventListener("click", () => callbacks.onSectionMenu(menu, section));
  header.append(menu);

  const content = element("div", "section-content");
  content.hidden = !initiallyExpanded;

  const columnHeader = element(
    "div",
    `table-heading${callbacks.showExampleColumn ? " with-example-column" : ""}`,
  );
  columnHeader.append(
    element("div", undefined, section.layout === "table" ? "NO. / COMMAND" : "COMMAND"),
    element("div", undefined, "INFORMATION"),
  );
  if (callbacks.showExampleColumn) {
    columnHeader.append(element("div", undefined, "EXAMPLE"));
  }
  content.append(columnHeader);

  let expandedRow: CommandRowHandle | null = null;
  section.commands.forEach((command, commandIndex) => {
    const row = createCommandRow(
      command,
      (requestedRow) => {
        if (expandedRow === requestedRow) {
          requestedRow.setExpanded(false);
          expandedRow = null;
          return;
        }

        expandedRow?.setExpanded(false);
        requestedRow.setExpanded(true);
        expandedRow = requestedRow;
      },
      callbacks.rowCallbacks,
      section.layout === "table",
      commandIndex + 1,
      callbacks.showExampleColumn,
    );
    content.append(row.element);
  });

  if (section.commands.length === 0) {
    const empty = element("div", "section-empty");
    empty.append(
      element(
        "p",
        undefined,
        section.layout === "table" ? "No rows in this table." : "No commands in this section.",
      ),
    );
    const addFirst = button(
      "inline-button",
      section.layout === "table" ? "+ ADD ROW" : "+ ADD COMMAND",
    );
    addFirst.addEventListener("click", () => callbacks.onAddCommand(section.id));
    empty.append(addFirst);
    content.append(empty);
  }

  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    const next = !expanded;
    toggle.setAttribute("aria-expanded", String(next));
    chevron.textContent = next ? "▾" : "▸";
    content.hidden = !next;
    callbacks.onToggle(section.id, next);
  });

  wrapper.append(header, content);
  return wrapper;
}
