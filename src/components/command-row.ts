import type { CommandEntry } from "../models/command-file";
import { button, element } from "../utils/dom";

export interface CommandRowHandle {
  element: HTMLElement;
  setExpanded(expanded: boolean): void;
}

export interface CommandRowCallbacks {
  onCopy(value: string, trigger: HTMLButtonElement): void;
  onMenu(anchor: HTMLButtonElement, command: CommandEntry): void;
}

export interface CommandRowSelection {
  active: boolean;
  selected: boolean;
  onToggle(selected: boolean): void;
}

export function createCommandRow(
  command: CommandEntry,
  requestExpansion: (row: CommandRowHandle) => void,
  callbacks: CommandRowCallbacks,
  compactTable = false,
  tableRowNumber?: number,
  showExampleColumn = false,
  initiallyExpanded = false,
  selection?: CommandRowSelection,
): CommandRowHandle {
  const row = element(
    "article",
    `command-row${compactTable ? " compact-table-row" : ""}${showExampleColumn ? " with-example-column" : ""}${selection?.active ? " selection-mode" : ""}${selection?.selected ? " selected" : ""}`,
  );
  row.id = `command-${command.id}`;
  row.dataset.commandId = command.id;

  const commandCell = element("div", "command-cell");
  const commandHeader = element("div", "command-name-row");
  const visibleName = compactTable
    ? String(tableRowNumber ?? 1).padStart(2, "0")
    : command.name;
  if (selection?.active) {
    const selectionLabel = element("label", "row-selection-control");
    const checkbox = element("input");
    checkbox.type = "checkbox";
    checkbox.checked = selection.selected;
    checkbox.setAttribute("aria-label", `Select ${compactTable ? `table row ${visibleName}` : visibleName}`);
    checkbox.addEventListener("change", () => {
      row.classList.toggle("selected", checkbox.checked);
      row.setAttribute("aria-selected", String(checkbox.checked));
      selection.onToggle(checkbox.checked);
    });
    selectionLabel.append(checkbox);
    commandHeader.append(selectionLabel);
    row.setAttribute("aria-selected", String(selection.selected));
  }
  commandHeader.append(
    element(
      compactTable ? "span" : "h3",
      compactTable ? "compact-row-number" : "command-name",
      visibleName,
    ),
  );
  const menu = button("row-menu", "⋮");
  const accessibleName = compactTable ? `table row ${visibleName}` : command.name;
  menu.title = `Actions for ${accessibleName}`;
  menu.setAttribute("aria-label", `Actions for ${accessibleName}`);
  menu.addEventListener("click", () => callbacks.onMenu(menu, command));
  menu.hidden = selection?.active ?? false;
  commandHeader.append(menu);

  const codeScroller = element("div", "command-code");
  codeScroller.append(element("code", undefined, command.command));
  const commandActions = element("div", "command-actions");
  const copyButton = button("action-button primary-action", "COPY");
  copyButton.addEventListener("click", () => callbacks.onCopy(command.command, copyButton));
  commandActions.append(copyButton);
  commandCell.append(commandHeader, codeScroller, commandActions);

  const infoCell = element("div", "info-cell");
  const infoTop = element(
    "div",
    "info-top",
  );
  infoTop.append(element("p", "command-description", command.description || "No description provided."));

  const hasDetails = Boolean(command.description || command.notes || (!showExampleColumn && command.example));
  const expanded = element("div", "expanded-content");
  expanded.hidden = true;
  appendDetail(expanded, "Description", command.description);
  if (!showExampleColumn) {
    appendDetail(expanded, "Example", command.example, true);
  }
  appendDetail(expanded, "Notes", command.notes);
  infoCell.append(infoTop, expanded);

  let moreButton: HTMLButtonElement | null = null;
  if (hasDetails) {
    moreButton = button("more-button", "MORE");
    moreButton.setAttribute("aria-expanded", "false");
    moreButton.setAttribute("aria-controls", `details-${command.id}`);
    expanded.id = `details-${command.id}`;
    const infoActions = element("div", "info-actions");
    infoActions.append(moreButton);
    infoCell.append(infoActions);
  }

  if (showExampleColumn) {
    row.append(commandCell, infoCell, createExampleCell(command, callbacks, visibleName));
  } else {
    row.append(commandCell, infoCell);
  }

  const handle: CommandRowHandle = {
    element: row,
    setExpanded(isExpanded) {
      if (!moreButton) {
        return;
      }
      expanded.hidden = !isExpanded;
      infoTop.hidden = isExpanded;
      row.classList.toggle("expanded", isExpanded);
      moreButton.textContent = isExpanded ? "LESS" : "MORE";
      moreButton.setAttribute("aria-expanded", String(isExpanded));
    },
  };
  moreButton?.addEventListener("click", () => requestExpansion(handle));
  handle.setExpanded(initiallyExpanded);
  return handle;
}

function createExampleCell(
  command: CommandEntry,
  callbacks: CommandRowCallbacks,
  visibleName: string,
): HTMLElement {
  if (!command.example) {
    return element("div", "example-cell example-empty", "—");
  }
  const copyExample = button("example-cell example-copy", command.example);
  copyExample.title = "Copy example";
  copyExample.setAttribute("aria-label", `Copy example for ${visibleName}`);
  copyExample.addEventListener("click", () => callbacks.onCopy(command.example ?? "", copyExample));
  return copyExample;
}

function appendDetail(
  container: HTMLElement,
  label: string,
  value?: string,
  code = false,
): void {
  if (!value) {
    return;
  }
  const group = element("section", `detail-group${code ? " code-detail" : ""}`);
  group.append(element("h4", undefined, label), element("p", undefined, value));
  container.append(group);
}
