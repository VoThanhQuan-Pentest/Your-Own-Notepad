use std::io;

use serde::Serialize;

pub(crate) type CommandResult<T> = Result<T, CommandError>;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CommandError {
    code: &'static str,
    message: String,
}

impl CommandError {
    pub(crate) fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    pub(crate) fn from_io(error: io::Error, context: &str) -> Self {
        let code = match error.kind() {
            io::ErrorKind::NotFound => "NOT_FOUND",
            io::ErrorKind::PermissionDenied => "PERMISSION_DENIED",
            io::ErrorKind::AlreadyExists => "ALREADY_EXISTS",
            io::ErrorKind::InvalidInput | io::ErrorKind::InvalidData => "INVALID_INPUT",
            _ => "IO_ERROR",
        };
        Self::new(code, format!("{context}: {error}"))
    }
}
