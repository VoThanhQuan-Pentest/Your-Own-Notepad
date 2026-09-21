import { playModalWhoosh } from "../services/audio";
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
  setActionDisabled(label: string, disabled: boolean): void;
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
  playModalWhoosh(true);

  const previouslyFocused = (typeof document !== "undefined" && document.activeElement instanceof HTMLElement)
    ? document.activeElement
    : null;

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
  const actionButtons = new Map<string, HTMLButtonElement>();
  actions.forEach((item) => {
    const actionButton = button(
      `modal-button${item.primary ? " primary" : ""}${item.danger ? " danger" : ""}`,
      item.label,
    );
    actionButton.addEventListener("click", () => void item.action());
    actionButtons.set(item.label, actionButton);
    footer.append(actionButton);
  });

  dialog.append(header, content, footer);
  overlay.append(dialog);
  document.body.append(overlay);

  const getFocusableElements = (): HTMLElement[] => {
    const selector =
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.from(dialog.querySelectorAll<HTMLElement>(selector)).filter(
      (el) => !el.hidden && el.getAttribute("aria-hidden") !== "true",
    );
  };

  const close = (notifyDismissal = true): void => {
    if (!overlay.isConnected) {
      return;
    }
    playModalWhoosh(false);
    overlay.remove();
    document.removeEventListener("keydown", onKeyDown);
    activeClose = null;
    if (previouslyFocused && previouslyFocused.isConnected) {
      previouslyFocused.focus();
    }
    if (notifyDismissal) {
      onDismiss?.();
    }
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      close();
      return;
    }
    if (event.key === "Tab") {
      const focusables = getFocusableElements();
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first || !dialog.contains(document.activeElement)) {
          event.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last || !dialog.contains(document.activeElement)) {
          event.preventDefault();
          first?.focus();
        }
      }
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

  queueMicrotask(() => {
    if (!dialog.contains(document.activeElement)) {
      const firstInput = content.querySelector<HTMLElement>(
        'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])',
      );
      const primaryAction = actions.find((a) => a.primary);
      const primaryButton = primaryAction ? actionButtons.get(primaryAction.label) : undefined;
      const focusables = getFocusableElements();
      const target = firstInput ?? primaryButton ?? focusables[0];
      target?.focus();
    }
  });

  return {
    body,
    close,
    setError(message) {
      error.hidden = !message;
      error.textContent = message ?? "";
    },
    setActionDisabled(label, disabled) {
      const action = actionButtons.get(label);
      if (action) {
        action.disabled = disabled;
      }
    },
  };
}
