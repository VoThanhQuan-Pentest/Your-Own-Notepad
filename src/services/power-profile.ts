import { invoke } from "@tauri-apps/api/core";

import { isTauriRuntime } from "./runtime";

export async function getPowerProfile(): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  try {
    return await invoke<string | null>("get_power_profile");
  } catch {
    return null;
  }
}
