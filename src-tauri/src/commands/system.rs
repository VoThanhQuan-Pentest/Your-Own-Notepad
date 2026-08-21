use std::io;
use std::process::Command;

use serde::Serialize;

use crate::error::{CommandError, CommandResult};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LaunchResult {
    program: String,
}

#[tauri::command]
pub(crate) async fn open_external(target: String) -> CommandResult<LaunchResult> {
    if target.trim().is_empty() {
        return Err(CommandError::new(
            "INVALID_TARGET",
            "The open target is empty.",
        ));
    }

    launch_and_wait("xdg-open", &[target.as_str()]).map(|_| LaunchResult {
        program: "xdg-open".to_string(),
    })
}

#[tauri::command]
pub(crate) async fn open_terminal(command: String) -> CommandResult<LaunchResult> {
    if command.trim().is_empty() {
        return Err(CommandError::new("EMPTY_COMMAND", "The command is empty."));
    }

    let script = format!(
        "{command}\nprintf '\\n[Command Vault] Press Enter to close...'\nread -r _command_vault_done"
    );
    let candidates: [(&str, &[&str]); 3] = [
        ("kgx", &["--", "bash", "-lc", script.as_str()]),
        ("gnome-terminal", &["--", "bash", "-lc", script.as_str()]),
        (
            "x-terminal-emulator",
            &["-e", "bash", "-lc", script.as_str()],
        ),
    ];

    let mut last_error: Option<io::Error> = None;
    for (program, args) in candidates {
        match Command::new(program).args(args).spawn() {
            Ok(mut child) => {
                let _wait_task = tauri::async_runtime::spawn_blocking(move || {
                    let _ = child.wait();
                });
                return Ok(LaunchResult {
                    program: program.to_string(),
                });
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                last_error = Some(error);
            }
            Err(error) => {
                return Err(CommandError::new(
                    "TERMINAL_LAUNCH_FAILED",
                    format!("Could not launch {program}: {error}"),
                ));
            }
        }
    }

    let detail = last_error
        .map(|error| error.to_string())
        .unwrap_or_else(|| "No terminal candidate was available.".to_string());
    Err(CommandError::new(
        "TERMINAL_NOT_AVAILABLE",
        format!("No supported system terminal was found: {detail}"),
    ))
}

fn launch_and_wait(program: &str, args: &[&str]) -> CommandResult<()> {
    let output = Command::new(program).args(args).output().map_err(|error| {
        let code = if error.kind() == io::ErrorKind::NotFound {
            "EXECUTABLE_NOT_FOUND"
        } else {
            "LAUNCH_FAILED"
        };
        CommandError::new(code, format!("Could not launch {program}: {error}"))
    })?;
    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    let detail = stderr.trim();
    let detail = if detail.chars().count() > 500 {
        format!("{}…", detail.chars().take(500).collect::<String>())
    } else {
        detail.to_string()
    };
    Err(CommandError::new(
        "LAUNCH_FAILED",
        if detail.is_empty() {
            format!("{program} exited with status {}.", output.status)
        } else {
            format!("{program} could not open the target: {detail}")
        },
    ))
}
