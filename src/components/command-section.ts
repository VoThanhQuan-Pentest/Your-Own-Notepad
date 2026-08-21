import type { CommandSection } from "../models/command-file";
import { button, element } from "../utils/dom";
import { createCommandRow, type CommandRowCallbacks, type CommandRowHandle } from "./command-row";

interface CommandSectionCallbacks {
  onToggle(sectionId: string, expanded: boolean): void;
  onAddCommand(sectionId: string): void;
  onSectionMenu(anchor: HTMLButtonElement, section: CommandSection): void;
  rowCallbacks: CommandRowCallbacks;
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

  const columnHeader = element("div", "table-heading");
  columnHeader.append(
    element("div", undefined, section.layout === "table" ? "FUNCTION / COMMAND" : "COMMAND"),
    element("div", undefined, "INFORMATION"),
  );
  content.append(columnHeader);

  let expandedRow: CommandRowHandle | null = null;
  section.commands.forEach((command) => {
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
