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
    let root = canonical_workspace(&workspace_root)?;
    read_directory(&root, &root, 0)
}

#[tauri::command]
pub(crate) async fn read_command_file(
    workspace_root: String,
    file_path: String,
) -> CommandResult<String> {
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
        "version": 1,
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
pub(crate) async fn delete_entry(
    workspace_root: String,
    entry_path: String,
    recursive: bool,
) -> CommandResult<()> {
    let (root, target) = canonical_existing_path(&workspace_root, &entry_path)?;
    if target == root {
        return Err(CommandError::new(
            "WORKSPACE_ROOT",
            "The workspace root cannot be deleted from inside Command Vault.",
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

    if metadata.is_dir() {
        let has_children = fs::read_dir(&target)
            .map_err(|error| CommandError::from_io(error, "Could not inspect folder"))?
            .next()
            .is_some();
        if has_children && !recursive {
            return Err(CommandError::new(
                "FOLDER_NOT_EMPTY",
                "The folder is not empty. Confirm recursive deletion to continue.",
            ));
        }
        if recursive {
            fs::remove_dir_all(&target)
                .map_err(|error| CommandError::from_io(error, "Could not delete folder"))?;
        } else {
            fs::remove_dir(&target)
                .map_err(|error| CommandError::from_io(error, "Could not delete folder"))?;
        }
    } else {
        ensure_command_file(&target)?;
        fs::remove_file(&target)
            .map_err(|error| CommandError::from_io(error, "Could not delete command file"))?;
    }
    Ok(())
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

    let iterator = fs::read_dir(directory)
        .map_err(|error| CommandError::from_io(error, "Could not read workspace folder"))?;
    let mut entries = Vec::new();

    for item in iterator {
        let item = item.map_err(|error| CommandError::from_io(error, "Could not read entry"))?;
        let file_type = item
            .file_type()
            .map_err(|error| CommandError::from_io(error, "Could not inspect entry"))?;
        if file_type.is_symlink() {
            continue;
        }

        let path = item.path();
        ensure_inside(root, &path)?;
        let name = item.file_name().to_string_lossy().into_owned();
        if file_type.is_dir() {
            entries.push(FilesystemEntry {
                name,
                path: path.to_string_lossy().into_owned(),
                kind: EntryKind::Folder,
                children: read_directory(root, &path, depth + 1)?,
            });
        } else if file_type.is_file() && has_command_extension(&path) {
            entries.push(FilesystemEntry {
                name,
                path: path.to_string_lossy().into_owned(),
                kind: EntryKind::CommandFile,
                children: Vec::new(),
            });
        }
    }

    entries.sort_by(compare_entries);
    Ok(entries)
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
        create_folder, delete_entry, ensure_expected_content, list_directory, read_command_file,
        read_directory, rename_entry, validate_entry_name, write_command_file,
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
  "version": 1,
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

        assert!(tauri::async_runtime::block_on(delete_entry(
            root.clone(),
            folder.path.clone(),
            false
        ))
        .is_err());
        tauri::async_runtime::block_on(delete_entry(root, folder.path.clone(), true))
            .expect("confirmed recursive delete must succeed");
        assert!(!PathBuf::from(folder.path).exists());
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
            r#"{"version":1,"title":"Nmap","sections":[]}"#.to_string(),
            loaded,
        ));
        assert!(result.is_err());
        assert_eq!(
            fs::read_to_string(command_file.path).expect("external content must remain"),
            "external edit\n"
        );
    }
}
