export const themeModes = ["dark", "light"] as const;
export type ThemeMode = (typeof themeModes)[number];

export const accentThemes = ["cyan", "blue", "purple", "green", "orange", "pink"] as const;
export type AccentTheme = (typeof accentThemes)[number];

export interface CustomThemeColors {
  enabled: boolean;
  background: string;
  text: string;
  accent: string;
}

export interface CustomThemes {
  dark: CustomThemeColors;
  light: CustomThemeColors;
}

export const defaultCustomThemes: CustomThemes = {
  dark: { enabled: false, background: "#0d1117", text: "#d8dee9", accent: "#00c8e8" },
  light: { enabled: false, background: "#f5f7fa", text: "#1f2937", accent: "#087f9a" },
};

export type FavoriteItem =
  | { kind: "folder"; path: string }
  | { kind: "file"; path: string }
  | { kind: "command"; filePath: string; commandId: string };

export const sectionHighlightLevels = ["gold", "orange", "red"] as const;
export type SectionHighlightLevel = (typeof sectionHighlightLevels)[number];

export interface SectionHighlight {
  filePath: string;
  sectionId: string;
  level: SectionHighlightLevel;
}

export interface AppSettings {
  displayName: string | null;
  lastWorkspace: string | null;
  lastOpenedFile: string | null;
  uiFontSize: number;
  codeFontSize: number;
  uiScale: number;
  themeMode: ThemeMode;
  accentTheme: AccentTheme;
  customThemes: CustomThemes;
  favorites: FavoriteItem[];
  sectionHighlights: SectionHighlight[];
  rememberExpandedSections: boolean;
  expandedSections: string[];
  sectionStateFiles: string[];
  windowWidth: number | null;
  windowHeight: number | null;
}

export const defaultSettings: AppSettings = {
  displayName: null,
  lastWorkspace: null,
  lastOpenedFile: null,
  uiFontSize: 14,
  codeFontSize: 13,
  uiScale: 100,
  themeMode: "dark",
  accentTheme: "cyan",
  customThemes: structuredClone(defaultCustomThemes),
  favorites: [],
  sectionHighlights: [],
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

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

export function isFavoriteItem(value: unknown): value is FavoriteItem {
  if (!value || typeof value !== "object") {
    return false;
  }
  const item = value as Partial<FavoriteItem>;
  return item.kind === "file" || item.kind === "folder"
    ? typeof item.path === "string" && item.path.length > 0
    : item.kind === "command" &&
        typeof item.filePath === "string" &&
        item.filePath.length > 0 &&
        typeof item.commandId === "string" &&
        item.commandId.length > 0;
}

export function favoriteKey(item: FavoriteItem): string {
  return item.kind !== "command"
    ? `${item.kind}:${item.path}`
    : `command:${item.filePath}:${item.commandId}`;
}

export function isSectionHighlight(value: unknown): value is SectionHighlight {
  if (!value || typeof value !== "object") {
    return false;
  }
  const item = value as Partial<SectionHighlight>;
  return typeof item.filePath === "string" && item.filePath.length > 0 &&
    typeof item.sectionId === "string" && item.sectionId.length > 0 &&
    sectionHighlightLevels.includes(item.level as SectionHighlightLevel);
}

export function sectionHighlightKey(item: Pick<SectionHighlight, "filePath" | "sectionId">): string {
  return `${item.filePath}::${item.sectionId}`;
}
