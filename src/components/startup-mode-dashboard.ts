import type { StartupPerformanceMode } from "../models/settings";
import { button, element } from "../utils/dom";

export interface StartupModeDashboardOptions {
  displayName?: string | null;
  lastMode?: StartupPerformanceMode | null;
  interruptedStartup?: boolean;
  onSelect(mode: StartupPerformanceMode): void;
}

export function createStartupModeDashboard(options: StartupModeDashboardOptions): HTMLElement {
  const dashboard = element("section", "startup-dashboard");
  const panel = element("div", "startup-dashboard-panel");

  // Header / Brand
  const brand = element("div", "startup-brand");
  const mark = element("span", "brand-mark");
  const brandTitle = element("span", "startup-brand-title", "COMMAND VAULT");
  brand.append(mark, brandTitle);

  const hero = element("header", "startup-hero");
  const title = element(
    "h1",
    "startup-title",
    options.interruptedStartup
      ? "Previous startup did not finish normally."
      : "Choose how Command Vault should run.",
  );
  const subtitle = element(
    "p",
    "startup-subtitle",
    options.interruptedStartup
      ? "Battery Saver is recommended for this launch to ensure responsive and safe recovery."
      : "Select a startup performance profile to balance responsiveness and power efficiency.",
  );
  hero.append(title, subtitle);

  panel.append(brand, hero);

  if (options.interruptedStartup) {
    const warning = element("div", "startup-warning-banner");
    warning.setAttribute("role", "alert");
    const warningIcon = element("span", "startup-warning-icon", "⚠");
    const warningText = element("div", "startup-warning-copy");
    warningText.append(
      element("strong", undefined, "Interrupted startup detected"),
      element(
        "p",
        undefined,
        "Command Vault did not complete workspace initialization on the previous launch.",
      ),
    );
    warning.append(warningIcon, warningText);
    panel.append(warning);
  }

  // Cards grid
  const cards = element("div", "startup-cards");

  // Card 1: Battery Saver
  const batteryCard = element("div", "startup-card startup-card-battery");
  const batteryBadge = element("span", "startup-card-badge", "EFFICIENCY");
  const batteryTitle = element("h2", undefined, "BATTERY SAVER");
  const batteryList = element("ul", "startup-card-features");
  [
    "Lower CPU/GPU usage",
    "Reduced animations",
    "Conservative indexing",
    "Best for battery use",
  ].forEach((text) => {
    batteryList.append(element("li", undefined, text));
  });

  const batteryButton = button(
    "primary-button startup-mode-action startup-battery-action",
    "START BATTERY SAVER",
  );
  batteryButton.id = "startup-battery-saver";
  batteryButton.setAttribute("aria-label", "Start Command Vault in Battery Saver mode");
  batteryCard.append(batteryBadge, batteryTitle, batteryList, batteryButton);

  // Card 2: Performance
  const perfCard = element("div", "startup-card startup-card-performance");
  const perfBadge = element("span", "startup-card-badge", "HIGH SPEED");
  const perfTitle = element("h2", undefined, "PERFORMANCE");
  const perfList = element("ul", "startup-card-features");
  [
    "Maximum responsiveness",
    "Faster indexing",
    "Full interface effects",
    "Best while plugged in",
  ].forEach((text) => {
    perfList.append(element("li", undefined, text));
  });

  const perfButton = button(
    "primary-button startup-mode-action startup-performance-action",
    options.interruptedStartup ? "CONTINUE WITH PERFORMANCE" : "START PERFORMANCE",
  );
  perfButton.id = "startup-performance";
  perfButton.setAttribute("aria-label", "Start Command Vault in Performance mode");
  perfCard.append(perfBadge, perfTitle, perfList, perfButton);

  cards.append(batteryCard, perfCard);
  panel.append(cards);

  // Status message container
  const statusContainer = element("div", "startup-status-container");
  panel.append(statusContainer);

  // Footer: Last used
  if (options.lastMode) {
    const lastUsed = element("div", "startup-last-used");
    lastUsed.append(
      document.createTextNode("Last used: "),
      element(
        "strong",
        undefined,
        options.lastMode === "battery-saver" ? "Battery Saver" : "Performance",
      ),
    );
    panel.append(lastUsed);
  }

  dashboard.append(panel);

  // Single-selection guard and handling
  let selected = false;
  const selectMode = (mode: StartupPerformanceMode): void => {
    if (selected) return;
    selected = true;
    batteryButton.disabled = true;
    perfButton.disabled = true;
    batteryCard.classList.toggle("selected", mode === "battery-saver");
    perfCard.classList.toggle("selected", mode === "performance");

    const status = element("div", "startup-loading-status");
    const spinner = element("span", "startup-loading-spinner");
    const statusText = element(
      "span",
      undefined,
      mode === "battery-saver"
        ? "Preparing Command Vault in Battery Saver mode…"
        : "Preparing Command Vault in Performance mode…",
    );
    status.append(spinner, statusText);
    statusContainer.replaceChildren(status);

    options.onSelect(mode);
  };

  batteryButton.addEventListener("click", () => selectMode("battery-saver"));
  perfButton.addEventListener("click", () => selectMode("performance"));

  // Initial focus management
  const setInitialFocus = (): void => {
    if (!dashboard.isConnected) return;
    if (options.interruptedStartup || options.lastMode !== "performance") {
      batteryButton.focus();
    } else {
      perfButton.focus();
    }
  };
  window.requestAnimationFrame(setInitialFocus);
  window.setTimeout(setInitialFocus, 0);

  return dashboard;
}
