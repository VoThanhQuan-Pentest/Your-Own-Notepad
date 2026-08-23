import { button, element } from "../utils/dom";

interface ToolbarCallbacks {
  onSearch(query: string): void;
  onSettings(): void;
}

export interface ToolbarHandle {
  element: HTMLElement;
  input: HTMLInputElement;
  focusSearch(): void;
  clearSearch(): void;
  setResults(content: HTMLElement | null): void;
}

export function createToolbar(callbacks: ToolbarCallbacks): ToolbarHandle {
  const header = element("header", "app-header");
  const brand = element("div", "brand");
  const mark = element("span", "brand-mark");
  mark.setAttribute("aria-hidden", "true");
  brand.append(mark, element("span", "brand-title", "COMMAND VAULT"));

  const actions = element("div", "header-actions");
  const searchWrapper = element("div", "search-wrapper");
  const search = element("label", "search-control");
  search.append(element("span", "visually-hidden", "Search commands"));

  const input = element("input");
  input.type = "search";
  input.placeholder = "Search commands";
  input.autocomplete = "off";
  input.setAttribute("aria-keyshortcuts", "Control+K");

  search.append(input, element("kbd", undefined, "Ctrl K"));
  const results = element("div", "search-results");
  results.hidden = true;
  searchWrapper.append(search, results);

  const settings = button("icon-button", "⚙");
  settings.title = "Settings";
  settings.setAttribute("aria-label", "Open settings");
  settings.addEventListener("click", callbacks.onSettings);
  input.addEventListener("input", () => callbacks.onSearch(input.value));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      input.value = "";
      callbacks.onSearch("");
      input.blur();
    }
  });

  actions.append(searchWrapper, settings);
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
      results.hidden = true;
      results.replaceChildren();
      callbacks.onSearch("");
    },
    setResults(content) {
      results.replaceChildren();
      results.hidden = content === null;
      if (content) {
        results.append(content);
      }
    },
  };
}
