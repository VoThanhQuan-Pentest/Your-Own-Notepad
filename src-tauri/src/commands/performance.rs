use std::process::Command;

#[tauri::command]
pub(crate) async fn get_power_profile() -> Option<String> {
    tauri::async_runtime::spawn_blocking(|| {
        let output = Command::new("powerprofilesctl").arg("get").output().ok()?;
        if !output.status.success() {
            return None;
        }
        let profile = String::from_utf8(output.stdout)
            .ok()?
            .trim()
            .to_ascii_lowercase();
        (!profile.is_empty()).then_some(profile)
    })
    .await
    .ok()
    .flatten()
}
