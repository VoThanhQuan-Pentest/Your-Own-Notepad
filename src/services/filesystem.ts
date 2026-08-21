import { invoke } from "@tauri-apps/api/core";

import type { FilesystemEntry, PathResult } from "../models/filesystem";

export function listDirectory(workspaceRoot: string): Promise<FilesystemEntry[]> {
  return invoke("list_directory", { workspaceRoot });
}

export function readCommandFile(workspaceRoot: string, filePath: string): Promise<string> {
  return invoke("read_command_file", { workspaceRoot, filePath });
}

export function writeCommandFile(
  workspaceRoot: string,
  filePath: string,
  content: string,
  expectedContent: string,
): Promise<string> {
  return invoke("write_command_file", { workspaceRoot, filePath, content, expectedContent });
}

export function createFolder(
  workspaceRoot: string,
  parentPath: string,
  name: string,
): Promise<PathResult> {
  return invoke("create_folder", { workspaceRoot, parentPath, name });
}

export function createCommandFile(
  workspaceRoot: string,
  parentPath: string,
  name: string,
): Promise<PathResult> {
  return invoke("create_command_file", { workspaceRoot, parentPath, name });
}

export function renameEntry(
  workspaceRoot: string,
  entryPath: string,
  newName: string,
): Promise<PathResult> {
  return invoke("rename_entry", { workspaceRoot, entryPath, newName });
}

export function deleteEntry(
  workspaceRoot: string,
  entryPath: string,
  recursive: boolean,
): Promise<void> {
  return invoke("delete_entry", { workspaceRoot, entryPath, recursive });
}
