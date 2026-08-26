export type FilesystemEntryKind = "folder" | "command-file";

export interface FilesystemEntry {
  name: string;
  path: string;
  kind: FilesystemEntryKind;
  children: FilesystemEntry[];
  revision: string | null;
}

export interface PathResult {
  path: string;
}
