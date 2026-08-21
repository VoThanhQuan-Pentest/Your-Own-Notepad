import { button, element } from "../utils/dom";

interface PromptOptions {
  title: string;
  label: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  validate?: (value: string) => string | null;
}

interface ConfirmOptions {
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  danger?: boolean;
}

interface MessageOptions {
  title: string;
  message: string;
  detail?: string;
  kind?: "info" | "error";
}

export interface CustomModalHandle {
  body: HTMLElement;
  close(notifyDismissal?: boolean): void;
  setError(message: string | null): void;
}

let activeClose: (() => void) | null = null;

export function openPrompt(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const content = element("form", "modal-form");
    const label = element("label", "form-field");
    label.append(element("span", undefined, options.label));
    const input = element("input");
    input.type = "text";
    input.value = options.initialValue ?? "";
    input.placeholder = options.placeholder ?? "";
    input.autocomplete = "off";
    label.append(input);
    content.append(label);

    const modal = openModal(options.title, content, [
      { label: "CANCEL", action: () => resolveAndClose(null) },
      {
        label: options.confirmLabel ?? "CREATE",
        primary: true,
        action: submit,
      },
    ], false, () => resolve(null));

    function submit(): void {
      const value = input.value.trim();
      const validation = options.validate?.(value) ?? (value ? null : `${options.label} is required.`);
      if (validation) {
        modal.setError(validation);
        input.focus();
        return;
      }
      resolveAndClose(value);
    }

    function resolveAndClose(value: string | null): void {
      modal.close(false);
      resolve(value);
    }

    content.addEventListener("submit", (event) => {
      event.preventDefault();
      submit();
    });
    queueMicrotask(() => {
      input.focus();
      input.select();
    });
  });
}

export function openConfirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const content = element("div", "confirm-content");
    content.append(element("p", undefined, options.message));
    if (options.detail) {
      content.append(element("pre", "confirm-detail", options.detail));
    }
    const modal = openModal(options.title, content, [
      { label: "CANCEL", action: () => finish(false) },
      {
        label: options.confirmLabel ?? "CONFIRM",
        primary: true,
        danger: options.danger,
        action: () => finish(true),
      },
    ], false, () => resolve(false));

    function finish(value: boolean): void {
      modal.close(false);
      resolve(value);
    }
  });
}

export function showMessage(options: MessageOptions): Promise<void> {
  return new Promise((resolve) => {
    const content = element("div", `message-content ${options.kind ?? "info"}`);
    content.append(element("p", undefined, options.message));
    if (options.detail) {
      content.append(element("pre", "message-detail", options.detail));
    }
    const modal = openModal(options.title, content, [
      {
        label: "OK",
        primary: true,
        action: () => {
          modal.close(false);
          resolve();
        },
      },
    ], false, () => resolve());
  });
}

export interface ModalAction {
  label: string;
  primary?: boolean;
  danger?: boolean;
  action: () => void | Promise<void>;
}

export function openModal(
  title: string,
  body: HTMLElement,
  actions: ModalAction[],
  wide = false,
  onDismiss?: () => void,
): CustomModalHandle {
  activeClose?.();

  const overlay = element("div", "modal-overlay");
  const dialog = element("section", `modal-dialog${wide ? " wide" : ""}`);
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "active-modal-title");

  const header = element("header", "modal-header");
  const heading = element("h2", undefined, title);
  heading.id = "active-modal-title";
  const closeButton = button("modal-close", "×");
  closeButton.setAttribute("aria-label", "Close dialog");
  header.append(heading, closeButton);

  const content = element("div", "modal-body");
  const error = element("p", "modal-error");
  error.hidden = true;
  content.append(body, error);

  const footer = element("footer", "modal-footer");
  actions.forEach((item) => {
    const actionButton = button(
      `modal-button${item.primary ? " primary" : ""}${item.danger ? " danger" : ""}`,
      item.label,
    );
    actionButton.addEventListener("click", () => void item.action());
    footer.append(actionButton);
  });

  dialog.append(header, content, footer);
  overlay.append(dialog);
  document.body.append(overlay);

  const close = (notifyDismissal = true): void => {
    if (!overlay.isConnected) {
      return;
    }
    overlay.remove();
    document.removeEventListener("keydown", onKeyDown);
    activeClose = null;
    if (notifyDismissal) {
      onDismiss?.();
    }
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      close();
    }
  };

  activeClose = close;
  closeButton.addEventListener("click", () => close());
  overlay.addEventListener("mousedown", (event) => {
    if (event.target === overlay) {
      close();
    }
  });
  document.addEventListener("keydown", onKeyDown);

  return {
    body,
    close,
    setError(message) {
      error.hidden = !message;
      error.textContent = message ?? "";
    },
  };
}
