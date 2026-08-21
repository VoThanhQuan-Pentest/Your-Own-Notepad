import type {
  CommandAction,
  CommandEntry,
  CommandRisk,
  CommandVariable,
} from "../models/command-file";
import { button, element } from "../utils/dom";
import { createId } from "../utils/ids";
import { openModal } from "./modal";

interface CommandFormOptions {
  tableRow?: boolean;
}

export function openCommandForm(
  initial: CommandEntry | null,
  existingIds: ReadonlySet<string>,
  options: CommandFormOptions = {},
): Promise<CommandEntry | null> {
  return new Promise((resolve) => {
    const form = element("form", "modal-form command-entry-form");
    const name = textInput(
      form,
      options.tableRow ? "Function / Label" : "Name",
      initial?.name ?? "",
      true,
    );
    const command = textArea(form, "Command", initial?.command ?? "", true, true);
    const description = textArea(form, "Description", initial?.description ?? "");
    const syntax = textArea(form, "Syntax", initial?.syntax ?? "", false, true);
    const example = textArea(form, "Example", initial?.example ?? "", false, true);
    const notes = textArea(form, "Notes", initial?.notes ?? "");

    const selects = element("div", "form-columns");
    const action = selectInput<CommandAction>(selects, "Action", [
      ["copy", "Copy"],
      ["run", "Run"],
      ["open", "Open"],
      ["open-terminal", "Open Terminal"],
    ], initial?.action ?? "copy");
    const risk = selectInput<CommandRisk>(selects, "Risk", [
      ["safe", "Safe"],
      ["caution", "Caution"],
      ["danger", "Danger"],
    ], initial?.risk ?? "safe");
    form.append(selects);

    const variableSection = element("section", "form-variables");
    const variableHeader = element("div", "form-variables-header");
    variableHeader.append(element("h3", undefined, "Variables"));
    const addVariable = button("inline-button", "+ ADD VARIABLE");
    variableHeader.append(addVariable);
    const variableList = element("div", "form-variable-list");
    (initial?.variables ?? []).forEach((variable) => variableList.append(variableRow(variable)));
    variableSection.append(variableHeader, variableList);
    form.append(variableSection);

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

    addVariable.addEventListener("click", () => {
      const row = variableRow();
      variableList.append(row);
      row.querySelector<HTMLInputElement>('input[data-field="name"]')?.focus();
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      save();
    });

    function save(): void {
      const nameValue = name.value.trim();
      const commandValue = command.value.trim();
      if (!nameValue) {
        modal.setError("Name is required.");
        name.focus();
        return;
      }
      if (!commandValue) {
        modal.setError("Command is required.");
        command.focus();
        return;
      }

      const variables: CommandVariable[] = [];
      const names = new Set<string>();
      for (const row of variableList.querySelectorAll<HTMLElement>(".form-variable-row")) {
        const nameInput = row.querySelector<HTMLInputElement>('input[data-field="name"]');
        const defaultInput = row.querySelector<HTMLInputElement>('input[data-field="default"]');
        const variableName = nameInput?.value.trim() ?? "";
        if (!variableName) {
          modal.setError("Every variable needs a name, or remove the empty variable row.");
          nameInput?.focus();
          return;
        }
        if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(variableName)) {
          modal.setError(`Variable "${variableName}" has an invalid name.`);
          nameInput?.focus();
          return;
        }
        if (names.has(variableName)) {
          modal.setError(`Variable names must be unique: "${variableName}" is duplicated.`);
          nameInput?.focus();
          return;
        }
        names.add(variableName);
        variables.push({
          name: variableName,
          ...(defaultInput?.value ? { default: defaultInput.value } : {}),
        });
      }

      finish({
        id: initial?.id ?? createId(nameValue, existingIds),
        name: nameValue,
        command: commandValue,
        description: description.value,
        syntax: syntax.value,
        example: example.value,
        notes: notes.value,
        action: action.value as CommandAction,
        risk: risk.value as CommandRisk,
        ...(variables.length > 0 ? { variables } : {}),
      });
    }

    function finish(value: CommandEntry | null): void {
      modal.close(false);
      resolve(value);
    }

    queueMicrotask(() => name.focus());
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

function selectInput<T extends string>(
  parent: HTMLElement,
  labelText: string,
  options: Array<[T, string]>,
  value: T,
): HTMLSelectElement {
  const label = element("label", "form-field");
  label.append(element("span", undefined, labelText));
  const select = element("select");
  options.forEach(([optionValue, text]) => {
    const option = element("option", undefined, text);
    option.value = optionValue;
    option.selected = optionValue === value;
    select.append(option);
  });
  label.append(select);
  parent.append(label);
  return select;
}

function variableRow(variable?: CommandVariable): HTMLElement {
  const row = element("div", "form-variable-row");
  const name = element("input");
  name.type = "text";
  name.placeholder = "name";
  name.value = variable?.name ?? "";
  name.dataset.field = "name";
  name.setAttribute("aria-label", "Variable name");

  const defaultValue = element("input");
  defaultValue.type = "text";
  defaultValue.placeholder = "default value";
  defaultValue.value = variable?.default ?? "";
  defaultValue.dataset.field = "default";
  defaultValue.setAttribute("aria-label", "Variable default value");

  const remove = button("remove-variable", "×");
  remove.title = "Remove variable";
  remove.setAttribute("aria-label", "Remove variable");
  remove.addEventListener("click", () => row.remove());
  row.append(name, defaultValue, remove);
  return row;
}
