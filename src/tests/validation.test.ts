import { createId } from "../utils/ids";
import { SessionHistory } from "../utils/history";
import { normalizeSettings } from "../services/settings";
import type { AppSettings } from "../models/settings";
import { contrastRatio, mixHex } from "../utils/color";
import {
  createSearchDocument,
  normalizeSearchText,
  rankSearchDocuments,
  searchDocuments,
} from "../utils/search";
import {
  hasTableImportErrors,
  importableCommands,
  normalizeExampleBreaks,
  parseTablePaste,
} from "../utils/table-import";
import { parseCommandFile, serializeCommandFile } from "../utils/validation";

interface TestCase {
  name: string;
  run: () => void;
}

const tests: TestCase[] = [];

const v2Source = JSON.stringify({
  version: 2,
  title: "Nmap",
  description: "Network commands",
  sections: [
    {
      id: "discovery",
      title: "Discovery",
      commands: [
        {
          id: "ping",
          name: "Ping scan",
          command: "nmap -sn 192.168.1.0/24",
          description: "Discover hosts.",
          example: "nmap -sn 192.168.1.0/24",
          notes: "Use only on authorized networks.",
        },
      ],
    },
  ],
});

const v1Source = JSON.stringify({
  version: 1,
  title: "Legacy",
  sections: [
    {
      id: "legacy-section",
      title: "Legacy Section",
      layout: "table",
      commands: [
        {
          id: "legacy-command",
          name: "Legacy Command",
          command: "tool {{target}}",
          description: "Legacy description",
          syntax: "tool <target>",
          example: "tool 192.168.1.10",
          notes: "Legacy note",
          action: "open-terminal",
          risk: "caution",
          variables: [{ name: "target", default: "192.168.1.10" }],
        },
      ],
    },
  ],
});

test("parses a valid version 2 command file", () => {
  const result = parseCommandFile(v2Source);
  equal(result.ok, true);
  if (result.ok) {
    equal(result.sourceVersion, 2);
    equal(result.needsMigration, false);
    equal(result.data.sections[0]?.commands[0]?.example, "nmap -sn 192.168.1.0/24");
  }
});

test("migrates version 1 data to version 2 without removed fields", () => {
  const result = parseCommandFile(v1Source);
  equal(result.ok, true);
  if (result.ok) {
    equal(result.sourceVersion, 1);
    equal(result.needsMigration, true);
    equal(result.data.version, 2);
    equal(result.data.sections[0]?.layout, "table");
    const serialized = serializeCommandFile(result.data);
    ok(!serialized.includes('"syntax"'));
    ok(!serialized.includes('"action"'));
    ok(!serialized.includes('"risk"'));
    ok(!serialized.includes('"variables"'));
  }
});

test("rejects removed command fields in version 2", () => {
  const value = JSON.parse(v2Source) as { sections: Array<{ commands: Array<Record<string, unknown>> }> };
  const command = value.sections[0]?.commands[0];
  ok(command !== undefined);
  command.action = "copy";
  const result = parseCommandFile(JSON.stringify(value));
  equal(result.ok, false);
  if (!result.ok) {
    ok(result.error.issues.some((issue) => issue.path.endsWith(".action")));
  }
});

test("returns friendly parse errors", () => {
  const invalidJson = parseCommandFile('{"version": 2,');
  equal(invalidJson.ok, false);
  if (!invalidJson.ok) equal(invalidJson.error.kind, "invalid-json");

  const unsupported = parseCommandFile('{"version":3,"title":"Future","sections":[]}');
  equal(unsupported.ok, false);
  if (!unsupported.ok) equal(unsupported.error.kind, "unsupported-version");
});

test("rejects duplicate command ids", () => {
  const value = JSON.parse(v2Source) as { sections: Array<{ commands: Array<Record<string, unknown>> }> };
  const first = value.sections[0]?.commands[0];
  ok(first !== undefined);
  value.sections[0]?.commands.push({ ...first, name: "Duplicate" });
  const result = parseCommandFile(JSON.stringify(value));
  equal(result.ok, false);
  if (!result.ok) {
    ok(result.error.issues.some((issue) => issue.message.includes("Duplicate command id")));
  }
});

test("serializes readable version 2 JSON with a trailing newline", () => {
  const result = parseCommandFile(v2Source);
  equal(result.ok, true);
  if (result.ok) {
    const serialized = serializeCommandFile(result.data);
    ok(serialized.includes('"version": 2'));
    ok(serialized.endsWith("\n"));
  }
});

test("creates stable unique readable ids", () => {
  const existing = new Set(["port-scanning", "port-scanning-2"]);
  equal(createId("Port Scanning", existing), "port-scanning-3");
  equal(createId("Tấn công mạng", new Set()), "tan-cong-mang");
});

test("imports Service into Command with a tab", () => {
  const preview = parseTablePaste(
    "Port,Service,Description,Example\n443,HTTPS,Encrypted web access,https://example.com",
    "Common Ports",
    new Set(),
  );
  equal(hasTableImportErrors(preview), false);
  equal(preview.commands[0]?.command, "443\tHTTPS");
  equal(preview.commands[0]?.description, "Encrypted web access");
  equal(preview.commands[0]?.example, "https://example.com");
});

