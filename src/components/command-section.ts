import type { CommandEntry, CommandSection } from "../models/command-file";
import { button, element } from "../utils/dom";
import { createCommandRow, type CommandRowCallbacks, type CommandRowHandle } from "./command-row";
import { createVirtualRows, type VirtualRowsHandle } from "./virtual-rows";
import { createIcon } from "./icons";
import type { SectionHighlightLevel } from "../models/settings";
import type { EffectivePerformanceProfile } from "../services/performance";

export interface CommandSectionHandle {
  element: HTMLElement;
  ensureCommandVisible(commandId?: string): void;
  refreshLayout(): void;
  setPerformanceProfile(profile: EffectivePerformanceProfile): void;
  dispose(): void;
}

interface CommandSectionCallbacks {
  onToggle(sectionId: string, expanded: boolean): void;
  onExampleColumnToggle(sectionId: string, visible: boolean): void;
  onSectionHighlightToggle(sectionId: string, level: SectionHighlightLevel | null): void;
  onAddCommand(sectionId: string): void;
  onSectionMenu(anchor: HTMLButtonElement, section: CommandSection): void;
  onSelectionMode(sectionId: string, active: boolean): void;
  onBulkMove(sectionId: string, commandIds: string[]): void;
  onBulkDelete(sectionId: string, commandIds: string[]): void;
  onCommandReorder(sectionId: string, commandId: string, targetIndex: number): void;
  rowCallbacks: CommandRowCallbacks;
  showExampleColumn: boolean;
  highlightLevel: SectionHighlightLevel | null;
  selectionActive: boolean;
  canMoveSelection: boolean;
  getScrollRoot(): HTMLElement | null;
  performanceProfile: EffectivePerformanceProfile;
  deferInitialContent: boolean;
}

