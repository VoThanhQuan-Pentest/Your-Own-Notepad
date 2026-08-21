export type FilesystemEntryKind = "folder" | "command-file";

export interface FilesystemEntry {
  name: string;
  path: string;
  kind: FilesystemEntryKind;
  children: FilesystemEntry[];
}

export interface PathResult {
  path: string;
}