test("blocks deprecated imported columns", () => {
  const preview = parseTablePaste(
    "Command,Syntax,Description\nnmap -sV target,nmap -sV <target>,Service detection",
    "Deprecated",
    new Set(),
  );
  equal(hasTableImportErrors(preview), true);
  ok(preview.issues.some((issue) => issue.message.includes("deprecated column")));
});

test("skips whitespace-normalized commands already present in the file", () => {
  const preview = parseTablePaste(
    "Command,Description\nnmap   -sV target,Duplicate\n",
    "Import",
    new Set(),
    [" nmap -sV   target "],
  );
  equal(preview.duplicates[0]?.kind, "existing");
  equal(importableCommands(preview, false).length, 0);
  equal(importableCommands(preview, true).length, 1);
});

test("keeps the first pasted duplicate and compares commands case-sensitively", () => {
  const preview = parseTablePaste(
    "Command,Description\nnmap -sV target,First\nnmap   -sV target,Duplicate\nNMAP -sV target,Case variant\n",
    "Import",
    new Set(),
  );
  equal(preview.duplicates.length, 1);
  equal(preview.duplicates[0]?.kind, "pasted");
  equal(importableCommands(preview, false).length, 2);
});

test("converts Markdown Example break tags into real newlines", () => {
  equal(normalizeExampleBreaks("first<br>second<BR />third<br/>fourth"), "first\nsecond\nthird\nfourth");
  const preview = parseTablePaste(
    "| Command | Example |\n|---|---|\n| tool | first<br>second |",
    "Examples",
    new Set(),
  );
  equal(preview.commands[0]?.example, "first\nsecond");
});

test("normalizes Vietnamese accents for search", () => {
  equal(normalizeSearchText("Mật khẩu và đường dẫn"), "mat khau va duong dan");
});

test("finds a command after a transposed typo", () => {
  const documents = searchFixture();
  equal(searchDocuments(documents, "namp")[0], "Nmap service detection");
});

test("finds commands with missing and extra characters", () => {
  const documents = searchFixture();
  equal(searchDocuments(documents, "nmp")[0], "Nmap service detection");
  equal(searchDocuments(documents, "nmapp")[0], "Nmap service detection");
});

test("allows two errors for long search tokens", () => {
  const documents = searchFixture();
  equal(searchDocuments(documents, "postgrsxl")[0], "PostgreSQL reference");
});

test("matches unaccented multi-token Vietnamese queries", () => {
  const documents = searchFixture();
  equal(searchDocuments(documents, "mat khau")[0], "Password recovery");
});

test("requires every fuzzy query token to match", () => {
  const documents = searchFixture();
  equal(searchDocuments(documents, "namp srvice")[0], "Nmap service detection");
  equal(searchDocuments(documents, "namp unrelated").length, 0);
});

test("does not fuzz short tokens", () => {
  const documents = searchFixture();
  equal(searchDocuments(documents, "xm").length, 0);
});

test("ranks exact results above fuzzy results", () => {
  const documents = [
    createSearchDocument("Fuzzy Nmap", [{ text: "nmap", priority: 3 }], 0),
    createSearchDocument("Exact Namp", [{ text: "namp", priority: 1 }], 1),
  ];
  equal(searchDocuments(documents, "namp")[0], "Exact Namp");
  equal(searchDocuments(documents, "namp")[1], "Fuzzy Nmap");
  const ranked = rankSearchDocuments(documents, "namp");
  equal(ranked[0]?.matchKind, "exact");
  equal(ranked[1]?.matchKind, "near");
});

test("keeps fuzzy result limits and insertion order stable", () => {
  const documents = Array.from({ length: 120 }, (_, index) =>
    createSearchDocument(index, [{ text: `nmap command ${index}`, priority: 3 }], index),
  );
  const results = searchDocuments(documents, "nmap", 100);
  equal(results.length, 100);
  equal(results[0], 0);
  equal(results[99], 99);
});

test("keeps bounded per-file undo and redo history", () => {
  const history = new SessionHistory<{ value: number }>(2, structuredClone);
  history.record("a.cmdnote", { value: 1 });
  history.record("a.cmdnote", { value: 2 });
  history.record("a.cmdnote", { value: 3 });
  equal(history.peekUndo("a.cmdnote")?.value, 3);
  history.commitUndo("a.cmdnote", { value: 4 });
  equal(history.peekUndo("a.cmdnote")?.value, 2);
  equal(history.peekRedo("a.cmdnote")?.value, 4);
  history.commitRedo("a.cmdnote", { value: 2 });
  equal(history.peekUndo("a.cmdnote")?.value, 2);
});

