mod commands;
mod error;
mod models;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::filesystem::list_directory,
            commands::filesystem::read_command_file,
            commands::filesystem::write_command_file,
            commands::filesystem::create_folder,
            commands::filesystem::create_command_file,
            commands::filesystem::rename_entry,
            commands::filesystem::trash_entry,
            commands::settings::load_settings,
            commands::settings::save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
