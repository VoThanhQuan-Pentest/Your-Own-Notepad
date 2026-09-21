import { button, element } from "../utils/dom";
import { createIcon } from "./icons";

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
  reactor.append(
    element("div", "reactor-ring ring-outer"),
    element("div", "reactor-ring ring-mid"),
    element("div", "reactor-ring ring-inner"),
    element("div", "reactor-plasma-core"),
  );
  hero.append(heroLeft, reactor);


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
  dashboard.append(hero, grid);
  return dashboard;
}

export function greetingForHour(hour: number): string {
  if (hour >= 5 && hour <= 11) return "Good morning";
  if (hour >= 12 && hour <= 17) return "Good afternoon";
  return "Good evening";
}
