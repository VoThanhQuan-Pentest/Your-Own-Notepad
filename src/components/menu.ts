import { button, element } from "../utils/dom";

export interface MenuItem {
  label: string;
  danger?: boolean;
  disabled?: boolean;
  action: () => void | Promise<void>;
}

let activeMenu: HTMLElement | null = null;
let activeCleanup: (() => void) | null = null;

export function openMenu(anchor: HTMLElement, items: MenuItem[]): void {
  closeMenu();
  const menu = element("div", "context-menu");
  menu.setAttribute("role", "menu");

  items.forEach((item) => {
    const itemButton = button(`context-menu-item${item.danger ? " danger" : ""}`, item.label);
    itemButton.disabled = item.disabled ?? false;
    itemButton.setAttribute("role", "menuitem");
    itemButton.addEventListener("click", () => {
      closeMenu();
      void item.action();
    });
    menu.append(itemButton);
  });

  document.body.append(menu);
  const anchorRect = anchor.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const left = Math.min(anchorRect.left, window.innerWidth - menuRect.width - 8);
  const top = Math.min(anchorRect.bottom + 4, window.innerHeight - menuRect.height - 8);
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(8, top)}px`;

  const dismiss = (event: MouseEvent): void => {
    if (!menu.contains(event.target as Node)) {
      closeMenu();
    }
  };
  const escape = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      closeMenu();
    }
  };
  const cleanup = (): void => {
    document.removeEventListener("mousedown", dismiss, true);
    document.removeEventListener("keydown", escape);
  };

  activeMenu = menu;
  activeCleanup = cleanup;
  queueMicrotask(() => {
    document.addEventListener("mousedown", dismiss, true);
    document.addEventListener("keydown", escape);
    menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  });
}

export function closeMenu(): void {
  activeCleanup?.();
  activeCleanup = null;
  activeMenu?.remove();
  activeMenu = null;
}
