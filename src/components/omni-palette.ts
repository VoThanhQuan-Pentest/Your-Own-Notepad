import {
  playLaserChirp,
  playServoClick,
  playTacticalTargetLock,
} from "../services/audio";
import { button, element } from "../utils/dom";

export interface OmniAction {
  id: string;
  category: "SYSTEM" | "THEME" | "MODE" | "TOOLS";
  title: string;
  detail: string;
  run: () => void;
}

export interface OmniPaletteContext {
  actions: OmniAction[];
}

let activeOverlay: HTMLElement | null = null;

export function openOmniPalette(context: OmniPaletteContext): void {
  document.querySelectorAll(".omni-palette-overlay").forEach((el) => el.remove());
  activeOverlay = null;

  playLaserChirp();

  const overlay = element("div", "omni-palette-overlay");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", "Command Palette");

  const modal = element("div", "omni-palette-modal");

  const searchBox = element("div", "omni-search-box");
  const prefix = element("span", "omni-search-prefix", ">_");
  const input = element("input", "omni-search-input") as HTMLInputElement;
  input.type = "text";
  input.placeholder = "Search actions, themes, or commands...";
  input.autocomplete = "off";
  input.spellcheck = false;

  const hint = element(
    "div",
    "omni-search-hint",
    "ENTER TO EXECUTE // ESC TO CLOSE // ARROWS TO SELECT",
  );
  searchBox.append(prefix, input, hint);

  const list = element("div", "omni-action-list");
  let selectedIndex = 0;
  let filteredActions: OmniAction[] = [...context.actions];

  function renderList() {
    list.replaceChildren();
    if (filteredActions.length === 0) {
      list.append(element("div", "omni-empty", "No matching tactical actions found."));
      return;
    }

    filteredActions.forEach((action, idx) => {
      const item = button(
        `omni-action-item ${idx === selectedIndex ? "selected" : ""}`,
        "",
      );
      const catBadge = element("span", `omni-cat-badge ${action.category.toLowerCase()}`, action.category);
      const copy = element("div", "omni-item-copy");
      copy.append(
        element("strong", "omni-item-title", action.title),
        element("span", "omni-item-detail", action.detail),
      );
      item.append(catBadge, copy);

      item.addEventListener("click", () => {
        execute(action);
      });
      item.addEventListener("mouseenter", () => {
        selectedIndex = idx;
        updateSelection();
      });

      list.append(item);
    });

    ensureVisible();
  }

  function updateSelection() {
    const items = list.querySelectorAll<HTMLElement>(".omni-action-item");
    items.forEach((it, i) => {
      it.classList.toggle("selected", i === selectedIndex);
    });
    ensureVisible();
  }

  function ensureVisible() {
    const activeItem = list.querySelector<HTMLElement>(".omni-action-item.selected");
    activeItem?.scrollIntoView({ block: "nearest" });
  }

  function execute(action: OmniAction) {
    playTacticalTargetLock();
    close();
    action.run();
  }

  function close() {
    window.removeEventListener("keydown", onGlobalKeyDown, true);
    if (activeOverlay) {
      const target = activeOverlay;
      activeOverlay = null;
      target.classList.add("closing");
      window.setTimeout(() => {
        target.remove();
      }, 160);
    }
  }

  function onGlobalKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }
  window.addEventListener("keydown", onGlobalKeyDown, true);

  input.addEventListener("input", () => {
    const query = input.value.trim().toLowerCase();
    filteredActions = context.actions.filter(
      (a) =>
        a.title.toLowerCase().includes(query) ||
        a.detail.toLowerCase().includes(query) ||
        a.category.toLowerCase().includes(query),
    );
    selectedIndex = 0;
    renderList();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (filteredActions.length > 0) {
        selectedIndex = (selectedIndex + 1) % filteredActions.length;
        playServoClick();
        updateSelection();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filteredActions.length > 0) {
        selectedIndex = (selectedIndex - 1 + filteredActions.length) % filteredActions.length;
        playServoClick();
        updateSelection();
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredActions[selectedIndex]) {
        execute(filteredActions[selectedIndex]);
      }
    }
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      close();
    }
  });

  renderList();
  modal.append(searchBox, list);
  overlay.append(modal);
  document.body.append(overlay);
  activeOverlay = overlay;

  input.focus();
  window.requestAnimationFrame(() => input.focus());
}
