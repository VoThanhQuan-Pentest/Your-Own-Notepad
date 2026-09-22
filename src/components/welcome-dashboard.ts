import { playReactorOverload, playTacticalTargetLock } from "../services/audio";
import { createCyberGlobe } from "../utils/cyber-globe";
import { button, element } from "../utils/dom";
import { triggerSparkBurst, triggerHexShockwave } from "../utils/particles";
import { createTacticalRadar } from "../utils/tactical-radar";
import { createIcon } from "./icons";
import { createPayloadGenerator } from "./payload-generator";

export interface DashboardFavorite {
  label: string;
  detail: string;
  onOpen(): void;
}

interface WelcomeDashboardOptions {
  displayName: string;
  workspaceRoot: string | null;
  continueLabel: string | null;
  counts: { folders: number; files: number; sections: number; commands: number };
  favorites: DashboardFavorite[];
  loading?: boolean;
  onContinue(): void;
  onOpenWorkspace(): void;
  onCreateFile(): void;
  onSearchQuery?: (query: string) => void;
}

export function createWelcomeDashboard(options: WelcomeDashboardOptions): HTMLElement {
  const dashboard = element("section", "welcome-dashboard");
  const hero = element("header", "welcome-hero");
  const eyebrow = element("p", "welcome-eyebrow", "LOCAL COMMAND WORKSPACE");
  const title = element("h1", undefined, `${greetingForHour(new Date().getHours())}, ${options.displayName}`);
  const subtitle = element(
    "p",
    "welcome-subtitle",
    options.loading
      ? "Indexing your local vault…"
      : "Your command library is ready when you are.",
  );
  const heroLeft = element("div", "welcome-hero-text");
  heroLeft.append(eyebrow, title, subtitle);

  const reactor = element("div", "quantum-core-reactor");
  reactor.setAttribute("aria-hidden", "true");
  reactor.setAttribute("title", "Quantum Core Reactor - Click to Overcharge");
  reactor.append(
    element("div", "reactor-ring ring-outer"),
    element("div", "reactor-ring ring-mid"),
    element("div", "reactor-ring ring-inner"),
    element("div", "reactor-plasma-core"),
  );

  reactor.addEventListener("click", () => {
    if (reactor.classList.contains("overcharged")) return;
    reactor.classList.add("overcharged");
    playReactorOverload();
    const rect = reactor.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    triggerSparkBurst(cx, cy);
    triggerHexShockwave(cx, cy);
    window.setTimeout(() => triggerSparkBurst(cx - 20, cy + 12), 120);
    window.setTimeout(() => triggerSparkBurst(cx + 20, cy - 12), 240);
    window.setTimeout(() => {
      reactor.classList.remove("overcharged");
    }, 1800);
  });

  const globe = createCyberGlobe(100, 100);
  const heroVisuals = element("div", "welcome-hero-visuals");
  heroVisuals.append(globe.element, reactor);

  hero.append(heroLeft, heroVisuals);

  // Tactical Pentest Mission Control Section
  const tacticalCenter = element("section", "welcome-tactical-center");
  const tacticalHeader = element("div", "tactical-center-header");
  const tacticalTitle = element("span", "tactical-title", "// PENTEST TARGET RECON & RADAR TELEMETRY");

  tacticalHeader.append(tacticalTitle);

  const tacticalBody = element("div", "tactical-center-body");

  const targets = [
    { id: "t1", name: "ALPHA-GATEWAY", ip: "192.168.1.1", port: "443/HTTPS", angle: 0.5, distance: 0.72, status: "vulnerable" as const, search: "nmap" },
    { id: "t2", name: "BETA-DOMAIN-CTRL", ip: "10.0.4.20", port: "88/389 LDAP", angle: 2.1, distance: 0.55, status: "scanned" as const, search: "ssh" },
    { id: "t3", name: "GAMMA-DATABASE", ip: "172.16.0.8", port: "5432 PGSQL", angle: 3.8, distance: 0.84, status: "exploitable" as const, search: "sqlmap" },
    { id: "t4", name: "DELTA-API-GW", ip: "10.0.12.90", port: "8080 REST", angle: 5.2, distance: 0.42, status: "hardened" as const, search: "curl" },
  ];

  const radar = createTacticalRadar(160, targets, (target) => {
    playTacticalTargetLock();
    if (target.search) options.onSearchQuery?.(target.search);
  });

  const radarBox = element("div", "tactical-radar-box");
  const radarLabel = element("span", "tactical-radar-label", "RADAR PING // 360° SWEEP");
  radarBox.append(radar.element, radarLabel);

  const targetsGrid = element("div", "tactical-targets-grid");
  targets.forEach((t) => {
    const card = element("div", "tactical-target-card");
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("title", `Click to quick-search ${t.search} commands`);

    const headerRow = element("div", "target-header-row");
    const nameEl = element("strong", "target-name", t.name);
    const badgeEl = element("span", `target-badge ${t.status}`, t.status.toUpperCase());
    headerRow.append(nameEl, badgeEl);

    const ipRow = element("div", "target-meta-row");
    ipRow.append(
      element("code", "target-ip", t.ip),
      element("span", "target-port", t.port),
    );

    const actionRow = element("div", "target-action-row");
    const actionBtn = element("span", "target-action-tag", `RECON // ${t.search.toUpperCase()}`);
    actionRow.append(actionBtn);

    card.append(headerRow, ipRow, actionRow);

    const triggerSelect = () => {
      radar.pulseTarget(t.id);
      playTacticalTargetLock();
      const rect = card.getBoundingClientRect();
      triggerSparkBurst(rect.left + rect.width / 2, rect.top + rect.height / 2);
      options.onSearchQuery?.(t.search);
    };

    card.addEventListener("click", triggerSelect);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        triggerSelect();
      }
    });

    targetsGrid.append(card);
  });

  tacticalBody.append(radarBox, targetsGrid);
  const payloadGen = createPayloadGenerator();
  tacticalCenter.append(tacticalHeader, tacticalBody, payloadGen);

  // Cleanup radar on detachment
  const observer = new MutationObserver(() => {
    if (!dashboard.isConnected) {
      radar.destroy();
      observer.disconnect();
    }
  });
  if (typeof document !== "undefined" && document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }

  const grid = element("div", "dashboard-grid");
  const continueCard = element("section", "dashboard-card dashboard-continue");
  continueCard.append(
    element("span", "dashboard-card-label", "CONTINUE"),
    element("h2", undefined, options.continueLabel ?? "No previous file"),
    element(
      "p",
      undefined,
      options.continueLabel ? "Resume the last command file you were using." : "Choose a file from Explorer to begin.",
    ),
  );
  const continueButton = button("primary-button dashboard-action", options.continueLabel ? "OPEN FILE" : "BROWSE VAULT");
  continueButton.addEventListener("click", options.onContinue);
  continueCard.append(continueButton);

  const stats = element("section", "dashboard-card dashboard-stats");
  stats.append(element("span", "dashboard-card-label", "VAULT OVERVIEW"));
  const statGrid = element("div", "dashboard-stat-grid");
  ([
    ["FOLDERS", options.counts.folders],
    ["FILES", options.counts.files],
    ["SECTIONS", options.counts.sections],
    ["COMMANDS", options.counts.commands],
  ] as const).forEach(([label, value]) => {
    const stat = element("div", "dashboard-stat");
    stat.append(element("strong", undefined, options.loading ? "—" : String(value)), element("span", undefined, label));
    statGrid.append(stat);
  });
  stats.append(statGrid);

  const workspace = element("section", "dashboard-card dashboard-workspace");
  workspace.append(
    element("span", "dashboard-card-label", "WORKSPACE"),
    element("h2", undefined, options.workspaceRoot ? "Connected locally" : "No workspace selected"),
    element("code", "dashboard-workspace-path", options.workspaceRoot ?? "Choose a local folder for your vault."),
  );
  const workspaceAction = button("secondary-button dashboard-action", options.workspaceRoot ? "+ NEW COMMAND FILE" : "OPEN WORKSPACE");
  workspaceAction.addEventListener("click", options.workspaceRoot ? options.onCreateFile : options.onOpenWorkspace);
  workspace.append(workspaceAction);

  const favorites = element("section", "dashboard-card dashboard-favorites");
  const favoriteLabel = element("span", "dashboard-card-label dashboard-favorite-label");
  favoriteLabel.append(createIcon("heart"), document.createTextNode("FAVORITES"));
  favorites.append(favoriteLabel);
  if (options.favorites.length === 0) {
    favorites.append(element("p", "dashboard-empty", "Favorite folders, files and commands will appear here."));
  } else {
    const list = element("div", "dashboard-favorite-list");
    options.favorites.slice(0, 6).forEach((favorite) => {
      const item = button("dashboard-favorite", "");
      item.title = favorite.detail;
      const copy = element("span", "dashboard-favorite-copy");
      copy.append(element("strong", undefined, favorite.label), element("span", undefined, favorite.detail));
      item.append(createIcon("heart", "dashboard-favorite-icon"), copy);
      item.addEventListener("click", favorite.onOpen);
      list.append(item);
    });
    favorites.append(list);
  }

  grid.append(continueCard, stats, workspace, favorites);
  dashboard.append(hero, tacticalCenter, grid);
  return dashboard;
}

export function greetingForHour(hour: number): string {
  if (hour >= 5 && hour <= 11) return "Good morning";
  if (hour >= 12 && hour <= 17) return "Good afternoon";
  return "Good evening";
}
