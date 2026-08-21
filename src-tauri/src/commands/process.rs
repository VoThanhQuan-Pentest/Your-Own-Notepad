use std::process::Command;

use serde::Serialize;

use crate::error::{CommandError, CommandResult};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExecutionResult {
    pid: u32,
    program: String,
    args: Vec<String>,
}

#[tauri::command]
pub(crate) async fn execute_program(command: String) -> CommandResult<ExecutionResult> {
    let parts = parse_structured_command(&command)?;
    if requires_shell(&parts) {
        return Err(CommandError::new(
            "SHELL_SYNTAX_UNSUPPORTED",
            "Direct Run does not invoke shell interpreters or process environment assignments. Use Open Terminal.",
        ));
    }
    let program = parts
        .first()
        .cloned()
        .ok_or_else(|| CommandError::new("EMPTY_COMMAND", "The command is empty."))?;

    if is_elevation_program(&program) {
        return Err(CommandError::new(
            "TERMINAL_REQUIRED",
            "Elevated commands must be opened in the system terminal.",
        ));
    }

    let args = parts.into_iter().skip(1).collect::<Vec<_>>();
    let mut child = Command::new(&program)
        .args(&args)
        .spawn()
        .map_err(|error| {
            let code = if error.kind() == std::io::ErrorKind::NotFound {
                "EXECUTABLE_NOT_FOUND"
            } else {
                "COMMAND_LAUNCH_FAILED"
            };
            CommandError::new(code, format!("Could not launch {program}: {error}"))
        })?;

    let pid = child.id();
    let _wait_task = tauri::async_runtime::spawn_blocking(move || {
        let _ = child.wait();
    });

    Ok(ExecutionResult { pid, program, args })
}

fn is_elevation_program(program: &str) -> bool {
    matches!(
        program.rsplit(['/', '\\']).next().unwrap_or(program),
        "sudo" | "su" | "doas"
    )
}

fn requires_shell(parts: &[String]) -> bool {
    let Some(program) = parts.first() else {
        return false;
    };
    if program
        .split_once('=')
        .is_some_and(|(name, _)| is_environment_name(name))
    {
        return true;
    }

    let basename = program
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(program)
        .to_ascii_lowercase();
    matches!(
        basename.as_str(),
        "sh" | "bash"
            | "dash"
            | "zsh"
            | "fish"
            | "cmd"
            | "cmd.exe"
            | "powershell"
            | "powershell.exe"
            | "pwsh"
            | "pwsh.exe"
    )
}

fn is_environment_name(value: &str) -> bool {
    let mut characters = value.chars();
    characters
        .next()
        .is_some_and(|first| first == '_' || first.is_ascii_alphabetic())
        && characters.all(|character| character == '_' || character.is_ascii_alphanumeric())
}

fn parse_structured_command(source: &str) -> CommandResult<Vec<String>> {
    if source.chars().any(is_shell_metacharacter) {
        return Err(CommandError::new(
            "SHELL_SYNTAX_UNSUPPORTED",
            "Direct Run does not support pipes, redirects, chaining, expansion, or shell metacharacters. Use Copy or Open Terminal.",
        ));
    }

    let mut parts = Vec::new();
    let mut current = String::new();
    let mut chars = source.chars().peekable();
    let mut quote: Option<char> = None;
    let mut token_started = false;

    while let Some(character) = chars.next() {
        match quote {
            Some(active_quote) if character == active_quote => {
                quote = None;
                token_started = true;
            }
            Some('\'') => current.push(character),
            Some('"') if character == '\\' => {
                let escaped = chars.next().ok_or_else(|| {
                    CommandError::new(
                        "INVALID_COMMAND",
                        "The command ends with an escape character.",
                    )
                })?;
                current.push(escaped);
                token_started = true;
            }
            Some(_) => {
                current.push(character);
                token_started = true;
            }
            None if matches!(character, '\'' | '"') => {
                quote = Some(character);
                token_started = true;
            }
            None if character == '\\' => {
                let escaped = chars.next().ok_or_else(|| {
                    CommandError::new(
                        "INVALID_COMMAND",
                        "The command ends with an escape character.",
                    )
                })?;
                current.push(escaped);
                token_started = true;
            }
            None if character.is_whitespace() => {
                if token_started {
                    parts.push(std::mem::take(&mut current));
                    token_started = false;
                }
            }
            None => {
                current.push(character);
                token_started = true;
            }
        }
    }

    if quote.is_some() {
        return Err(CommandError::new(
            "INVALID_COMMAND",
            "The command contains an unclosed quote.",
        ));
    }
    if token_started {
        parts.push(current);
    }
    if parts.is_empty() {
        return Err(CommandError::new("EMPTY_COMMAND", "The command is empty."));
    }
    Ok(parts)
}

fn is_shell_metacharacter(character: char) -> bool {
    matches!(
        character,
        '|' | '&'
            | ';'
            | '>'
            | '<'
            | '$'
            | '`'
            | '*'
            | '?'
            | '['
            | ']'
            | '{'
            | '}'
            | '('
            | ')'
            | '~'
            | '\n'
            | '\r'
    )
}

#[cfg(test)]
mod tests {
    use super::{is_elevation_program, parse_structured_command, requires_shell};

    #[test]
    fn parses_plain_and_quoted_arguments() {
        let parsed = parse_structured_command("nmap -p \"22, 80\" 'example host'")
            .expect("simple command should parse");
        assert_eq!(parsed, ["nmap", "-p", "22, 80", "example host"]);
    }

    #[test]
    fn rejects_shell_operators() {
        assert!(parse_structured_command("cat file | grep secret").is_err());
        assert!(parse_structured_command("echo $(whoami)").is_err());
    }

    #[test]
    fn recognizes_explicit_shell_and_environment_invocations() {
        let shell = parse_structured_command("/bin/bash -c 'echo unsafe'")
            .expect("shell invocation should tokenize");
        assert!(requires_shell(&shell));
        let shell_script =
            parse_structured_command("bash script.sh").expect("shell script should tokenize");
        assert!(requires_shell(&shell_script));

        let environment =
            parse_structured_command("MODE=fast tool").expect("assignment should tokenize");
        assert!(requires_shell(&environment));

        let structured = parse_structured_command("nmap -sV target").expect("command should parse");
        assert!(!requires_shell(&structured));
        assert!(is_elevation_program("/usr/bin/sudo"));
    }
}
