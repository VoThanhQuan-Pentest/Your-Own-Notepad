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

export interface CommandRowReorder {
  index: number;
  count: number;
  sectionElement(): HTMLElement | null;
  scrollRoot(): HTMLElement | null;
  onMove(targetIndex: number): void;
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
  exampleExpanded = false,
  onExampleToggle?: (expanded: boolean) => void,
  reorder?: CommandRowReorder,
): CommandRowHandle {
  const row = element(
    "article",
    `command-row${compactTable ? " compact-table-row" : ""}${showExampleColumn ? " with-example-column" : ""}${selection?.active ? " selection-mode" : ""}${selection?.selected ? " selected" : ""}`,
  );
  row.id = `command-${command.id}`;
  row.dataset.commandId = command.id;
  if (reorder) {
    row.dataset.rowIndex = String(reorder.index);
  }

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
  if (reorder) {
    commandHeader.append(createReorderHandle(row, visibleName, reorder));
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
    row.append(
      commandCell,
      infoCell,
      createExampleCell(
        command,
        callbacks,
        visibleName,
        exampleExpanded,
        onExampleToggle,
      ),
    );
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

function createReorderHandle(
  row: HTMLElement,
  visibleName: string,
  reorder: CommandRowReorder,
): HTMLButtonElement {
  const handle = button("row-drag-handle", "⠿");
  handle.title = `Move table row ${visibleName}`;
  handle.setAttribute("aria-label", `Move table row ${visibleName}`);
  const live = element("span", "visually-hidden");
  live.setAttribute("aria-live", "polite");
  handle.append(live);
  let keyboardTarget: number | null = null;

  handle.addEventListener("keydown", (event) => {
    if (keyboardTarget === null && (event.key === " " || event.key === "Enter")) {
      event.preventDefault();
      keyboardTarget = reorder.index;
      row.classList.add("keyboard-reordering");
      handle.setAttribute("aria-pressed", "true");
      live.textContent = `Reordering row ${reorder.index + 1} of ${reorder.count}. Use arrow keys, Home or End, then Enter to move.`;
      return;
    }
    if (keyboardTarget === null) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      keyboardTarget = null;
      row.classList.remove("keyboard-reordering");
      handle.removeAttribute("aria-pressed");
      live.textContent = "Reorder cancelled.";
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const target = keyboardTarget;
      keyboardTarget = null;
      row.classList.remove("keyboard-reordering");
      handle.removeAttribute("aria-pressed");
      if (target !== reorder.index) {
        reorder.onMove(target);
      }
      return;
    }
    const previous = keyboardTarget;
    if (event.key === "ArrowUp") keyboardTarget = Math.max(0, keyboardTarget - 1);
    else if (event.key === "ArrowDown") keyboardTarget = Math.min(reorder.count - 1, keyboardTarget + 1);
    else if (event.key === "Home") keyboardTarget = 0;
    else if (event.key === "End") keyboardTarget = reorder.count - 1;
    else return;
    event.preventDefault();
    if (keyboardTarget !== previous) {
      live.textContent = `Target position ${keyboardTarget + 1} of ${reorder.count}.`;
    }
  });

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const section = reorder.sectionElement();
    const scrollRoot = reorder.scrollRoot();
    if (!section || !scrollRoot) return;
    const ghost = element("div", "row-drag-ghost", `ROW ${String(reorder.index + 1).padStart(2, "0")}`);
    document.body.append(ghost);
    row.classList.add("dragging-row");
    let targetIndex = reorder.index;
    let targetRow: HTMLElement | null = null;
    let lastX = event.clientX;
    let lastY = event.clientY;
    let frame: number | null = null;

    const clearTarget = () => {
      targetRow?.classList.remove("drop-before", "drop-after");
      targetRow = null;
    };
    const updateTarget = () => {
      ghost.style.transform = `translate(${lastX + 14}px, ${lastY + 12}px)`;
      const rootRect = scrollRoot.getBoundingClientRect();
      if (lastY < rootRect.top + 52) scrollRoot.scrollTop -= 18;
      else if (lastY > rootRect.bottom - 52) scrollRoot.scrollTop += 18;
      const hit = document.elementFromPoint(lastX, lastY)?.closest<HTMLElement>(".command-row");
      if (!hit || !section.contains(hit)) {
        clearTarget();
        return;
      }
      const hitIndex = Number(hit.dataset.rowIndex);
      if (!Number.isInteger(hitIndex)) return;
      const before = lastY < hit.getBoundingClientRect().top + hit.getBoundingClientRect().height / 2;
      const boundary = hitIndex + (before ? 0 : 1);
      targetIndex = Math.max(0, Math.min(reorder.count - 1, boundary > reorder.index ? boundary - 1 : boundary));
      if (targetRow !== hit) clearTarget();
      targetRow = hit;
      hit.classList.toggle("drop-before", before);
      hit.classList.toggle("drop-after", !before);
    };
    const tick = () => {
      frame = null;
      updateTarget();
      const rootRect = scrollRoot.getBoundingClientRect();
      if (lastY < rootRect.top + 52 || lastY > rootRect.bottom - 52) {
        frame = window.requestAnimationFrame(tick);
      }
    };
    const schedule = () => {
      if (frame === null) frame = window.requestAnimationFrame(tick);
    };
    const onMove = (moveEvent: PointerEvent) => {
      lastX = moveEvent.clientX;
      lastY = moveEvent.clientY;
      schedule();
    };
    const cleanup = () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onCancel);
      document.removeEventListener("keydown", onKeyDown);
      clearTarget();
      ghost.remove();
      row.classList.remove("dragging-row");
    };
    const onUp = () => {
      cleanup();
      if (targetIndex !== reorder.index) reorder.onMove(targetIndex);
    };
    const onCancel = () => cleanup();
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === "Escape") cleanup();
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp, { once: true });
    document.addEventListener("pointercancel", onCancel, { once: true });
    document.addEventListener("keydown", onKeyDown);
    updateTarget();
  });
  return handle;
}

function createExampleCell(
  command: CommandEntry,
  callbacks: CommandRowCallbacks,
  visibleName: string,
  expanded: boolean,
  onToggle?: (expanded: boolean) => void,
): HTMLElement {
  if (!command.example) {
    return element("div", "example-cell example-empty", "—");
  }
  const cell = element("div", `example-cell${expanded ? " expanded" : ""}`);
  const copyExample = button("example-copy", "");
  const content = element("span", "example-text", command.example);
  content.id = `example-content-${command.id}`;
  copyExample.append(content);
  copyExample.title = "Copy example";
  copyExample.setAttribute("aria-label", `Copy example for ${visibleName}`);
  copyExample.addEventListener("click", () => callbacks.onCopy(command.example ?? "", copyExample));
  cell.append(copyExample);
  if (onToggle) {
    const toggle = button("example-toggle", expanded ? "LESS" : "MORE");
    toggle.hidden = !expanded;
    toggle.setAttribute(
      "aria-label",
      `${expanded ? "Collapse" : "Expand"} example for ${visibleName}`,
    );
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.setAttribute("aria-controls", content.id);
    toggle.addEventListener("click", () => onToggle(!expanded));
    cell.append(toggle);
    window.requestAnimationFrame(() => {
      if (cell.isConnected && !expanded && content.scrollHeight > content.clientHeight + 1) {
        toggle.hidden = false;
      }
    });
  }
  return cell;
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
