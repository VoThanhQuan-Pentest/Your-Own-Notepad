use std::cmp::Ordering;
use std::ffi::OsStr;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::json;

use crate::error::{CommandError, CommandResult};
use crate::models::filesystem::{EntryKind, FilesystemEntry, PathResult};

const COMMAND_FILE_EXTENSION: &str = "cmdnote";
const MAX_COMMAND_FILE_BYTES: u64 = 5 * 1024 * 1024;
const MAX_DIRECTORY_DEPTH: usize = 64;

#[tauri::command]
pub(crate) async fn list_directory(workspace_root: String) -> CommandResult<Vec<FilesystemEntry>> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = canonical_workspace(&workspace_root)?;
        read_directory(&root, &root, 0)
    })
    .await
    .map_err(|error| CommandError::new("TASK_FAILED", format!("Workspace scan failed: {error}")))?
}

#[tauri::command]
pub(crate) async fn read_command_file(
    workspace_root: String,
    file_path: String,
) -> CommandResult<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (_, file) = canonical_existing_path(&workspace_root, &file_path)?;
        ensure_command_file(&file)?;

        let metadata = fs::metadata(&file)
            .map_err(|error| CommandError::from_io(error, "Could not inspect command file"))?;
        if !metadata.is_file() {
            return Err(CommandError::new(
                "NOT_A_FILE",
                "The selected path is not a command file.",
            ));
        }
        if metadata.len() > MAX_COMMAND_FILE_BYTES {
            return Err(CommandError::new(
                "FILE_TOO_LARGE",
                "The command file is larger than the 5 MiB safety limit.",
            ));
        }

        let mut source = String::new();
        File::open(&file)
            .and_then(|mut handle| handle.read_to_string(&mut source))
            .map_err(|error| CommandError::from_io(error, "Could not read command file"))?;
        Ok(source)
    })
    .await
    .map_err(|error| CommandError::new("TASK_FAILED", format!("File read failed: {error}")))?
}

#[tauri::command]
pub(crate) async fn write_command_file(
    workspace_root: String,
    file_path: String,
    content: String,
    expected_content: String,
) -> CommandResult<String> {
    if content.len() as u64 > MAX_COMMAND_FILE_BYTES {
        return Err(CommandError::new(
            "FILE_TOO_LARGE",
            "The command file is larger than the 5 MiB safety limit.",
        ));
    }

    let root = canonical_workspace(&workspace_root)?;
    let target = validated_target_path(&root, &file_path)?;
    ensure_command_file(&target)?;
    if !target.exists() {
        return Err(CommandError::new(
            "NOT_FOUND",
            "The command file no longer exists. Refresh the workspace before saving.",
        ));
    }

    let metadata = fs::metadata(&target)
        .map_err(|error| CommandError::from_io(error, "Could not inspect command file"))?;
    if !metadata.is_file() {
        return Err(CommandError::new(
            "NOT_A_FILE",
            "The selected path is not a command file.",
        ));
    }
    let current = fs::read_to_string(&target)
        .map_err(|error| CommandError::from_io(error, "Could not verify command file"))?;
    ensure_expected_content(&current, &expected_content)?;

    let value: serde_json::Value = serde_json::from_str(&content).map_err(|error| {
        CommandError::new("INVALID_JSON", format!("Cannot save invalid JSON: {error}"))
    })?;
    let pretty = serde_json::to_string_pretty(&value).map_err(|error| {
        CommandError::new(
            "SERIALIZATION_FAILED",
            format!("Could not serialize file: {error}"),
        )
    })?;
    let normalized = format!("{pretty}\n");
    atomic_write(&target, normalized.as_bytes())?;
    Ok(normalized)
}

#[tauri::command]
pub(crate) async fn create_folder(
    workspace_root: String,
    parent_path: String,
    name: String,
) -> CommandResult<PathResult> {
    let (root, parent) = canonical_existing_path(&workspace_root, &parent_path)?;
    if !parent.is_dir() {
        return Err(CommandError::new(
            "NOT_A_FOLDER",
            "The parent path is not a folder.",
        ));
    }
    ensure_inside(&root, &parent)?;
    let name = validate_entry_name(&name)?;
    let target = parent.join(name);
    if target.exists() {
        return Err(CommandError::new(
            "ALREADY_EXISTS",
            "A file or folder with that name already exists.",
        ));
    }
    fs::create_dir(&target)
        .map_err(|error| CommandError::from_io(error, "Could not create folder"))?;
    Ok(path_result(target))
}

