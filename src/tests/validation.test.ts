import { createId } from "../utils/ids";
import { SessionHistory } from "../utils/history";
import { normalizeDisplayName, normalizeSettings } from "../services/settings";
import { PerformanceController } from "../services/performance";
import { WorkspaceWorkerClient } from "../services/workspace-worker";
import type { CommandFile } from "../models/command-file";
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
import {
  extractPlaceholders,
  injectVariables,
  resolveCanonicalKey,
  type TacticalVariables,
} from "../services/variables";
import { commandFileLabel } from "../components/workspace-tabs";

interface TestCase {
  name: string;
  run: () => void | Promise<void>;
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

test("BUG-001: preserves backslashes in Markdown commands while allowing escaped pipe", () => {
  const table = [
    "| Command | Description |",
    "|---|---|",
    "| dir C:\\Windows\\System32 | Windows path |",
    "| C:\\Users\\quan | User path |",
    "| Get-ChildItem C:\\Windows | PowerShell command |",
    "| reg query HKLM\\Software\\Microsoft | Registry query |",
    "| \\\\server\\share | UNC share |",
    "| .\\script.ps1 | Dot slash path |",
    "| echo foo\\|bar | Escaped pipe |",
    "| dir C:\\path\\ | Trailing backslash |",
    "| foo\\\\bar | Multiple backslashes |",
  ].join("\n");

  const preview = parseTablePaste(table, "Windows Commands", new Set());
  equal(hasTableImportErrors(preview), false);
  equal(preview.commands[0]?.command, "dir C:\\Windows\\System32");
  equal(preview.commands[1]?.command, "C:\\Users\\quan");
  equal(preview.commands[2]?.command, "Get-ChildItem C:\\Windows");
  equal(preview.commands[3]?.command, "reg query HKLM\\Software\\Microsoft");
  equal(preview.commands[4]?.command, "\\\\server\\share");
  equal(preview.commands[5]?.command, ".\\script.ps1");
  equal(preview.commands[6]?.command, "echo foo|bar");
  equal(preview.commands[7]?.command, "dir C:\\path\\");
  equal(preview.commands[8]?.command, "foo\\\\bar");
});

test("BUG-002: preserves quotes in TSV and keeps CSV quoting intact", () => {
  const tsv = [
    "Command\tDescription",
    'echo "hello world"\tDouble quotes',
    'powershell -Command "Get-Process"\tPowerShell quotes',
    'curl -d \'{"key": "val"}\'\tJSON payload',
    "empty cell test\t",
  ].join("\n");

  const tsvPreview = parseTablePaste(tsv, "TSV Commands", new Set());
  equal(hasTableImportErrors(tsvPreview), false);
  equal(tsvPreview.commands[0]?.command, 'echo "hello world"');
  equal(tsvPreview.commands[1]?.command, 'powershell -Command "Get-Process"');
  equal(tsvPreview.commands[2]?.command, 'curl -d \'{"key": "val"}\'');
  equal(tsvPreview.commands[3]?.command, "empty cell test");

  const csv = [
    "Command,Description",
    '"echo ""hello world""",Quoted example',
    '"echo a, b, and c",Comma in quote',
  ].join("\n");

  const csvPreview = parseTablePaste(csv, "CSV Commands", new Set());
  equal(hasTableImportErrors(csvPreview), false);
  equal(csvPreview.commands[0]?.command, 'echo "hello world"');
  equal(csvPreview.commands[1]?.command, "echo a, b, and c");

  const badCsv = 'Command,Description\n"unclosed quote,test';
  const badPreview = parseTablePaste(badCsv, "Bad CSV", new Set());
  equal(hasTableImportErrors(badPreview), true);
  ok(badPreview.issues.some((issue) => issue.message.includes("Unclosed quoted value")));
});

test("PHASE 12: comprehensive table import regression suite", () => {
  // Real world commands with Vietnamese headers
  const vietnameseMarkdown = [
    "| Lệnh | Dịch vụ | Mô tả | Ví dụ | Ghi chú |",
    "|---|---|---|---|---|",
    "| dir C:\\Windows\\System32 | cmd | Xem thư mục hệ thống | dir C:\\Windows | Cần quyền admin |",
    "| Get-ChildItem \"C:\\Program Files\" | powershell | Danh sách ứng dụng | Get-ChildItem | PowerShell 5+ |",
    "| powershell -Command \"Get-Process \\| Sort-Object CPU\" | powershell | Sắp xếp CPU | powershell | Escaped pipe test |",
    "| ssh user@192.168.1.10 | ssh | Kết nối máy chủ từ xa | ssh -p 22 user@host | SSH key auth |",
    "| reg query \"HKLM\\Software\\Microsoft\" | reg | Truy vấn registry Windows | reg query | Registry query |",
  ].join("\n");

  const preview = parseTablePaste(vietnameseMarkdown, "VN Commands", new Set());
  equal(hasTableImportErrors(preview), false);
  equal(preview.commands.length, 5);
  equal(preview.commands[0]?.command, "dir C:\\Windows\\System32\tcmd");
  equal(preview.commands[0]?.description, "Xem thư mục hệ thống");
  equal(preview.commands[1]?.command, "Get-ChildItem \"C:\\Program Files\"\tpowershell");
  equal(preview.commands[2]?.command, "powershell -Command \"Get-Process | Sort-Object CPU\"\tpowershell");
  equal(preview.commands[3]?.command, "ssh user@192.168.1.10\tssh");
  equal(preview.commands[4]?.command, "reg query \"HKLM\\Software\\Microsoft\"\treg");

  // Unknown columns: first fills empty description, remaining kept in Notes
  const unknownCols = [
    "Command,Protocol,Owner",
    "80,TCP,Apache",
  ].join("\n");
  const unknownPreview = parseTablePaste(unknownCols, "Unknown", new Set());
  equal(hasTableImportErrors(unknownPreview), false);
  equal(unknownPreview.commands[0]?.description, "Protocol: TCP");
  ok(Boolean(unknownPreview.commands[0]?.notes?.includes("Owner: Apache")));
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

test("BUG-003 & PHASE 13: search parity between Worker and Fallback implementations", () => {
  const dataset: CommandFile = {
    version: 2,
    title: "Test Workspace",
    description: "Search parity dataset",
    sections: [
      {
        id: "sec-ssh",
        title: "SSH Section",
        commands: [
          { id: "c-ssh-1", name: "SSH Client", command: "ssh user@192.168.1.10" },
          { id: "c-ssh-2", name: "SSH Pass", command: "sshpass -p secret ssh user@host" },
          { id: "c-ssh-3", name: "Auto SSH", command: "autossh -M 0 -N host" },
        ],
      },
      {
        id: "sec-tools",
        title: "Network & DB Tools",
        commands: [
          { id: "c-nmap-1", name: "Nmap scan", command: "nmap -sS target" },
          { id: "c-psql-1", name: "PostgreSQL Client", command: "psql -U postgres -d main" },
          { id: "c-git-1", name: "Git Status", command: "git status --short" },
          { id: "c-curl-1", name: "cURL Header", command: "curl -I https://api.local" },
          { id: "c-pw-1", name: "Mật khẩu", command: "john --wordlist=pass.txt hash.txt", description: "Khôi phục mật khẩu" },
        ],
      },
    ],
  };

  const documents = dataset.sections.flatMap((section) =>
    section.commands.map((cmd) =>
      createSearchDocument(
        { sectionId: section.id, commandId: cmd.id, name: cmd.name, command: cmd.command },
        [
          { text: cmd.name, priority: 3 },
          { text: cmd.command, priority: 3 },
          { text: section.title, priority: 2 },
          { text: cmd.description, priority: 1 },
        ],
        0,
      ),
    ),
  );

  const queries = [
    "ssh",
    "nmap",
    "namp",
    "postgres",
    "postgrsxl",
    "git",
    "curl",
    "mat khau",
    "mật khẩu",
  ];

  for (const query of queries) {
    const workerRanked = rankSearchDocuments(documents, query, 50);
    const fallbackRanked = rankSearchDocuments(documents, query, 50);
    equal(workerRanked.length, fallbackRanked.length);
    for (let i = 0; i < workerRanked.length; i += 1) {
      equal(workerRanked[i]?.result.commandId, fallbackRanked[i]?.result.commandId);
      equal(workerRanked[i]?.matchKind, fallbackRanked[i]?.matchKind);
    }
  }

  const sshResults = rankSearchDocuments(documents, "ssh", 10);
  const foundCommands = sshResults.map((r) => r.result.commandId);
  ok(foundCommands.includes("c-ssh-1"));
  ok(foundCommands.includes("c-ssh-2"));
  ok(foundCommands.includes("c-ssh-3"));

  const nampResults = rankSearchDocuments(documents, "namp", 10);
  equal(nampResults[0]?.result.commandId, "c-nmap-1");

  const postgrsxlResults = rankSearchDocuments(documents, "postgrsxl", 10);
  equal(postgrsxlResults[0]?.result.commandId, "c-psql-1");

  const vnResults = rankSearchDocuments(documents, "mat khau", 10);
  equal(vnResults[0]?.result.commandId, "c-pw-1");
});

test("BUG-004: WorkspaceWorkerClient reset race condition drops stale generation results", async () => {
  const client = new WorkspaceWorkerClient();
  client.reset(1);
  client.upsertFiles([
    {
      path: "/workspace/A.cmdnote",
      file: {
        version: 2,
        title: "Workspace A",
        sections: [
          {
            id: "sec-a",
            title: "Section A",
            commands: [{ id: "cmd-a", name: "Alpha", command: "ssh alpha.local" }],
          },
        ],
      },
    },
  ]);
  client.reset(2);
  client.upsertFiles([
    {
      path: "/workspace/B.cmdnote",
      file: {
        version: 2,
        title: "Workspace B",
        sections: [
          {
            id: "sec-b",
            title: "Section B",
            commands: [{ id: "cmd-b", name: "Beta", command: "ssh beta.local" }],
          },
        ],
      },
    },
  ]);

  const results = await client.search("ssh", 10);
  equal(results.length, 1);
  equal(results[0]?.filePath, "/workspace/B.cmdnote");
  equal(results[0]?.commandId, "cmd-b");

  client.reset(3);
  client.reset(4);
  client.reset(5);
  const emptyResults = await client.search("ssh", 10);
  equal(emptyResults.length, 0);
});

test("BUG-009: Compact Table dynamic row number in search matches UI position", async () => {
  const client = new WorkspaceWorkerClient();
  client.reset(1);
  const file: CommandFile = {
    version: 2,
    title: "Services",
    sections: [
      {
        id: "tbl-sec",
        title: "Common Ports",
        layout: "table",
        commands: [
          { id: "c1", name: "Table Row 1", command: "80\tHTTP" },
          { id: "c2", name: "Table Row 2", command: "443\tHTTPS" },
          { id: "c3", name: "Table Row 3", command: "8080\tHTTP-Proxy" },
        ],
      },
    ],
  };
  client.upsertFiles([{ path: "/workspace/Services.cmdnote", file }]);
  const res1 = await client.search("80", 5);
  const res2 = await client.search("443", 5);
  const res3 = await client.search("8080", 5);
  equal(res1.find((r) => r.commandId === "c1")?.commandName, "Table Row 01");
  equal(res2.find((r) => r.commandId === "c2")?.commandName, "Table Row 02");
  equal(res3.find((r) => r.commandId === "c3")?.commandName, "Table Row 03");

  const reordered: CommandFile = {
    ...file,
    sections: [
      {
        ...file.sections[0]!,
        commands: [
          { id: "c3", name: "Table Row 3", command: "8080\tHTTP-Proxy" },
          { id: "c1", name: "Table Row 1", command: "80\tHTTP" },
          { id: "c2", name: "Table Row 2", command: "443\tHTTPS" },
        ],
      },
    ],
  };
  client.upsertFiles([{ path: "/workspace/Services.cmdnote", file: reordered }]);
  const reorderedRes3 = await client.search("8080", 5);
  const reorderedRes1 = await client.search("80", 5);
  const reorderedRes2 = await client.search("443", 5);
  equal(reorderedRes3.find((r) => r.commandId === "c3")?.commandName, "Table Row 01");
  equal(reorderedRes1.find((r) => r.commandId === "c1")?.commandName, "Table Row 02");
  equal(reorderedRes2.find((r) => r.commandId === "c2")?.commandName, "Table Row 03");
});

test("BUG-010: Profile display name validation and maxlength bounds", () => {
  equal(normalizeDisplayName("  Quan  Tester  "), "Quan Tester");
  equal(normalizeDisplayName("a".repeat(32)), "a".repeat(32));
  equal(normalizeDisplayName("a".repeat(33)), null);
  equal(normalizeDisplayName(""), null);
  equal(normalizeDisplayName("   "), null);
  equal(normalizeDisplayName("Nguyễn Văn A"), "Nguyễn Văn A");
});

test("PHASE 1: Startup mode preferences and settings normalization", () => {
  const defaults = normalizeSettings({});
  equal(defaults.startupModePreference, "ask");
  equal(defaults.lastStartupMode, null);
  equal(defaults.startupInProgress, false);
  equal(defaults.bootSequenceStyle, "mechanical-iris");

  const custom = normalizeSettings({
    startupModePreference: "battery-saver",
    lastStartupMode: "performance",
    startupInProgress: true,
    bootSequenceStyle: "blast-door",
  });
  equal(custom.startupModePreference, "battery-saver");
  equal(custom.lastStartupMode, "performance");
  equal(custom.startupInProgress, true);
  equal(custom.bootSequenceStyle, "blast-door");

  const invalid = normalizeSettings({
    startupModePreference: "invalid" as any,
    lastStartupMode: "invalid" as any,
    startupInProgress: "yes" as any,
    bootSequenceStyle: "unknown-style" as any,
  });
  equal(invalid.startupModePreference, "ask");
  equal(invalid.lastStartupMode, null);
  equal(invalid.startupInProgress, false);
  equal(invalid.bootSequenceStyle, "mechanical-iris");
});

test("PHASE 2 & 3: PerformanceController runtime profiles and startup modes", () => {
  const controller = new PerformanceController();

  controller.applyStartupMode("battery-saver");
  const batteryProfile = controller.profile();
  equal(batteryProfile.mode, "low-power");
  equal(batteryProfile.searchDebounceMs, 220);
  equal(batteryProfile.animationsEnabled, false);
  equal(batteryProfile.fileTransitionsEnabled, false);
  equal(batteryProfile.workerBatchSize, 75);
  equal(batteryProfile.workerYieldMs, 5);
  equal(batteryProfile.virtualRowOverscan, 4);
  equal(batteryProfile.preloadFiles, false);
  equal(batteryProfile.fileMotion, "none");
  equal(batteryProfile.sectionMotionScale, 0);

  controller.applyStartupMode("performance");
  const perfProfile = controller.profile();
  equal(perfProfile.mode, "full");
  equal(perfProfile.searchDebounceMs, 90);
  equal(perfProfile.animationsEnabled, true);
  equal(perfProfile.fileTransitionsEnabled, true);
  equal(perfProfile.workerBatchSize, 400);
  equal(perfProfile.workerYieldMs, 10);
  equal(perfProfile.virtualRowOverscan, 12);
  equal(perfProfile.preloadFiles, true);
  equal(perfProfile.fileMotion, "full");
  equal(perfProfile.sectionMotionScale, 1);
});

test("PHASE 6: Performance fallback to balanced on sustained slow tasks and recovery", () => {
  const controller = new PerformanceController();
  controller.applyStartupMode("performance");
  equal(controller.profile().mode, "full");

  let noticeReceived: string | null = null;
  controller.onFallbackNotification((msg) => {
    noticeReceived = msg;
  });

  // Trigger downgrade via slow task (> 250ms)
  controller.record("heavy-task", 320);
  equal(controller.profile().mode, "balanced");
  equal(noticeReceived, "Performance temporarily reduced to keep Command Vault responsive.");

  // Stable period (15 fast interactions <= 80ms) recovers back to full
  for (let i = 0; i < 15; i++) {
    controller.record("input-to-paint", 30);
  }
  equal(controller.profile().mode, "full");

  // Battery saver never auto-upgrades even after 50 fast interactions
  controller.applyStartupMode("battery-saver");
  for (let i = 0; i < 50; i++) {
    controller.record("input-to-paint", 20);
  }
  equal(controller.profile().mode, "low-power");
});

test("PHASE 5: WorkerClient configure profile supports custom batching", () => {
  const client = new WorkspaceWorkerClient();
  client.reset(1);
  client.configure(1, { batchSize: 75, yieldMs: 5 });
  ok(true);
});

test("TACTICAL VARIABLES: canonical alias resolution works for common pentest terms", () => {
  equal(resolveCanonicalKey("TARGET_IP"), "TARGET");
  equal(resolveCanonicalKey("RHOST"), "TARGET");
  equal(resolveCanonicalKey("rhosts"), "TARGET");
  equal(resolveCanonicalKey("ip"), "TARGET");
  equal(resolveCanonicalKey("RPORT"), "PORT");
  equal(resolveCanonicalKey("local_ip"), "LHOST");
  equal(resolveCanonicalKey("ATTACKER_PORT"), "LPORT");
  equal(resolveCanonicalKey("wordlists"), "WORDLIST");
  equal(resolveCanonicalKey("ADMIN"), "USER");
  equal(resolveCanonicalKey("CUSTOM_KEY"), "CUSTOM_KEY");
});

test("TACTICAL VARIABLES: placeholder extraction handles <VAR>, {var}, and $VAR styles", () => {
  const command = "nmap -sV -p <PORT> <TARGET_IP> --script {script} -e $INTERFACE";
  const placeholders = extractPlaceholders(command);
  equal(placeholders.length, 4);
  equal(placeholders[0]?.rawPlaceholder, "<PORT>");
  equal(placeholders[0]?.canonicalKey, "PORT");
  equal(placeholders[1]?.rawPlaceholder, "<TARGET_IP>");
  equal(placeholders[1]?.canonicalKey, "TARGET");
  equal(placeholders[2]?.rawPlaceholder, "{script}");
  equal(placeholders[2]?.canonicalKey, "SCRIPT");
  equal(placeholders[3]?.rawPlaceholder, "$INTERFACE");
  equal(placeholders[3]?.canonicalKey, "INTERFACE");
});

test("TACTICAL VARIABLES: injectVariables substitutes defined values and identifies missing ones", () => {
  const testVars: TacticalVariables = {
    TARGET: "10.10.11.45",
    PORT: "8080",
    LHOST: "10.10.14.2",
    LPORT: "4444",
    WORDLIST: "",
    USER: "root",
    custom: { DOMAIN: "corp.local" },
  };

  const command = "sqlmap -u http://<TARGET_IP>:<PORT>/login -p <INJECT_PARAM> --user={user} -d $DOMAIN";
  const result = injectVariables(command, testVars);

  equal(result.hasPlaceholders, true);
  // <TARGET_IP>, <PORT>, {user}, $DOMAIN are substituted
  ok(result.injected.includes("http://10.10.11.45:8080/login"));
  ok(result.injected.includes("--user=root"));
  ok(result.injected.includes("-d corp.local"));
  // <INJECT_PARAM> is missing
  ok(result.injected.includes("<INJECT_PARAM>"));
  equal(result.missing.length, 1);
  equal(result.missing[0]?.rawPlaceholder, "<INJECT_PARAM>");
  equal(result.replaced.length, 4);
});

test("WORKSPACE TABS: commandFileLabel strips directory paths and .cmdnote extension", () => {
  equal(commandFileLabel("/home/pentest/Recon.cmdnote"), "Recon");
  equal(commandFileLabel("C:\\Vault\\Windows PrivEsc.cmdnote"), "Windows PrivEsc");
  equal(commandFileLabel("Nmap.cmdnote"), "Nmap");
});

async function runAllTests(): Promise<void> {
  let failures = 0;
  for (const current of tests) {
    try {
      await current.run();
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
}

export const testPromise = runAllTests();

function test(name: string, run: () => void | Promise<void>): void {
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
