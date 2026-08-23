import type { CommandEntry } from "../models/command-file";
import { element } from "../utils/dom";
import { createId } from "../utils/ids";
import { openModal } from "./modal";

interface CommandFormOptions {
  tableRow?: boolean;
  tableRowNumber?: number;
}

export function openCommandForm(
  initial: CommandEntry | null,
  existingIds: ReadonlySet<string>,
  options: CommandFormOptions = {},
): Promise<CommandEntry | null> {
  return new Promise((resolve) => {
    const form = element("form", "modal-form command-entry-form");
    const name = options.tableRow ? null : textInput(form, "Name", initial?.name ?? "", true);
    const command = textArea(form, "Command", initial?.command ?? "", true, true);
    const description = textArea(form, "Description", initial?.description ?? "");
    const example = textArea(form, "Example", initial?.example ?? "", false, true);
    const notes = textArea(form, "Notes", initial?.notes ?? "");

    const modal = openModal(
      initial
        ? options.tableRow
          ? "Edit Table Row"
          : "Edit Command"
        : options.tableRow
          ? "Add Table Row"
          : "Add Command",
      form,
      [
        { label: "CANCEL", action: () => finish(null) },
        { label: "SAVE", primary: true, action: save },
      ],
      true,
      () => resolve(null),
    );

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      save();
    });

    function save(): void {
      const nameValue = options.tableRow
        ? initial?.name.trim() || `Table Row ${options.tableRowNumber ?? 1}`
        : name?.value.trim() ?? "";
      const commandValue = command.value.trim();
      if (!nameValue) {
        modal.setError("Name is required.");
        name?.focus();
        return;
      }
      if (!commandValue) {
        modal.setError("Command is required.");
        command.focus();
        return;
      }

      finish({
        id: initial?.id ?? createId(nameValue, existingIds),
        name: nameValue,
        command: commandValue,
        description: description.value,
        example: example.value,
        notes: notes.value,
      });
    }

    function finish(value: CommandEntry | null): void {
      modal.close(false);
      resolve(value);
    }

    queueMicrotask(() => (name ?? command).focus());
  });
}

function textInput(
  parent: HTMLElement,
  labelText: string,
  value: string,
  required = false,
): HTMLInputElement {
  const label = element("label", "form-field");
  label.append(element("span", undefined, labelText));
  const input = element("input");
  input.type = "text";
  input.value = value;
  input.required = required;
  input.autocomplete = "off";
  label.append(input);
  parent.append(label);
  return input;
}

function textArea(
  parent: HTMLElement,
  labelText: string,
  value: string,
  required = false,
  code = false,
): HTMLTextAreaElement {
  const label = element("label", `form-field${code ? " code-field" : ""}`);
  label.append(element("span", undefined, labelText));
  const input = element("textarea");
  input.value = value;
  input.required = required;
  label.append(input);
  parent.append(label);
  return input;
}
