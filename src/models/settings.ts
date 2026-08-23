export const themeModes = ["dark", "light"] as const;
export type ThemeMode = (typeof themeModes)[number];

export const accentThemes = ["cyan", "blue", "purple", "green", "orange", "pink"] as const;
export type AccentTheme = (typeof accentThemes)[number];

export type FavoriteItem =
  | { kind: "file"; path: string }
  | { kind: "command"; filePath: string; commandId: string };

export interface AppSettings {
  lastWorkspace: string | null;
  lastOpenedFile: string | null;
  uiFontSize: number;
  codeFontSize: number;
  uiScale: number;
  themeMode: ThemeMode;
  accentTheme: AccentTheme;
  favorites: FavoriteItem[];
  recentFiles: string[];
  rememberExpandedSections: boolean;
  expandedSections: string[];
  sectionStateFiles: string[];
  windowWidth: number | null;
  windowHeight: number | null;
}

export const defaultSettings: AppSettings = {
  lastWorkspace: null,
  lastOpenedFile: null,
  uiFontSize: 14,
  codeFontSize: 13,
  uiScale: 100,
  themeMode: "dark",
  accentTheme: "cyan",
  favorites: [],
  recentFiles: [],
  rememberExpandedSections: true,
  expandedSections: [],
  sectionStateFiles: [],
  windowWidth: null,
  windowHeight: null,
};

export function isThemeMode(value: unknown): value is ThemeMode {
  return themeModes.includes(value as ThemeMode);
}

export function isAccentTheme(value: unknown): value is AccentTheme {
  return accentThemes.includes(value as AccentTheme);
}

export function isFavoriteItem(value: unknown): value is FavoriteItem {
  if (!value || typeof value !== "object") {
    return false;
  }
  const item = value as Partial<FavoriteItem>;
  return item.kind === "file"
    ? typeof item.path === "string" && item.path.length > 0
    : item.kind === "command" &&
        typeof item.filePath === "string" &&
        item.filePath.length > 0 &&
        typeof item.commandId === "string" &&
        item.commandId.length > 0;
}

export function favoriteKey(item: FavoriteItem): string {
  return item.kind === "file"
    ? `file:${item.path}`
    : `command:${item.filePath}:${item.commandId}`;
}