#[tauri::command]
pub(crate) async fn create_command_file(
    workspace_root: String,
    parent_path: String,
    name: String,
) -> CommandResult<PathResult> {
    let (root, parent) = canonical_existing_path(&workspace_root, &parent_path)?;
    if !parent.is_dir() {
        return Err(CommandError::new(
            "NOT_A_FOLDER",
            "The parent path is not a folder.",
        ));
    }
    ensure_inside(&root, &parent)?;
    let file_name = command_file_name(&name)?;
    let target = parent.join(&file_name);
    if target.exists() {
        return Err(CommandError::new(
            "ALREADY_EXISTS",
            "A command file with that name already exists.",
        ));
    }

    let title = Path::new(&file_name)
        .file_stem()
        .and_then(OsStr::to_str)
        .unwrap_or("Untitled");
    let source = serde_json::to_string_pretty(&json!({
        "version": 2,
        "title": title,
        "description": "",
        "sections": []
    }))
    .map_err(|error| {
        CommandError::new(
            "SERIALIZATION_FAILED",
            format!("Could not create file: {error}"),
        )
    })?;
    atomic_write_new(&target, format!("{source}\n").as_bytes())?;
    Ok(path_result(target))
}

#[tauri::command]
pub(crate) async fn rename_entry(
    workspace_root: String,
    entry_path: String,
    new_name: String,
) -> CommandResult<PathResult> {
    let (root, source) = canonical_existing_path(&workspace_root, &entry_path)?;
    if source == root {
        return Err(CommandError::new(
            "WORKSPACE_ROOT",
            "The workspace root cannot be renamed from inside Command Vault.",
        ));
    }

    let parent = source.parent().ok_or_else(|| {
        CommandError::new("INVALID_PATH", "The selected entry has no parent folder.")
    })?;
    let target_name = if source.is_file() {
        command_file_name(&new_name)?
    } else {
        validate_entry_name(&new_name)?
    };
    let target = parent.join(target_name);
    if target.exists() {
        return Err(CommandError::new(
            "ALREADY_EXISTS",
            "A file or folder with that name already exists.",
        ));
    }
    ensure_inside(&root, &target)?;
    fs::rename(&source, &target)
        .map_err(|error| CommandError::from_io(error, "Could not rename entry"))?;
    Ok(path_result(target))
}

#[tauri::command]
pub(crate) async fn trash_entry(workspace_root: String, entry_path: String) -> CommandResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        trash_entry_with(&workspace_root, &entry_path, |target| {
            trash::delete(target).map_err(|error| {
                CommandError::new(
                    "TRASH_FAILED",
                    format!("Could not move the entry to the system Trash: {error}"),
                )
            })
        })
    })
    .await
    .map_err(|error| {
        CommandError::new(
            "TRASH_TASK_FAILED",
            format!("The system Trash task could not finish: {error}"),
        )
    })?
}

fn trash_entry_with<F>(
    workspace_root: &str,
    entry_path: &str,
    move_to_trash: F,
) -> CommandResult<()>
where
    F: FnOnce(&Path) -> CommandResult<()>,
{
    let (root, target) = canonical_existing_path(workspace_root, entry_path)?;
    if target == root {
        return Err(CommandError::new(
            "WORKSPACE_ROOT",
            "The workspace root cannot be moved to Trash from inside Command Vault.",
        ));
    }

    let metadata = fs::symlink_metadata(&target)
        .map_err(|error| CommandError::from_io(error, "Could not inspect entry"))?;
    if metadata.file_type().is_symlink() {
        return Err(CommandError::new(
            "SYMLINK_UNSUPPORTED",
            "Symbolic links are not managed by Command Vault.",
        ));
    }

    if metadata.is_file() {
        ensure_command_file(&target)?;
    } else if !metadata.is_dir() {
        return Err(CommandError::new(
            "UNSUPPORTED_ENTRY",
            "Only folders and command files can be moved to Trash.",
        ));
    }
    move_to_trash(&target)
}

