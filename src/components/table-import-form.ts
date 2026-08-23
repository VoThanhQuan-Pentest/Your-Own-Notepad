import type { CommandEntry } from "../models/command-file";
import {
  hasTableImportErrors,
  importableCommands,
  parseTablePaste,
  type TableImportPreview,
} from "../utils/table-import";
import { element } from "../utils/dom";
import { openModal } from "./modal";

export interface ImportedTable {
  title: string;
  commands: CommandEntry[];
}

export function openTableImportForm(
  existingCommandIds: ReadonlySet<string>,
  existingCommands: readonly string[],
): Promise<ImportedTable | null> {
  return new Promise((resolve) => {
    const form = element("form", "modal-form table-import-form");
    const nameField = element("label", "form-field");
    nameField.append(element("span", undefined, "Table Name"));
    const name = element("input");
    name.type = "text";
    name.autocomplete = "off";
    name.required = true;
    nameField.append(name);

    const sourceField = element("label", "form-field table-import-source-field");
    sourceField.append(element("span", undefined, "Paste GPT Table"));
    const source = element("textarea", "table-import-source");
    source.placeholder = "Paste a Markdown table, TSV from Excel/Sheets, or CSV here…";
    source.spellcheck = false;
    sourceField.append(source);

    const help = element(
      "p",
      "table-import-help",
      "Accepted columns: Command/Port/Value, Service, Description/Information, Example, and Notes. English and Vietnamese headers are accepted.",
    );
    const preview = element("section", "table-import-preview");
    preview.setAttribute("aria-live", "polite");
    const duplicateControl = element("label", "checkbox-field table-import-duplicate-toggle");
    const includeDuplicates = element("input");
    includeDuplicates.type = "checkbox";
    duplicateControl.hidden = true;
    duplicateControl.append(includeDuplicates, element("span", undefined, "Include duplicate commands"));
    form.append(nameField, sourceField, help, duplicateControl, preview);

    let currentPreview: TableImportPreview = parseTablePaste(
      "",
      "Imported Table",
      existingCommandIds,
      existingCommands,
    );
    let currentSource = "";
    let previewTimer: number | null = null;
    let modal = openModal(
      "Add Compact Table",
      form,
      [
        { label: "CANCEL", action: () => finish(null) },
        { label: "CREATE TABLE", primary: true, action: submit },
      ],
      true,
      () => finish(null),
    );

    name.addEventListener("input", refreshPreview);
    source.addEventListener("input", schedulePreview);
    includeDuplicates.addEventListener("change", refreshPreview);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submit();
    });
    refreshPreview();
    queueMicrotask(() => name.focus());

    function refreshPreview(): void {
      if (previewTimer !== null) {
        window.clearTimeout(previewTimer);
        previewTimer = null;
      }
      currentSource = source.value;
      currentPreview = parseTablePaste(
        currentSource,
        name.value.trim() || "Imported Table",
        existingCommandIds,
        existingCommands,
      );
      duplicateControl.hidden = currentPreview.duplicates.length === 0;
      if (duplicateControl.hidden) {
        includeDuplicates.checked = false;
      }
      renderPreview(
        preview,
        currentPreview,
        currentSource.trim().length > 0,
        includeDuplicates.checked,
      );
      const commands = importableCommands(currentPreview, includeDuplicates.checked);
      modal.setActionDisabled(
        "CREATE TABLE",
        currentSource.trim().length > 0 &&
          commands.length === 0 &&
          currentPreview.duplicates.length > 0,
      );
    }

    function schedulePreview(): void {
      if (previewTimer !== null) {
        window.clearTimeout(previewTimer);
      }
      previewTimer = window.setTimeout(refreshPreview, 150);
    }

    function submit(): void {
      const title = name.value.trim();
      if (!title) {
        modal.setError("Table Name is required.");
        name.focus();
        return;
      }
      refreshPreview();
      if (currentSource.trim() && hasTableImportErrors(currentPreview)) {
        modal.setError("Fix the pasted table errors shown below before creating the table.");
        source.focus();
        return;
      }
      const commands = importableCommands(currentPreview, includeDuplicates.checked);
      if (currentSource.trim() && commands.length === 0 && currentPreview.duplicates.length > 0) {
        modal.setError("Every pasted command is already present. Enable Include duplicate commands to import them anyway.");
        includeDuplicates.focus();
        return;
      }
      finish({ title, commands });
    }

    function finish(value: ImportedTable | null): void {
      if (previewTimer !== null) {
        window.clearTimeout(previewTimer);
      }
      modal.close(false);
      resolve(value);
    }
  });
}

function renderPreview(
  container: HTMLElement,
  preview: TableImportPreview,
  hasSource: boolean,
  includeDuplicates: boolean,
): void {
  container.replaceChildren();
  if (!hasSource) {
    container.append(
      element(
        "p",
        "table-import-empty",
        "Paste a table to preview it, or leave this empty to create a blank Compact Table.",
      ),
    );
    return;
  }

  const errors = preview.issues.filter((issue) => issue.severity === "error");
  const warnings = preview.issues.filter((issue) => issue.severity === "warning");
  const commandsToImport = importableCommands(preview, includeDuplicates);
  const skipped = preview.commands.length - commandsToImport.length;
  const heading = element("div", "table-import-preview-heading");
  const format = preview.format?.toUpperCase() ?? "UNKNOWN";
  const state = errors.length > 0 ? "NEEDS FIXES" : "READY";
  heading.append(
    element(
      "strong",
      undefined,
      `${format} · ${commandsToImport.length} TO IMPORT · ${skipped} SKIPPED · ${state}`,
    ),
    element(
      "span",
      errors.length > 0 ? "table-import-status error" : "table-import-status",
      errors.length > 0 ? `${errors.length} error${errors.length === 1 ? "" : "s"}` : "Valid",
    ),
  );
  container.append(heading);

  if (preview.commands.length > 0) {
    const sample = element("div", "table-import-sample");
    const duplicateIds = new Map(
      preview.duplicates.map((item) => [item.commandId, item.kind] as const),
    );
    preview.commands.slice(0, 5).forEach((command, index) => {
      const duplicate = duplicateIds.get(command.id);
      const row = element(
        "div",
        `table-import-sample-row${duplicate && !includeDuplicates ? " duplicate-skipped" : ""}`,
      );
      row.append(
        element("span", "table-import-sample-number", String(index + 1).padStart(2, "0")),
        element("code", undefined, command.command),
        element("span", "table-import-sample-info", command.description || command.notes || "—"),
      );
      if (duplicate) {
        row.append(
          element(
            "span",
            "table-import-duplicate-badge",
            duplicate === "existing" ? "EXISTING FILE" : "PASTED TABLE",
          ),
        );
      }
      sample.append(row);
    });
    if (preview.commands.length > 5) {
      sample.append(
        element("p", "table-import-more", `+ ${preview.commands.length - 5} more rows`),
      );
    }
    container.append(sample);
  }

  if (errors.length > 0 || warnings.length > 0) {
    const issues = element("ul", "table-import-issues");
    [...errors, ...warnings].slice(0, 8).forEach((issue) => {
      const prefix = issue.row ? `Row ${issue.row}: ` : "";
      issues.append(
        element(
          "li",
          `table-import-issue ${issue.severity}`,
          `${issue.severity.toUpperCase()}: ${prefix}${issue.message}`,
        ),
      );
    });
    if (errors.length + warnings.length > 8) {
      issues.append(element("li", "table-import-issue", "More import messages are hidden."));
    }
    container.append(issues);
  }
}
