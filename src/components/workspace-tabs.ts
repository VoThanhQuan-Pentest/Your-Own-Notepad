import { playPneumaticHiss, playTacticalBlip } from "../services/audio";
import { createVariablePill } from "./variable-injector-modal";

export function commandFileLabel(path: string): string {
  const separator = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return path.slice(separator + 1).replace(/\.cmdnote$/i, "");
}

export interface WorkspaceTabOptions {
  openTabs: string[];
  activePath: string | null;
  isDashboard: boolean;
  onSelectDashboard: () => void;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onOpenVariableModal: () => void;
}

export interface WorkspaceTabsHandle {
  element: HTMLElement;
  update: (options: Partial<WorkspaceTabOptions>) => void;
  scrollToActive: () => void;
}

export function createWorkspaceTabs(initialOptions: WorkspaceTabOptions): WorkspaceTabsHandle {
  let options = { ...initialOptions };

  const bar = document.createElement("header");
  bar.className = "workspace-tab-bar";
  bar.setAttribute("role", "tablist");
  bar.setAttribute("aria-label", "Open Workspace Tabs");

  const scrollContainer = document.createElement("div");
  scrollContainer.className = "workspace-tabs-scroll";

  const actions = document.createElement("div");
  actions.className = "workspace-tab-actions";

  const varPill = createVariablePill(() => {
    options.onOpenVariableModal();
  });
  actions.append(varPill);

  bar.append(scrollContainer, actions);

  const renderTabs = () => {
    scrollContainer.replaceChildren();

    // 1. Dashboard Tab
    const dashTab = document.createElement("button");
    dashTab.type = "button";
    dashTab.className = `workspace-tab-item tab-item-dashboard ${options.isDashboard ? "active" : ""}`;
    dashTab.setAttribute("role", "tab");
    dashTab.setAttribute("aria-selected", options.isDashboard ? "true" : "false");
    dashTab.title = "Welcome Dashboard (Ctrl+0)";

    const dashIcon = document.createElement("span");
    dashIcon.className = "tab-icon";
    dashIcon.textContent = "🏠";

    const dashTitle = document.createElement("span");
    dashTitle.className = "tab-title";
    dashTitle.textContent = "DASHBOARD";

    dashTab.append(dashIcon, dashTitle);
    dashTab.addEventListener("click", () => {
      if (!options.isDashboard) {
        playTacticalBlip();
        options.onSelectDashboard();
      }
    });
    scrollContainer.append(dashTab);

    // Separator if we have file tabs
    if (options.openTabs.length > 0) {
      const sep = document.createElement("span");
      sep.className = "workspace-tab-separator";
      scrollContainer.append(sep);
    }

    // 2. Open File Tabs
    options.openTabs.forEach((path) => {
      const isActive = !options.isDashboard && options.activePath === path;

      const tab = document.createElement("div");
      tab.className = `workspace-tab-item ${isActive ? "active" : ""}`;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
      tab.setAttribute("data-path", path);
      tab.title = path;

      const led = document.createElement("span");
      led.className = "tab-led";

      const icon = document.createElement("span");
      icon.className = "tab-icon";
      icon.textContent = "⚡";

      const title = document.createElement("span");
      title.className = "tab-title";
      title.textContent = commandFileLabel(path);

      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "tab-close-btn";
      closeBtn.textContent = "×";
      closeBtn.title = "Close Tab (Ctrl+W)";
      closeBtn.setAttribute("aria-label", `Close ${commandFileLabel(path)}`);

      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        playPneumaticHiss(false);
        options.onCloseTab(path);
      });

      tab.append(led, icon, title, closeBtn);

      tab.addEventListener("click", () => {
        if (!isActive) {
          playTacticalBlip();
          options.onSelectTab(path);
        }
      });

      // Middle click closes tab
      tab.addEventListener("auxclick", (e) => {
        if (e.button === 1) {
          e.preventDefault();
          e.stopPropagation();
          playPneumaticHiss(false);
          options.onCloseTab(path);
        }
      });

      scrollContainer.append(tab);
    });
  };

  const scrollToActive = () => {
    const active = scrollContainer.querySelector<HTMLElement>(".workspace-tab-item.active");
    if (active) {
      active.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
  };

  renderTabs();

  return {
    element: bar,
    update: (next) => {
      options = { ...options, ...next };
      renderTabs();
    },
    scrollToActive,
  };
}
