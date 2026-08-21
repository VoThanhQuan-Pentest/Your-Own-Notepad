import { invoke } from "@tauri-apps/api/core";

import { defaultSettings, type AppSettings } from "../models/settings";
import { isTauriRuntime } from "./runtime";

const DEVELOPMENT_STORAGE_KEY = "command-vault.settings";

export async function loadSettings(): Promise<AppSettings> {
  if (isTauriRuntime()) {
    return invoke("load_settings");
  }

  const source = localStorage.getItem(DEVELOPMENT_STORAGE_KEY);
  if (!source) {
    return structuredClone(defaultSettings);
  }
  try {
    return { ...defaultSettings, ...(JSON.parse(source) as Partial<AppSettings>) };
  } catch {
    return structuredClone(defaultSettings);
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  if (isTauriRuntime()) {
    await invoke("save_settings", { settings });
    return;
  }
  localStorage.setItem(DEVELOPMENT_STORAGE_KEY, JSON.stringify(settings));
}