pub(crate) fn atomic_write(target: &Path, bytes: &[u8]) -> CommandResult<()> {
    let parent = target
        .parent()
        .ok_or_else(|| CommandError::new("INVALID_PATH", "The target has no parent folder."))?;
    let file_name = target
        .file_name()
        .and_then(OsStr::to_str)
        .ok_or_else(|| CommandError::new("INVALID_PATH", "The target filename is not UTF-8."))?;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| CommandError::new("CLOCK_ERROR", "The system clock is invalid."))?
        .as_nanos();
    let temporary = parent.join(format!(".{file_name}.{nonce}.tmp"));

    let existing_permissions = fs::metadata(target)
        .ok()
        .map(|metadata| metadata.permissions());

    let result = (|| -> CommandResult<()> {
        let mut handle = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|error| CommandError::from_io(error, "Could not create temporary file"))?;
        handle
            .write_all(bytes)
            .and_then(|_| handle.sync_all())
            .map_err(|error| CommandError::from_io(error, "Could not write temporary file"))?;
        if let Some(permissions) = existing_permissions {
            fs::set_permissions(&temporary, permissions).map_err(|error| {
                CommandError::from_io(error, "Could not preserve file permissions")
            })?;
        }
        fs::rename(&temporary, target)
            .map_err(|error| CommandError::from_io(error, "Could not replace command file"))?;
        if let Ok(directory) = File::open(parent) {
            let _ = directory.sync_all();
        }
        Ok(())
    })();

    if result.is_err() && temporary.exists() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn ensure_expected_content(current: &str, expected: &str) -> CommandResult<()> {
    if current == expected {
        Ok(())
    } else {
        Err(CommandError::new(
            "FILE_CHANGED",
            "The command file changed on disk after it was loaded. Refresh before editing again.",
        ))
    }
}

fn atomic_write_new(target: &Path, bytes: &[u8]) -> CommandResult<()> {
    let mut handle = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(target)
        .map_err(|error| CommandError::from_io(error, "Could not create command file"))?;
    if let Err(error) = handle.write_all(bytes).and_then(|_| handle.sync_all()) {
        drop(handle);
        let _ = fs::remove_file(target);
        return Err(CommandError::from_io(error, "Could not write command file"));
    }
    Ok(())
}

fn read_directory(
    root: &Path,
    directory: &Path,
    depth: usize,
) -> CommandResult<Vec<FilesystemEntry>> {
    if depth > MAX_DIRECTORY_DEPTH {
        return Err(CommandError::new(
            "WORKSPACE_TOO_DEEP",
            "The workspace exceeds the supported folder depth of 64.",
        ));
    }

    let iterator = match fs::read_dir(directory) {
        Ok(iter) => iter,
        Err(error) if depth > 0 && error.kind() == std::io::ErrorKind::PermissionDenied => {
            return Ok(Vec::new());
        }
        Err(error) => {
            return Err(CommandError::from_io(
                error,
                "Could not read workspace folder",
            ));
        }
    };
    let mut entries = Vec::new();

    for item in iterator {
        let item = match item {
            Ok(item) => item,
            Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => continue,
            Err(error) => return Err(CommandError::from_io(error, "Could not read entry")),
        };
        let file_type = match item.file_type() {
            Ok(ft) => ft,
            Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => continue,
            Err(error) => return Err(CommandError::from_io(error, "Could not inspect entry")),
        };
        if file_type.is_symlink() {
            continue;
        }

        let path = item.path();
        ensure_inside(root, &path)?;
        let name = item.file_name().to_string_lossy().into_owned();
        if file_type.is_dir() {
            let children = read_directory(root, &path, depth + 1)?;
            entries.push(FilesystemEntry {
                name,
                path: path.to_string_lossy().into_owned(),
                kind: EntryKind::Folder,
                children,
                revision: None,
            });
        } else if file_type.is_file() && has_command_extension(&path) {
            let metadata = match item.metadata() {
                Ok(meta) => meta,
                Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => continue,
                Err(error) => {
                    return Err(CommandError::from_io(
                        error,
                        "Could not inspect command file",
                    ))
                }
            };
            entries.push(FilesystemEntry {
                name,
                path: path.to_string_lossy().into_owned(),
                kind: EntryKind::CommandFile,
                children: Vec::new(),
                revision: file_revision(&metadata),
            });
        }
    }

    entries.sort_by(compare_entries);
    Ok(entries)
}

fn file_revision(metadata: &fs::Metadata) -> Option<String> {
    let modified = metadata.modified().ok()?.duration_since(UNIX_EPOCH).ok()?;
    Some(format!(
        "{}:{}:{}",
        metadata.len(),
        modified.as_secs(),
        modified.subsec_nanos()
    ))
}