export function createCommandSection(
  section: CommandSection,
  initiallyExpanded: boolean,
  callbacks: CommandSectionCallbacks,
): CommandSectionHandle {
  const wrapper = element("section", "command-section");
  wrapper.dataset.sectionId = section.id;
  const header = element("div", "section-header");
  const toggle = button("section-toggle", "");
  const chevron = element("span", "section-chevron", initiallyExpanded ? "▾" : "▸");
  chevron.setAttribute("aria-hidden", "true");
  toggle.append(chevron, element("span", "section-title", section.title));
  if (section.layout === "table") {
    toggle.append(element("span", "section-layout-badge", "TABLE"));
  }
  toggle.setAttribute("aria-expanded", String(initiallyExpanded));
  const count = element("span", "section-count", String(section.commands.length));
  count.title = `${section.commands.length} ${section.commands.length === 1 ? "command" : "commands"}`;
  header.append(toggle, count);

  let highlightLevel = callbacks.highlightLevel;
  const highlight = button("section-highlight", "");
  highlight.append(createIcon("star"), element("span", "section-highlight-badge"));
  updateSectionHighlight(wrapper, highlight, section.title, highlightLevel);
  highlight.addEventListener("click", () => {
    highlightLevel = nextHighlightLevel(highlightLevel);
    updateSectionHighlight(wrapper, highlight, section.title, highlightLevel);
    callbacks.onSectionHighlightToggle(section.id, highlightLevel);
  });
  header.append(highlight);

  if (section.commands.length > 0) {
    const select = button(
      `section-select${callbacks.selectionActive ? " active" : ""}`,
      callbacks.selectionActive ? "SELECTING" : "SELECT",
    );
    select.setAttribute("aria-pressed", String(callbacks.selectionActive));
    select.title = callbacks.selectionActive ? "Exit row selection" : "Select multiple rows";
    select.addEventListener("click", () =>
      callbacks.onSelectionMode(section.id, !callbacks.selectionActive),
    );
    header.append(select);
  }

  const hasExamples = section.commands.some((command) => command.example?.trim());
  let showExampleColumn = hasExamples && callbacks.showExampleColumn;
  if (hasExamples) {
    const exampleSwitch = createExampleSwitch(showExampleColumn);
    exampleSwitch.addEventListener("click", () => {
      showExampleColumn = !showExampleColumn;
      if (!showExampleColumn) {
        expandedExampleIds.clear();
      }
      updateExampleSwitch(exampleSwitch, showExampleColumn);
      callbacks.onExampleColumnToggle(section.id, showExampleColumn);
      renderContent();
    });
    header.append(exampleSwitch);
  }

  const add = button("section-add", "+");
  const rowLabel = section.layout === "table" ? "row" : "command";
  add.title = `Add ${rowLabel} to ${section.title}`;
  add.setAttribute("aria-label", `Add ${rowLabel} to ${section.title}`);
  add.addEventListener("click", () => callbacks.onAddCommand(section.id));
  header.append(add);

  const menu = button("row-menu section-menu", "⋮");
  menu.title = `Actions for ${section.title}`;
  menu.setAttribute("aria-label", `Actions for ${section.title}`);
  menu.addEventListener("click", () => callbacks.onSectionMenu(menu, section));
  header.append(menu);

  const content = element("div", "section-content");
  let isExpanded = initiallyExpanded;
  let expandedCommandId: string | null = null;
  const expandedExampleIds = new Set<string>();
  let virtualRows: VirtualRowsHandle | null = null;
  const selectedCommandIds = new Set<string>();
  let expandedRowHandle: CommandRowHandle | null = null;
  let animationGeneration = 0;
  let animationTimer: number | null = null;
  let animationEndHandler: ((event: AnimationEvent) => void) | null = null;
  let performanceProfile = callbacks.performanceProfile;
  let contentMaterialized = false;
  let sectionVisibilityObserver: IntersectionObserver | null = null;
  let lastMaterializedHeight = 0;

  function setSectionExpanded(next: boolean, notify: boolean): void {
    const exitSelectionAfterClose = !next && callbacks.selectionActive;
    isExpanded = next;
    toggle.setAttribute("aria-expanded", String(next));
    chevron.textContent = next ? "▾" : "▸";
    if (notify) {
      callbacks.onToggle(section.id, next);
    }
    if (next) {
      cancelSectionAnimation();
      content.hidden = false;
      content.removeAttribute("inert");
      renderContent();
      if (prefersReducedMotion()) {
        virtualRows?.reconnect();
        return;
      }
      queueMicrotask(() => virtualRows?.reconnect());
      animateSectionContent(
        "opening",
        Math.max(1, Math.round(180 * performanceProfile.sectionMotionScale)),
        () => virtualRows?.reconnect(),
      );
      return;
    }
    if (prefersReducedMotion()) {
      cancelSectionAnimation();
      disposeContent();
      if (exitSelectionAfterClose) {
        callbacks.onSelectionMode(section.id, false);
      }
      return;
    }
    content.setAttribute("inert", "");
    animateSectionContent(
      "closing",
      Math.max(1, Math.round(140 * performanceProfile.sectionMotionScale)),
      () => {
      disposeContent();
      if (exitSelectionAfterClose) {
        callbacks.onSelectionMode(section.id, false);
      }
      },
    );
  }

  function renderContent(): void {
    virtualRows?.destroy();
    virtualRows = null;
    expandedRowHandle = null;
    content.replaceChildren();
    contentMaterialized = true;
    delete content.dataset.deferred;
    content.hidden = !isExpanded;
    if (!isExpanded) {
      return;
    }

    let updateSelectionBar = (): void => undefined;
    if (callbacks.selectionActive) {
      const selectionBar = element("div", "section-selection-bar");
      const summary = element("strong", "selection-summary");
      const selectAll = button("inline-button", "SELECT ALL");
      const move = button("inline-button", "MOVE TO…");
      const remove = button("inline-button danger", "DELETE");
      const cancel = button("inline-button", "CANCEL");
      updateSelectionBar = () => {
        const selected = selectedCommandIds.size;
        summary.textContent = `${selected} SELECTED`;
        selectAll.textContent = selected === section.commands.length ? "CLEAR ALL" : "SELECT ALL";
        move.disabled = selected === 0 || !callbacks.canMoveSelection;
        remove.disabled = selected === 0;
      };
      selectAll.addEventListener("click", () => {
        if (selectedCommandIds.size === section.commands.length) {
          selectedCommandIds.clear();
        } else {
          section.commands.forEach((command) => selectedCommandIds.add(command.id));
        }
        renderContent();
      });
      move.addEventListener("click", () =>
        callbacks.onBulkMove(section.id, [...selectedCommandIds]),
      );
      remove.addEventListener("click", () =>
        callbacks.onBulkDelete(section.id, [...selectedCommandIds]),
      );
      cancel.addEventListener("click", () => callbacks.onSelectionMode(section.id, false));
      selectionBar.append(summary, selectAll, move, remove, cancel);
      content.append(selectionBar);
      updateSelectionBar();
    }

    const columnHeader = element(
      "div",
      `table-heading${showExampleColumn ? " with-example-column" : ""}`,
    );
    columnHeader.append(
      element("div", undefined, section.layout === "table" ? "NO. / COMMAND" : "COMMAND"),
      element("div", undefined, "INFORMATION"),
    );
    if (showExampleColumn) {
      columnHeader.append(element("div", undefined, "EXAMPLE"));
    }
    content.append(columnHeader);

    if (section.commands.length === 0) {
      const empty = element("div", "section-empty");
      empty.append(
        element(
          "p",
          undefined,
          section.layout === "table" ? "No rows in this table." : "No commands in this section.",
        ),
      );
      const addFirst = button(
        "inline-button",
        section.layout === "table" ? "+ ADD ROW" : "+ ADD COMMAND",
      );
      addFirst.addEventListener("click", () => callbacks.onAddCommand(section.id));
      empty.append(addFirst);
      content.append(empty);
      return;
    }

    const renderRow = (index: number): HTMLElement => {
      const command = section.commands[index] as CommandEntry;
      let handle: CommandRowHandle;
      handle = createCommandRow(
        command,
        (rowHandle) => {
          const previousId = expandedCommandId;
          expandedCommandId = previousId === command.id ? null : command.id;
          if (previousId && previousId !== command.id) expandedRowHandle?.setExpanded(false);
          rowHandle.setExpanded(expandedCommandId === command.id);
          expandedRowHandle = expandedCommandId ? rowHandle : null;
          if (expandedCommandId) {
            queueMicrotask(() => virtualRows?.ensureVisible(index));
          }
        },
        callbacks.rowCallbacks,
        section.layout === "table",
        index + 1,
        showExampleColumn,
        expandedCommandId === command.id,
        callbacks.selectionActive
          ? {
              active: true,
              selected: selectedCommandIds.has(command.id),
              onToggle: (selected) => {
                selectedCommandIds[selected ? "add" : "delete"](command.id);
                updateSelectionBar();
              },
            }
          : undefined,
        expandedExampleIds.has(command.id),
        showExampleColumn
          ? (expanded) => {
              expandedExampleIds[expanded ? "add" : "delete"](command.id);
              handle.setExampleExpanded(expanded);
            }
          : undefined,
        section.layout === "table" && !callbacks.selectionActive
          ? {
              index,
              count: section.commands.length,
              sectionElement: () => wrapper,
              scrollRoot: callbacks.getScrollRoot,
              onMove: (targetIndex: number) =>
                callbacks.onCommandReorder(section.id, command.id, targetIndex),
            }
          : undefined,
      );
      if (expandedCommandId === command.id) expandedRowHandle = handle;
      return handle.element;
    };

    if (section.commands.length > performanceProfile.virtualThreshold) {
      virtualRows = createVirtualRows({
        count: section.commands.length,
        defaultRowHeight: section.layout === "table" ? 82 : 160,
        renderRow,
        getScrollRoot: callbacks.getScrollRoot,
        overscan: performanceProfile.overscan,
      });
      content.append(virtualRows.element);
    } else {
      const fragment = document.createDocumentFragment();
      section.commands.forEach((_, index) => fragment.append(renderRow(index)));
      content.append(fragment);
    }
  }

  function disposeContent(): void {
    virtualRows?.destroy();
    virtualRows = null;
    content.replaceChildren();
    contentMaterialized = false;
    content.hidden = true;
    content.removeAttribute("inert");
  }

  function deferContent(): void {
    if (contentMaterialized && content.offsetHeight > 0) {
      lastMaterializedHeight = content.offsetHeight;
    }
    virtualRows?.destroy();
    virtualRows = null;
    expandedRowHandle = null;
    contentMaterialized = false;
    content.hidden = !isExpanded;
    content.dataset.deferred = "true";
    if (!isExpanded) {
      content.replaceChildren();
      return;
    }
    const placeholder = element("div", "section-deferred-placeholder");
    const rowHeight = section.layout === "table" ? 82 : 160;
    placeholder.style.height = `${lastMaterializedHeight || 35 + section.commands.length * rowHeight}px`;
    content.replaceChildren(placeholder);
  }

  function installSectionVisibility(): void {
    const root = callbacks.getScrollRoot();
    if (!root) return;
    sectionVisibilityObserver = new IntersectionObserver((entries) => {
      const visible = entries.some((entry) => entry.isIntersecting);
      if (visible && isExpanded && !contentMaterialized) {
        renderContent();
        virtualRows?.reconnect();
      } else if (!visible && isExpanded && contentMaterialized &&
        performanceProfile.mode === "low-power" && !callbacks.selectionActive &&
        expandedCommandId === null && expandedExampleIds.size === 0) {
        deferContent();
      }
    }, { root, rootMargin: "800px 0px" });
    sectionVisibilityObserver.observe(wrapper);
  }

  function cancelSectionAnimation(): void {
    animationGeneration += 1;
    if (animationTimer !== null) {
      window.clearTimeout(animationTimer);
      animationTimer = null;
    }
    if (animationEndHandler) {
      content.removeEventListener("animationend", animationEndHandler);
      animationEndHandler = null;
    }
    content.classList.remove("section-content-opening", "section-content-closing");
    content.style.removeProperty("--section-motion-duration");
    content.removeAttribute("inert");
  }

  function animateSectionContent(
    direction: "opening" | "closing",
    duration: number,
    onComplete: () => void,
  ): void {
    cancelSectionAnimation();
    const generation = ++animationGeneration;
    const className = direction === "opening"
      ? "section-content-opening"
      : "section-content-closing";
    if (direction === "closing") {
      content.setAttribute("inert", "");
    }
    content.style.setProperty("--section-motion-duration", `${duration}ms`);
    content.classList.add(className);
    const finish = (): void => {
      if (generation !== animationGeneration) {
        return;
      }
      if (animationTimer !== null) {
        window.clearTimeout(animationTimer);
        animationTimer = null;
      }
      if (animationEndHandler) {
        content.removeEventListener("animationend", animationEndHandler);
        animationEndHandler = null;
      }
      content.classList.remove(className);
      content.style.removeProperty("--section-motion-duration");
      content.removeAttribute("inert");
      onComplete();
    };
    animationEndHandler = (event) => {
      if (event.target === content) {
        finish();
      }
    };
    content.addEventListener("animationend", animationEndHandler);
    animationTimer = window.setTimeout(finish, duration + 40);
  }

  toggle.addEventListener("click", () => setSectionExpanded(!isExpanded, true));
  wrapper.append(header, content);
  if (initiallyExpanded && callbacks.deferInitialContent) deferContent();
  else renderContent();
  queueMicrotask(installSectionVisibility);

  return {
    element: wrapper,
    ensureCommandVisible(commandId) {
      if (!isExpanded) {
        setSectionExpanded(true, true);
      }
      if (!contentMaterialized) renderContent();
      const index = commandId ? section.commands.findIndex((command) => command.id === commandId) : 0;
      if (index < 0) {
        wrapper.scrollIntoView({ block: "center" });
        return;
      }
      if (virtualRows) {
        virtualRows.ensureVisible(index);
      }
      queueMicrotask(() => {
        const row = wrapper.querySelector<HTMLElement>(`[data-command-id="${CSS.escape(commandId ?? "")}"]`);
        (row ?? wrapper).scrollIntoView({ block: "center" });
      });
    },
    refreshLayout() {
      virtualRows?.reconnect();
    },
    setPerformanceProfile(profile) {
      const virtualizationChanged = profile.virtualThreshold !== performanceProfile.virtualThreshold ||
        profile.overscan !== performanceProfile.overscan;
      performanceProfile = profile;
      let deferred = false;
      if (profile.mode === "low-power") {
        cancelSectionAnimation();
        if (!isExpanded) disposeContent();
        else if (!contentMaterialized) deferred = true;
        else if (contentMaterialized && !callbacks.selectionActive && expandedCommandId === null &&
          expandedExampleIds.size === 0) {
          const root = callbacks.getScrollRoot();
          const rootRect = root?.getBoundingClientRect();
          const sectionRect = wrapper.getBoundingClientRect();
          if (rootRect && (sectionRect.bottom < rootRect.top - 800 || sectionRect.top > rootRect.bottom + 800)) {
            deferContent();
            deferred = true;
          }
        }
      }
      if (virtualizationChanged && isExpanded && !deferred) renderContent();
    },
    dispose() {
      cancelSectionAnimation();
      sectionVisibilityObserver?.disconnect();
      sectionVisibilityObserver = null;
      virtualRows?.destroy();
      virtualRows = null;
    },
  };
}

