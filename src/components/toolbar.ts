import { playMechanicalClick } from "../services/audio";
import { button, element } from "../utils/dom";

interface ToolbarCallbacks {
  onSearch(query: string): void;
  onHome(): void;
  onSettings(): void;
}

export interface ToolbarHandle {
  element: HTMLElement;
  input: HTMLInputElement;
  focusSearch(): void;
  clearSearch(): void;
  setResults(content: HTMLElement | null): void;
  setProfileName(name: string | null): void;
}

export function createToolbar(callbacks: ToolbarCallbacks): ToolbarHandle {
  const header = element("header", "app-header");
  const brand = button("brand", "");
  brand.title = "Open Home dashboard";
  brand.setAttribute("aria-label", "Open Home dashboard");
  const mark = element("span", "brand-mark");
  mark.setAttribute("aria-hidden", "true");
  brand.append(mark, element("span", "brand-title", "COMMAND VAULT"));
  brand.addEventListener("click", callbacks.onHome);

  const actions = element("div", "header-actions");
  const searchWrapper = element("div", "search-wrapper");
  const search = element("label", "search-control");
  search.append(element("span", "visually-hidden", "Search commands"));

  const input = element("input");
  input.type = "search";
  input.placeholder = "Search commands";
  input.autocomplete = "off";
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", "command-search-results");
  input.setAttribute("aria-keyshortcuts", "Control+K");

  search.append(input, element("kbd", undefined, "Ctrl K"));
  const results = element("div", "search-results");
  results.id = "command-search-results";
  results.setAttribute("role", "listbox");
  results.setAttribute("aria-label", "Command search results");
  results.hidden = true;
  let resultButtons: HTMLButtonElement[] = [];
  let activeResult = -1;
  searchWrapper.append(search, results);

  const profile = button("profile-chip", "");
  profile.title = "Edit local profile";
  profile.setAttribute("aria-label", "Edit local profile");
  profile.addEventListener("click", callbacks.onSettings);
  const profileMark = element("span", "profile-avatar", "?");
  const profileName = element("span", "profile-name", "LOCAL");
  profile.append(profileMark, profileName);

  const settings = button("icon-button", "⚙");
  settings.title = "Settings";
  settings.setAttribute("aria-label", "Open settings");
  settings.addEventListener("click", callbacks.onSettings);
  input.addEventListener("input", () => callbacks.onSearch(input.value));
  input.addEventListener("keydown", (event) => {
    if (
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      event.key !== "ArrowDown" &&
      event.key !== "ArrowUp" &&
      event.key !== "Escape" &&
      event.key !== "Tab"
    ) {
      playMechanicalClick();
    }
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && resultButtons.length > 0) {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const next = activeResult < 0
        ? direction > 0 ? 0 : resultButtons.length - 1
        : (activeResult + direction + resultButtons.length) % resultButtons.length;
      setActiveResult(next);
      return;
    }
    if (event.key === "Enter" && resultButtons.length > 0 && !results.hidden) {
      event.preventDefault();
      resultButtons[activeResult >= 0 ? activeResult : 0]?.click();
      return;
    }
    if (event.key === "Escape") {
      input.value = "";
      callbacks.onSearch("");
      input.blur();
      hideResults();
    }
  });

  actions.append(searchWrapper, profile, settings);
  header.append(brand, actions);

  return {
    element: header,
    input,
    focusSearch() {
      input.focus();
      input.select();
    },
    clearSearch() {
      input.value = "";
      hideResults();
      callbacks.onSearch("");
    },
    setResults(content) {
      results.replaceChildren();
      results.hidden = content === null;
      input.setAttribute("aria-expanded", String(content !== null));
      input.removeAttribute("aria-activedescendant");
      activeResult = -1;
      resultButtons = [];
      if (content) {
        results.append(content);
        resultButtons = [...results.querySelectorAll<HTMLButtonElement>(".search-result")];
        resultButtons.forEach((result, index) => {
          result.id = `command-search-result-${index}`;
          result.setAttribute("role", "option");
          result.setAttribute("aria-selected", "false");
          result.addEventListener("mouseenter", () => setActiveResult(index));
          result.addEventListener("focus", () => setActiveResult(index));
        });
      }
    },
    setProfileName(name) {
      const normalized = name?.trim() || "LOCAL";
      profileName.textContent = normalized;
      profileMark.textContent = [...normalized][0]?.toUpperCase() ?? "?";
      profile.setAttribute("aria-label", `Edit local profile for ${normalized}`);
    },
  };

  function setActiveResult(index: number): void {
    resultButtons.forEach((result, current) => {
      const active = current === index;
      result.classList.toggle("active", active);
      result.setAttribute("aria-selected", String(active));
    });
    activeResult = index;
    const active = resultButtons[index];
    if (active) {
      input.setAttribute("aria-activedescendant", active.id);
      active.scrollIntoView({ block: "nearest" });
    }
  }

  function hideResults(): void {
    results.hidden = true;
    results.replaceChildren();
    resultButtons = [];
    activeResult = -1;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }
}