fn compare_entries(left: &FilesystemEntry, right: &FilesystemEntry) -> Ordering {
    match (&left.kind, &right.kind) {
        (EntryKind::Folder, EntryKind::CommandFile) => Ordering::Less,
        (EntryKind::CommandFile, EntryKind::Folder) => Ordering::Greater,
        _ => left.name.to_lowercase().cmp(&right.name.to_lowercase()),
    }
}

fn canonical_workspace(workspace_root: &str) -> CommandResult<PathBuf> {
    let root = fs::canonicalize(workspace_root)
        .map_err(|error| CommandError::from_io(error, "Workspace not found"))?;
    if !root.is_dir() {
        return Err(CommandError::new(
            "NOT_A_FOLDER",
            "The selected workspace is not a folder.",
        ));
    }
    Ok(root)
}

fn canonical_existing_path(
    workspace_root: &str,
    target_path: &str,
) -> CommandResult<(PathBuf, PathBuf)> {
    let root = canonical_workspace(workspace_root)?;
    let requested = PathBuf::from(target_path);
    if requested.as_path() == Path::new(workspace_root) {
        return Ok((root.clone(), root));
    }
    reject_symlink_components(&root, &requested)?;
    let target = fs::canonicalize(&requested)
        .map_err(|error| CommandError::from_io(error, "Entry not found"))?;
    ensure_inside(&root, &target)?;
    Ok((root, target))
}

fn validated_target_path(root: &Path, target_path: &str) -> CommandResult<PathBuf> {
    let target = PathBuf::from(target_path);
    let parent = target
        .parent()
        .ok_or_else(|| CommandError::new("INVALID_PATH", "The target has no parent folder."))?;
    let canonical_parent = fs::canonicalize(parent)
        .map_err(|error| CommandError::from_io(error, "Parent folder not found"))?;
    ensure_inside(root, &canonical_parent)?;
    let file_name = target
        .file_name()
        .ok_or_else(|| CommandError::new("INVALID_PATH", "The target has no filename."))?;
    let validated = canonical_parent.join(file_name);
    match fs::symlink_metadata(&validated) {
        Ok(metadata) if metadata.file_type().is_symlink() => Err(CommandError::new(
            "SYMLINK_UNSUPPORTED",
            "Symbolic links are not managed by Command Vault.",
        )),
        Ok(_) => Ok(validated),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(validated),
        Err(error) => Err(CommandError::from_io(
            error,
            "Could not inspect target path",
        )),
    }
}

fn reject_symlink_components(root: &Path, requested: &Path) -> CommandResult<()> {
    if !requested.starts_with(root) {
        return Err(CommandError::new(
            "OUTSIDE_WORKSPACE",
            "The requested path is outside the active workspace.",
        ));
    }

    let relative = requested.strip_prefix(root).map_err(|_| {
        CommandError::new(
            "OUTSIDE_WORKSPACE",
            "The requested path is outside the active workspace.",
        )
    })?;
    let mut current = root.to_path_buf();
    for component in relative.components() {
        let Component::Normal(name) = component else {
            return Err(CommandError::new(
                "INVALID_PATH",
                "Workspace paths cannot contain parent or platform-prefix components.",
            ));
        };
        current.push(name);
        let metadata = fs::symlink_metadata(&current)
            .map_err(|error| CommandError::from_io(error, "Entry not found"))?;
        if metadata.file_type().is_symlink() {
            return Err(CommandError::new(
                "SYMLINK_UNSUPPORTED",
                "Symbolic links are not managed by Command Vault.",
            ));
        }
    }
    Ok(())
}

fn ensure_inside(root: &Path, target: &Path) -> CommandResult<()> {
    if target.starts_with(root) {
        Ok(())
    } else {
        Err(CommandError::new(
            "OUTSIDE_WORKSPACE",
            "The requested path is outside the active workspace.",
        ))
    }
}

fn validate_entry_name(name: &str) -> CommandResult<String> {
    let trimmed = name.trim();
    let mut components = Path::new(trimmed).components();
    let single_component =
        matches!(components.next(), Some(Component::Normal(_))) && components.next().is_none();
    if trimmed.is_empty()
        || !single_component
        || trimmed.contains('/')
        || trimmed.contains('\\')
        || trimmed.contains('\0')
    {
        return Err(CommandError::new(
            "INVALID_NAME",
            "Use a single filename without path separators.",
        ));
    }
    Ok(trimmed.to_string())
}

