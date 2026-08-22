import type { CommandAction, CommandEntry } from "../models/command-file";
import { supportsDirectRun } from "../utils/command-safety";
import { button, element } from "../utils/dom";
import { extractVariableNames, renderCommandTemplate } from "../utils/variables";

export interface CommandRowHandle {
  element: HTMLElement;
  setExpanded(expanded: boolean): void;
}

export interface CommandRowCallbacks {
  onAction(
    action: CommandAction,
    command: CommandEntry,
    generatedCommand: string,
    trigger: HTMLButtonElement,
  ): void;
  onMenu(anchor: HTMLButtonElement, command: CommandEntry): void;
}

export function createCommandRow(
  command: CommandEntry,
  requestExpansion: (row: CommandRowHandle) => void,
  callbacks: CommandRowCallbacks,
  compactTable = false,
  tableRowNumber?: number,
  showExampleColumn = false,
): CommandRowHandle {
  const row = element(
    "article",
    `command-row risk-${command.risk}${compactTable ? " compact-table-row" : ""}${showExampleColumn ? " with-example-column" : ""}`,
  );
  row.id = `command-${command.id}`;
  row.dataset.commandId = command.id;

  const commandCell = element("div", "command-cell");
  const commandHeader = element("div", "command-name-row");
  const visibleName = compactTable
    ? String(tableRowNumber ?? 1).padStart(2, "0")
    : command.name;
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
  commandHeader.append(menu);

  const runtimeVariables = mergeRuntimeVariables(command);
  const values = new Map(
    runtimeVariables.map((variable) => [variable.name, variable.default ?? ""]),
  );
  const codeScroller = element("div", "command-code");
  const generatedCode = element("code", undefined, renderCommandTemplate(command.command, values));
  let effectiveAction: CommandAction = command.action;
  let secondaryActionButton: HTMLButtonElement | null = null;
  codeScroller.append(generatedCode);

  commandCell.append(commandHeader, codeScroller);

  let variableList: HTMLElement | null = null;
  if (runtimeVariables.length > 0) {
    const createdVariableList = element("div", "variable-list");
    variableList = createdVariableList;
    runtimeVariables.forEach((variable) => {
      const label = element("label", "variable-control");
      label.append(element("span", undefined, variable.name));
      const input = element("input");
      input.type = "text";
      input.value = variable.default ?? "";
      input.autocomplete = "off";
      input.addEventListener("input", () => {
        values.set(variable.name, input.value);
        refreshGeneratedCommand();
      });
      label.append(input);
      createdVariableList.append(label);
    });
    if (!compactTable) {
      commandCell.append(createdVariableList);
    }
  }

  const commandActions = element("div", "command-actions");
  const copyButton = button("action-button primary-action", "COPY");
  copyButton.addEventListener("click", () => {
    callbacks.onAction("copy", command, generatedCode.textContent ?? "", copyButton);
  });
  commandActions.append(copyButton);
  if (command.action !== "copy") {
    secondaryActionButton = button("action-button", "");
    secondaryActionButton.addEventListener("click", () => {
      callbacks.onAction(
        effectiveAction,
        command,
        generatedCode.textContent ?? "",
        secondaryActionButton as HTMLButtonElement,
      );
    });
    commandActions.append(secondaryActionButton);
    refreshGeneratedCommand();
  }
  commandCell.append(commandActions);

  const infoCell = element("div", "info-cell");
  const infoTop = element("div", "info-top");
  infoTop.append(
    element("p", "command-description", command.description || "No description provided."),
    element("span", `risk-badge ${command.risk}`, command.risk.toUpperCase()),
  );

  const expanded = element("div", "expanded-content");
  expanded.hidden = true;
  if (compactTable && variableList) {
    const variableDetail = element("section", "detail-group compact-variable-detail");
    variableDetail.append(element("h4", undefined, "Variables"), variableList);
    expanded.append(variableDetail);
  }
  appendDetail(expanded, "Description", command.description);
  appendDetail(expanded, "Syntax", command.syntax, true);
  if (!showExampleColumn) {
    appendDetail(expanded, "Example", command.example, true);
  }
  appendDetail(expanded, "Notes", command.notes);

  const moreButton = button("more-button", "MORE");
  moreButton.setAttribute("aria-expanded", "false");
  moreButton.setAttribute("aria-controls", `details-${command.id}`);
  expanded.id = `details-${command.id}`;

  const infoActions = element("div", "info-actions");
  infoActions.append(moreButton);
  infoCell.append(infoTop, expanded, infoActions);
  if (showExampleColumn) {
    row.append(commandCell, infoCell, createExampleCell(command, callbacks, visibleName));
  } else {
    row.append(commandCell, infoCell);
  }

  const handle: CommandRowHandle = {
    element: row,
    setExpanded(isExpanded) {
      expanded.hidden = !isExpanded;
      row.classList.toggle("expanded", isExpanded);
      moreButton.textContent = isExpanded ? "LESS" : "MORE";
      moreButton.setAttribute("aria-expanded", String(isExpanded));
    },
  };

  moreButton.addEventListener("click", () => requestExpansion(handle));
  return handle;

  function refreshGeneratedCommand(): void {
    const generated = renderCommandTemplate(command.command, values);
    generatedCode.textContent = generated;
    if (!secondaryActionButton) {
      return;
    }
    effectiveAction =
      command.action === "run" && !supportsDirectRun(generated) ? "open-terminal" : command.action;
    secondaryActionButton.textContent = actionLabel(effectiveAction);
    secondaryActionButton.title =
      effectiveAction !== command.action
        ? "This generated command uses shell syntax or elevation and cannot run directly."
        : "";
  }
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
  copyExample.addEventListener("click", () => {
    callbacks.onAction("copy", command, command.example ?? "", copyExample);
  });
  return copyExample;
}

function mergeRuntimeVariables(command: CommandEntry) {
  const explicit = new Map(
    (command.variables ?? []).map((variable) => [variable.name, variable] as const),
  );
  const merged = extractVariableNames(command.command).map((name) => {
    const variable = explicit.get(name) ?? { name };
    explicit.delete(name);
    return variable;
  });
  explicit.forEach((variable) => merged.push(variable));
  return merged;
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

function actionLabel(action: CommandEntry["action"]): string {
  switch (action) {
    case "run":
      return "RUN";
    case "open":
      return "OPEN";
    case "open-terminal":
      return "OPEN TERMINAL";
    case "copy":
      return "COPY";
  }
}
