export const themeModes = ["dark", "light"] as const;
export type ThemeMode = (typeof themeModes)[number];

export const accentThemes = ["cyan", "blue", "purple", "green", "orange", "pink"] as const;
export type AccentTheme = (typeof accentThemes)[number];

export interface AppSettings {
  lastWorkspace: string | null;
  lastOpenedFile: string | null;
  uiFontSize: number;
  codeFontSize: number;
  uiScale: number;
  themeMode: ThemeMode;
  accentTheme: AccentTheme;
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