function createExampleSwitch(checked: boolean): HTMLButtonElement {
  const control = button("section-example-switch", "");
  control.setAttribute("role", "switch");
  control.append(
    element("span", "section-example-switch-label", "EXAMPLES"),
    element("span", "section-example-switch-track"),
  );
  updateExampleSwitch(control, checked);
  return control;
}

function updateExampleSwitch(control: HTMLButtonElement, checked: boolean): void {
  control.classList.toggle("active", checked);
  control.setAttribute("aria-checked", String(checked));
  control.title = checked ? "Hide Example column" : "Show Example column";
  control.setAttribute("aria-label", checked ? "Hide Example column" : "Show Example column");
}

function nextHighlightLevel(level: SectionHighlightLevel | null): SectionHighlightLevel | null {
  if (level === null) return "gold";
  if (level === "gold") return "orange";
  if (level === "orange") return "red";
  return null;
}

function updateSectionHighlight(
  wrapper: HTMLElement,
  control: HTMLButtonElement,
  sectionTitle: string,
  level: SectionHighlightLevel | null,
): void {
  wrapper.classList.toggle("section-highlighted", level !== null);
  wrapper.dataset.highlightLevel = level ?? "none";
  control.dataset.level = level ?? "none";
  control.setAttribute("aria-pressed", String(level !== null));
  const names: Record<SectionHighlightLevel, string> = {
    gold: "Gold H1",
    orange: "Orange H2",
    red: "Red H3",
  };
  const next = nextHighlightLevel(level);
  const currentLabel = level ? names[level] : "Off";
  const nextLabel = next ? names[next] : "Off";
  control.title = `Highlight: ${currentLabel}. Next: ${nextLabel}`;
  control.setAttribute(
    "aria-label",
    `Highlight ${sectionTitle}: ${currentLabel}. Activate for ${nextLabel}.`,
  );
  const badge = control.querySelector<HTMLElement>(".section-highlight-badge");
  if (badge) {
    badge.textContent = level === "gold" ? "H1" : level === "orange" ? "H2" : level === "red" ? "H3" : "";
  }
}

function prefersReducedMotion(): boolean {
  return document.documentElement.dataset.performance === "low-power" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
