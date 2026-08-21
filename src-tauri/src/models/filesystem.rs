use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FilesystemEntry {
    pub(crate) name: String,
    pub(crate) path: String,
    pub(crate) kind: EntryKind,
    pub(crate) children: Vec<FilesystemEntry>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum EntryKind {
    Folder,
    CommandFile,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PathResult {
    pub(crate) path: String,
}