test("clears redo after a new mutation and remaps file history", () => {
  const history = new SessionHistory<{ value: number }>(50, structuredClone);
  history.record("/workspace/old/file.cmdnote", { value: 1 });
  history.commitUndo("/workspace/old/file.cmdnote", { value: 2 });
  ok(history.canRedo("/workspace/old/file.cmdnote"));
  history.record("/workspace/old/file.cmdnote", { value: 3 });
  equal(history.canRedo("/workspace/old/file.cmdnote"), false);
  history.remapPrefix("/workspace/old", "/workspace/new");
  equal(history.canUndo("/workspace/old/file.cmdnote"), false);
  ok(history.canUndo("/workspace/new/file.cmdnote"));
  history.deletePrefix("/workspace/new");
  equal(history.canUndo("/workspace/new/file.cmdnote"), false);
});

test("defaults profile settings and ignores removed Recent data", () => {
  const legacy = normalizeSettings({ recentFiles: ["/Nmap.cmdnote"] } as Partial<AppSettings>);
  equal(legacy.favorites.length, 0);
  equal(legacy.displayName, null);
  equal(legacy.performanceMode, "auto");
  equal(legacy.sectionHighlights.length, 0);
  equal(legacy.customThemes.dark.background, "#0d1117");

  const favorite = { kind: "command", filePath: "/Nmap.cmdnote", commandId: "ping" } as const;
  const normalized = normalizeSettings({
    favorites: [favorite, favorite],
    displayName: "  Quan   Tester  ",
  });
  equal(normalized.favorites.length, 1);
  equal(normalized.displayName, "Quan Tester");
});

test("normalizes backward-compatible Performance Mode settings", () => {
  equal(normalizeSettings({ performanceMode: "low-power" }).performanceMode, "low-power");
  equal(
    normalizeSettings({ performanceMode: "turbo" } as unknown as Partial<AppSettings>).performanceMode,
    "auto",
  );
});

test("normalizes and bounds local Section highlights", () => {
  const valid = { filePath: "/Nmap.cmdnote", sectionId: "discovery", level: "gold" } as const;
  const normalized = normalizeSettings({
    sectionHighlights: [
      valid,
      valid,
      { filePath: "/Nmap.cmdnote", sectionId: "invalid", level: "blue" },
    ],
  } as Partial<AppSettings>);
  equal(normalized.sectionHighlights.length, 1);
  equal(normalized.sectionHighlights[0]?.level, "gold");

  const bounded = normalizeSettings({
    sectionHighlights: Array.from({ length: 1_010 }, (_, index) => ({
      filePath: `/file-${index}.cmdnote`,
      sectionId: `section-${index}`,
      level: "red" as const,
    })),
  });
  equal(bounded.sectionHighlights.length, 1_000);
});

test("normalizes custom themes independently for Dark and Light", () => {
  const normalized = normalizeSettings({
    customThemes: {
      dark: { enabled: true, background: "#112233", text: "#DDEEFF", accent: "#00AACC" },
      light: { enabled: true, background: "invalid", text: "#123456", accent: "#654321" },
    },
  });
  equal(normalized.customThemes.dark.background, "#112233");
  equal(normalized.customThemes.dark.text, "#ddeeff");
  equal(normalized.customThemes.light.background, "#f5f7fa");
  equal(normalized.customThemes.light.text, "#123456");
});

test("accepts and deduplicates folder favorites independently from files", () => {
  const normalized = normalizeSettings({
    favorites: [
      { kind: "folder", path: "/workspace/Network" },
      { kind: "folder", path: "/workspace/Network" },
      { kind: "file", path: "/workspace/Network" },
    ],
  });
  equal(normalized.favorites.length, 2);
  equal(normalized.favorites[0]?.kind, "folder");
  equal(normalized.favorites[1]?.kind, "file");
});

test("calculates deterministic theme contrast ratios", () => {
  equal(Number(contrastRatio("#000000", "#ffffff").toFixed(1)), 21);
  ok(contrastRatio("#d8dee9", "#0d1117") > 10);
  equal(mixHex("#000000", "#ffffff", 0.5), "#808080");
});

let failures = 0;
for (const current of tests) {
  try {
    current.run();
    console.log(`✓ ${current.name}`);
  } catch (error) {
    failures += 1;
    console.error(`✗ ${current.name}`);
    console.error(error);
  }
}

if (failures > 0) {
  throw new Error(`${failures} validation test${failures === 1 ? "" : "s"} failed.`);
}

function test(name: string, run: () => void): void {
  tests.push({ name, run });
}

function equal<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}.`);
  }
}

function ok(value: boolean): asserts value {
  if (!value) {
    throw new Error("Expected a truthy value.");
  }
}

function searchFixture() {
  return [
    createSearchDocument(
      "Nmap service detection",
      [
        { text: "Nmap service detection", priority: 3 },
        { text: "Scan services and versions", priority: 1 },
      ],
      0,
    ),
    createSearchDocument(
      "PostgreSQL reference",
      [{ text: "PostgreSQL database commands", priority: 3 }],
      1,
    ),
    createSearchDocument(
      "Password recovery",
      [{ text: "Khôi phục mật khẩu bằng wordlist", priority: 3 }],
      2,
    ),
  ];
}