fn command_file_name(name: &str) -> CommandResult<String> {
    let mut value = validate_entry_name(name)?;
    if value.eq_ignore_ascii_case(".cmdnote") {
        return Err(CommandError::new(
            "INVALID_NAME",
            "A command file needs a name before the .cmdnote extension.",
        ));
    }
    if !value.to_lowercase().ends_with(".cmdnote") {
        value.push_str(".cmdnote");
    }
    Ok(value)
}

fn ensure_command_file(path: &Path) -> CommandResult<()> {
    if has_command_extension(path) {
        Ok(())
    } else {
        Err(CommandError::new(
            "UNSUPPORTED_FILE",
            "Command Vault only reads and writes .cmdnote files.",
        ))
    }
}

fn has_command_extension(path: &Path) -> bool {
    path.extension()
        .and_then(OsStr::to_str)
        .is_some_and(|extension| extension.eq_ignore_ascii_case(COMMAND_FILE_EXTENSION))
}

fn path_result(path: PathBuf) -> PathResult {
    PathResult {
        path: path.to_string_lossy().into_owned(),
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::{
        atomic_write, canonical_existing_path, command_file_name, create_command_file,
        create_folder, ensure_expected_content, list_directory, read_command_file, read_directory,
        rename_entry, trash_entry_with, validate_entry_name, write_command_file,
    };

    struct TestDirectory {
        path: PathBuf,
    }

    impl TestDirectory {
        fn new(label: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("test clock must be valid")
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "command-vault-{label}-{}-{nonce}",
                std::process::id()
            ));
            fs::create_dir(&path).expect("test directory must be created");
            Self { path }
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn validates_single_entry_names_and_command_extensions() {
        assert_eq!(
            validate_entry_name(" Network ").expect("valid name"),
            "Network"
        );
        assert!(validate_entry_name("../outside").is_err());
        assert!(validate_entry_name("folder/file").is_err());
        assert!(validate_entry_name("folder\\file").is_err());
        assert_eq!(
            command_file_name("Nmap").expect("valid file"),
            "Nmap.cmdnote"
        );
        assert!(command_file_name(".cmdnote").is_err());
        assert_eq!(
            command_file_name("Wireshark.CMDNOTE").expect("valid extension"),
            "Wireshark.CMDNOTE"
        );
    }

    #[test]
    fn lists_only_folders_and_command_files_in_stable_order() {
        let workspace = TestDirectory::new("listing");
        fs::create_dir(workspace.path.join("z-folder")).expect("folder must be created");
        fs::create_dir(workspace.path.join("A-folder")).expect("folder must be created");
        fs::write(workspace.path.join("b.cmdnote"), "{}").expect("file must be created");
        fs::write(workspace.path.join("A.cmdnote"), "{}").expect("file must be created");
        fs::write(workspace.path.join("ignored.txt"), "ignored").expect("file must be created");

        let entries =
            read_directory(&workspace.path, &workspace.path, 0).expect("workspace must be listed");
        let names = entries
            .iter()
            .map(|entry| entry.name.as_str())
            .collect::<Vec<_>>();
        assert_eq!(names, ["A-folder", "z-folder", "A.cmdnote", "b.cmdnote"]);
    }

    #[test]
    fn command_file_revision_changes_with_file_contents() {
        let workspace = TestDirectory::new("revision");
        let file = workspace.path.join("Nmap.cmdnote");
        fs::write(&file, "{}").expect("file must be created");
        let first =
            read_directory(&workspace.path, &workspace.path, 0).expect("workspace must be listed");
        let first_revision = first[0]
            .revision
            .clone()
            .expect("file must have a revision");
        fs::write(&file, "{\"version\":2}").expect("file must be changed");
        let second =
            read_directory(&workspace.path, &workspace.path, 0).expect("workspace must be listed");
        assert_ne!(
            first_revision,
            second[0]
                .revision
                .clone()
                .expect("file must have a revision")
        );
    }

    #[test]
    fn atomic_write_replaces_complete_contents() {
        let workspace = TestDirectory::new("atomic-write");
        let target = workspace.path.join("Nmap.cmdnote");
        fs::write(&target, "original").expect("original must be written");
        atomic_write(&target, b"replacement\n").expect("atomic write must succeed");
        assert_eq!(
            fs::read_to_string(&target).expect("replacement must be readable"),
            "replacement\n"
        );
        let temporary_files = fs::read_dir(&workspace.path)
            .expect("workspace must be readable")
            .filter_map(Result::ok)
            .filter(|entry| entry.path() != target)
            .count();
        assert_eq!(temporary_files, 0);
    }

    #[test]
    fn stale_writes_are_rejected_before_replacement() {
        assert!(ensure_expected_content("same", "same").is_ok());
        assert!(ensure_expected_content("changed externally", "previously loaded").is_err());
    }

    #[test]
    fn rejects_paths_outside_the_workspace() {
        let workspace = TestDirectory::new("boundary");
        let outside = TestDirectory::new("outside");
        let outside_file = outside.path.join("outside.cmdnote");
        fs::write(&outside_file, "{}").expect("outside file must be created");
        assert!(canonical_existing_path(
            workspace.path.to_string_lossy().as_ref(),
            outside_file.to_string_lossy().as_ref()
        )
        .is_err());
    }

    #[test]
    fn trash_validation_rejects_unsafe_targets_before_backend_call() {
        let workspace = TestDirectory::new("trash-validation");
        let root = workspace.path.to_string_lossy().into_owned();
        let mut backend_called = false;
        assert!(trash_entry_with(&root, &root, |_| {
            backend_called = true;
            Ok(())
        })
        .is_err());
        assert!(!backend_called);

        let ignored = workspace.path.join("ignored.txt");
        fs::write(&ignored, "not a command file").expect("test file must be created");
        assert!(
            trash_entry_with(&root, ignored.to_string_lossy().as_ref(), |_| {
                backend_called = true;
                Ok(())
            })
            .is_err()
        );
        assert!(!backend_called);
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_targets_inside_the_workspace() {
        use std::os::unix::fs::symlink;

        let workspace = TestDirectory::new("symlink");
        let target = workspace.path.join("real.cmdnote");
        let link = workspace.path.join("linked.cmdnote");
        fs::write(&target, "{}").expect("target must be created");
        symlink(&target, &link).expect("symlink must be created");

        assert!(canonical_existing_path(
            workspace.path.to_string_lossy().as_ref(),
            link.to_string_lossy().as_ref()
        )
        .is_err());
        assert!(target.exists());
    }

    #[test]
    fn workspace_crud_flow_preserves_real_files() {
        let workspace = TestDirectory::new("crud-flow");
        let root = workspace.path.to_string_lossy().into_owned();
        let folder = tauri::async_runtime::block_on(create_folder(
            root.clone(),
            root.clone(),
            "Network".to_string(),
        ))
        .expect("folder must be created");
        let command_file = tauri::async_runtime::block_on(create_command_file(
            root.clone(),
            folder.path.clone(),
            "Nmap".to_string(),
        ))
        .expect("command file must be created");

        let initial = tauri::async_runtime::block_on(read_command_file(
            root.clone(),
            command_file.path.clone(),
        ))
        .expect("initial file must be readable");
        let changed = r#"{
  "version": 2,
  "title": "Nmap",
  "description": "Network scanner",
  "sections": []
}"#;
        let saved = tauri::async_runtime::block_on(write_command_file(
            root.clone(),
            command_file.path.clone(),
            changed.to_string(),
            initial,
        ))
        .expect("command file must be saved atomically");
        assert_eq!(
            tauri::async_runtime::block_on(read_command_file(
                root.clone(),
                command_file.path.clone()
            ))
            .expect("saved file must be readable"),
            saved
        );

        let renamed = tauri::async_runtime::block_on(rename_entry(
            root.clone(),
            command_file.path,
            "Scanner".to_string(),
        ))
        .expect("command file must be renamed");
        assert!(PathBuf::from(&renamed.path).is_file());
        let tree = tauri::async_runtime::block_on(list_directory(root.clone()))
            .expect("workspace tree must load");
        assert_eq!(tree.len(), 1);
        assert_eq!(tree[0].children.len(), 1);
        assert_eq!(tree[0].children[0].name, "Scanner.cmdnote");

        let mut trashed = None;
        trash_entry_with(&root, &folder.path, |target| {
            trashed = Some(target.to_path_buf());
            Ok(())
        })
        .expect("validated folder must be passed to the trash backend");
        assert_eq!(trashed, Some(PathBuf::from(&folder.path)));
        assert!(PathBuf::from(folder.path).exists());
    }

    #[test]
    fn external_edits_are_not_overwritten() {
        let workspace = TestDirectory::new("external-change");
        let root = workspace.path.to_string_lossy().into_owned();
        let command_file = tauri::async_runtime::block_on(create_command_file(
            root.clone(),
            root.clone(),
            "Nmap".to_string(),
        ))
        .expect("command file must be created");
        let loaded = fs::read_to_string(&command_file.path).expect("file must be readable");
        fs::write(&command_file.path, "external edit\n").expect("external edit must succeed");

        let result = tauri::async_runtime::block_on(write_command_file(
            root,
            command_file.path.clone(),
            r#"{"version":2,"title":"Nmap","sections":[]}"#.to_string(),
            loaded,
        ));
        assert!(result.is_err());
        assert_eq!(
            fs::read_to_string(command_file.path).expect("external content must remain"),
            "external edit\n"
        );
    }

    #[cfg(unix)]
    #[test]
    fn atomic_write_preserves_unix_permissions() {
        use std::os::unix::fs::PermissionsExt;

        let workspace = TestDirectory::new("atomic-perms");
        let target = workspace.path.join("permissions.cmdnote");
        fs::write(&target, "initial").expect("target must be written");

        for mode in [0o600, 0o640, 0o644] {
            fs::set_permissions(&target, fs::Permissions::from_mode(mode))
                .expect("permission must be set");
            atomic_write(&target, b"updated content\n").expect("atomic write must succeed");
            let metadata = fs::metadata(&target).expect("metadata must be readable");
            assert_eq!(
                metadata.permissions().mode() & 0o777,
                mode,
                "Mode 0{:o} must be preserved after atomic_write",
                mode
            );
        }
    }

    #[cfg(unix)]
    #[test]
    fn nested_unreadable_folder_does_not_fail_workspace() {
        use std::os::unix::fs::PermissionsExt;

        let workspace = TestDirectory::new("nested-unreadable");
        let root = workspace.path.to_string_lossy().into_owned();

        let readable_folder = workspace.path.join("Linux");
        fs::create_dir(&readable_folder).expect("Linux folder must be created");
        let command_file = readable_folder.join("Terminal.cmdnote");
        fs::write(
            &command_file,
            r#"{"version":2,"title":"Terminal","sections":[]}"#,
        )
        .expect("file must be created");

        let unreadable_folder = workspace.path.join("Private");
        fs::create_dir(&unreadable_folder).expect("Private folder must be created");
        fs::set_permissions(&unreadable_folder, fs::Permissions::from_mode(0o000))
            .expect("Private permissions must be stripped");

        let list_result = tauri::async_runtime::block_on(list_directory(root));

        let _ = fs::set_permissions(&unreadable_folder, fs::Permissions::from_mode(0o755));

        let entries =
            list_result.expect("workspace listing must not fail due to nested unreadable folder");
        let folder_names: Vec<&str> = entries.iter().map(|entry| entry.name.as_str()).collect();
        assert!(
            folder_names.contains(&"Linux"),
            "Readable folder must be present"
        );
        assert!(
            folder_names.contains(&"Private"),
            "Unreadable folder entry must be present"
        );

        let linux_entry = entries.iter().find(|entry| entry.name == "Linux").unwrap();
        assert_eq!(linux_entry.children.len(), 1);
        assert_eq!(linux_entry.children[0].name, "Terminal.cmdnote");

        let private_entry = entries
            .iter()
            .find(|entry| entry.name == "Private")
            .unwrap();
        assert_eq!(private_entry.children.len(), 0);
    }

    #[cfg(unix)]
    #[test]
    fn unreadable_workspace_root_fails_gracefully() {
        use std::os::unix::fs::PermissionsExt;

        let workspace = TestDirectory::new("unreadable-root");
        let root = workspace.path.to_string_lossy().into_owned();

        fs::set_permissions(&workspace.path, fs::Permissions::from_mode(0o000))
            .expect("root permissions must be stripped");

        let list_result = tauri::async_runtime::block_on(list_directory(root));

        let _ = fs::set_permissions(&workspace.path, fs::Permissions::from_mode(0o755));

        assert!(
            list_result.is_err(),
            "Unreadable root workspace must fail as an error"
        );
    }
}
