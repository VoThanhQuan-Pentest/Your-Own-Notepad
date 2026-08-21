use std::fs;
use std::path::PathBuf;

use tauri::Manager;

use crate::commands::filesystem::atomic_write;
use crate::error::{CommandError, CommandResult};
use crate::models::settings::AppSettings;

const SETTINGS_FILE: &str = "settings.json";

#[tauri::command]
pub(crate) async fn load_settings(app: tauri::AppHandle) -> CommandResult<AppSettings> {
    let path = settings_path(&app)?;
    if !path.exists() {
        return Ok(AppSettings::default());
    }

    let source = fs::read_to_string(&path)
        .map_err(|error| CommandError::from_io(error, "Could not read settings"))?;
    let settings: AppSettings = serde_json::from_str(&source).map_err(|error| {
        CommandError::new(
            "INVALID_SETTINGS",
            format!("The settings file is invalid and was preserved: {error}"),
        )
    })?;
    settings
        .validate()
        .map_err(|message| CommandError::new("INVALID_SETTINGS", message))?;
    Ok(settings)
}

#[tauri::command]
pub(crate) async fn save_settings(
    app: tauri::AppHandle,
    settings: AppSettings,
) -> CommandResult<()> {
    settings
        .validate()
        .map_err(|message| CommandError::new("INVALID_SETTINGS", message))?;
    let path = settings_path(&app)?;
    let parent = path
        .parent()
        .ok_or_else(|| CommandError::new("INVALID_PATH", "Settings path has no parent."))?;
    fs::create_dir_all(parent)
        .map_err(|error| CommandError::from_io(error, "Could not create settings folder"))?;
    let source = serde_json::to_string_pretty(&settings).map_err(|error| {
        CommandError::new(
            "SERIALIZATION_FAILED",
            format!("Could not serialize settings: {error}"),
        )
    })?;
    atomic_write(&path, format!("{source}\n").as_bytes())
}

fn settings_path(app: &tauri::AppHandle) -> CommandResult<PathBuf> {
    app.path()
        .app_config_dir()
        .map(|directory| directory.join(SETTINGS_FILE))
        .map_err(|error| {
            CommandError::new(
                "CONFIG_PATH_UNAVAILABLE",
                format!("Could not resolve the app config folder: {error}"),
            )
        })
}
