import { invoke } from "@tauri-apps/api/core";

import {
  defaultCustomThemes,
  defaultSettings,
  isAccentTheme,
  favoriteKey,
  isFavoriteItem,
  isHexColor,
  isPerformanceMode,
  isSectionHighlight,
  sectionHighlightKey,
  isThemeMode,
  type AppSettings,
} from "../models/settings";
import { isTauriRuntime } from "./runtime";

const DEVELOPMENT_STORAGE_KEY = "command-vault.settings";

export async function loadSettings(): Promise<AppSettings> {
  if (isTauriRuntime()) {
    return normalizeSettings(await invoke<AppSettings>("load_settings"));
  }

  const source = localStorage.getItem(DEVELOPMENT_STORAGE_KEY);
  if (!source) {
    return structuredClone(defaultSettings);
  }
  try {
    return normalizeSettings(JSON.parse(source) as Partial<AppSettings>);
  } catch {
    return structuredClone(defaultSettings);
  }
}

export function normalizeSettings(value: Partial<AppSettings>): AppSettings {
  const favorites = Array.isArray(value.favorites)
    ? uniqueBy(value.favorites.filter(isFavoriteItem), favoriteKey).slice(0, 50)
    : [];
  const sectionHighlights = Array.isArray(value.sectionHighlights)
    ? uniqueBy(value.sectionHighlights.filter(isSectionHighlight), sectionHighlightKey).slice(0, 1_000)
    : [];
  return {
    displayName: normalizeDisplayName(value.displayName),
    lastWorkspace: typeof value.lastWorkspace === "string" ? value.lastWorkspace : null,
    lastOpenedFile: typeof value.lastOpenedFile === "string" ? value.lastOpenedFile : null,
    uiFontSize: typeof value.uiFontSize === "number" ? value.uiFontSize : defaultSettings.uiFontSize,
    codeFontSize: typeof value.codeFontSize === "number" ? value.codeFontSize : defaultSettings.codeFontSize,
    uiScale: typeof value.uiScale === "number" ? value.uiScale : defaultSettings.uiScale,
    themeMode: isThemeMode(value.themeMode) ? value.themeMode : defaultSettings.themeMode,
    accentTheme: isAccentTheme(value.accentTheme) ? value.accentTheme : defaultSettings.accentTheme,
    customThemes: normalizeCustomThemes(value.customThemes),
    performanceMode: isPerformanceMode(value.performanceMode)
      ? value.performanceMode
      : defaultSettings.performanceMode,
    favorites,
    sectionHighlights,
    rememberExpandedSections:
      typeof value.rememberExpandedSections === "boolean"
        ? value.rememberExpandedSections
        : defaultSettings.rememberExpandedSections,
    expandedSections: Array.isArray(value.expandedSections) ? value.expandedSections : [],
    sectionStateFiles: Array.isArray(value.sectionStateFiles) ? value.sectionStateFiles : [],
    windowWidth: typeof value.windowWidth === "number" ? value.windowWidth : null,
    windowHeight: typeof value.windowHeight === "number" ? value.windowHeight : null,
  };
}

export function normalizeDisplayName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length >= 1 && [...normalized].length <= 32 ? normalized : null;
}

function normalizeCustomThemes(value: Partial<AppSettings>["customThemes"]): AppSettings["customThemes"] {
  return {
    dark: normalizeCustomTheme(value?.dark, defaultCustomThemes.dark),
    light: normalizeCustomTheme(value?.light, defaultCustomThemes.light),
  };
}

function normalizeCustomTheme(
  value: Partial<AppSettings["customThemes"]["dark"]> | undefined,
  fallback: AppSettings["customThemes"]["dark"],
): AppSettings["customThemes"]["dark"] {
  return {
    enabled: typeof value?.enabled === "boolean" ? value.enabled : fallback.enabled,
    background: isHexColor(value?.background) ? value.background.toLowerCase() : fallback.background,
    text: isHexColor(value?.text) ? value.text.toLowerCase() : fallback.text,
    accent: isHexColor(value?.accent) ? value.accent.toLowerCase() : fallback.accent,
  };
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  if (isTauriRuntime()) {
    await invoke("save_settings", { settings });
    return;
  }
  localStorage.setItem(DEVELOPMENT_STORAGE_KEY, JSON.stringify(settings));
}
