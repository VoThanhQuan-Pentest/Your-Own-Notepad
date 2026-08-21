import { parseCommandFile, serializeCommandFile } from "../utils/validation";
import { createId } from "../utils/ids";
import { extractVariableNames, renderCommandTemplate } from "../utils/variables";
import { supportsDirectRun, tokenizeStructuredCommand } from "../utils/command-safety";
import { hasTableImportErrors, parseTablePaste } from "../utils/table-import";

interface TestCase {
  name: string;
  run: () => void;
}

const tests: TestCase[] = [];

const validSource = JSON.stringify({
  version: 1,
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
          command: "nmap -sn {{target}}",
          action: "run",
          risk: "safe",
          variables: [{ name: "target", default: "192.168.1.0/24" }],
        },
      ],
    },
  ],
});

test("parses a valid version 1 command file", () => {
  const result = parseCommandFile(validSource);
  equal(result.ok, true);
  if (result.ok) {
    equal(result.data.sections[0]?.commands[0]?.name, "Ping scan");
  }
});

test("preserves backward-compatible compact table sections", () => {
  const value = JSON.parse(validSource) as {
    sections: Array<Record<string, unknown>>;
  };
  const first = value.sections[0];
  ok(first !== undefined);
  first.layout = "table";
  const result = parseCommandFile(JSON.stringify(value));
  equal(result.ok, true);
  if (result.ok) {
    equal(result.data.sections[0]?.layout, "table");
  }
});

test("rejects unknown section layouts", () => {
  const value = JSON.parse(validSource) as {
    sections: Array<Record<string, unknown>>;
  };
  const first = value.sections[0];
  ok(first !== undefined);
  first.layout = "cards";
  const result = parseCommandFile(JSON.stringify(value));
  equal(result.ok, false);
  if (!result.ok) {
    ok(result.error.issues.some((issue) => issue.path.endsWith(".layout")));
  }
});

test("returns a friendly invalid JSON result", () => {
  const result = parseCommandFile('{"version": 1,');
  equal(result.ok, false);
  if (!result.ok) {
    equal(result.error.kind, "invalid-json");
  }
});

test("rejects unsupported file versions", () => {
  const result = parseCommandFile('{"version":2,"title":"Future","sections":[]}');
  equal(result.ok, false);
  if (!result.ok) {
    equal(result.error.kind, "unsupported-version");
  }
});

test("reports schema paths without throwing", () => {
  const result = parseCommandFile(
    '{"version":1,"title":"","sections":[{"id":"one","title":"A","commands":[{"id":"x","name":"","command":3,"action":"shell","risk":"unknown"}]}]}',
  );
  equal(result.ok, false);
  if (!result.ok) {
    equal(result.error.kind, "invalid-schema");
    ok(result.error.issues.some((issue) => issue.path === "$.title"));
    ok(result.error.issues.some((issue) => issue.path.endsWith(".command")));
  }
});

test("rejects duplicate ids and variable names", () => {
  const value = JSON.parse(validSource) as {
    sections: Array<{ commands: Array<Record<string, unknown>> }>;
  };
  const first = value.sections[0]?.commands[0];
  ok(first !== undefined);
  value.sections[0]?.commands.push({
    ...first,
    variables: [
      { name: "target", default: "one" },
      { name: "target", default: "two" },
    ],
  });
  const result = parseCommandFile(JSON.stringify(value));
  equal(result.ok, false);
  if (!result.ok) {
    ok(result.error.issues.some((issue) => issue.message.includes("Duplicate command id")));
    ok(result.error.issues.some((issue) => issue.message.includes("Duplicate variable name")));
  }
});

test("serializes readable UTF-8 JSON with a trailing newline", () => {
  const result = parseCommandFile(validSource);
  equal(result.ok, true);
  if (result.ok) {
    const serialized = serializeCommandFile(result.data);
    ok(serialized.includes('\n  "title": "Nmap"'));
    ok(serialized.endsWith("\n"));
  }
});

test("substitutes variables without interpreting replacement characters", () => {
  const values = new Map([
    ["target", "host-$&"],
    ["port", "443"],
  ]);
  equal(
    renderCommandTemplate("nmap -p {{ port }} {{target}} {{missing}}", values),
    "nmap -p 443 host-$& {{missing}}",
  );
});

test("creates stable unique readable ids", () => {
  const existing = new Set(["port-scanning", "port-scanning-2"]);
  equal(createId("Port Scanning", existing), "port-scanning-3");
  equal(createId("Tấn công mạng", new Set()), "tan-cong-mang");
});

test("extracts unique variables from templates in display order", () => {
  equal(
    JSON.stringify(extractVariableNames("tool {{ target }} -p {{port}} {{target}}")),
    JSON.stringify(["target", "port"]),
  );
});

test("allows structured execution and rejects shell-backed commands", () => {
  ok(supportsDirectRun("nmap -sV 192.168.1.10"));
  ok(!supportsDirectRun("sudo nmap -sS target"));
  ok(!supportsDirectRun("/usr/bin/sudo nmap -sS target"));
  ok(!supportsDirectRun("bash -c 'echo unsafe'"));
  ok(!supportsDirectRun("bash script.sh"));
  ok(!supportsDirectRun("/bin/sh -c whoami"));
  ok(!supportsDirectRun("MODE=fast tool"));
  ok(!supportsDirectRun("cat file | grep value"));
  ok(!supportsDirectRun("nmap 'unclosed"));
  equal(
    JSON.stringify(tokenizeStructuredCommand("nmap -p \"22, 80\" 'example host'")),
    JSON.stringify(["nmap", "-p", "22, 80", "example host"]),
  );
});

test("imports a fenced Markdown table with Vietnamese headers", () => {
  const preview = parseTablePaste(
    `GPT output:\n\n\`\`\`markdown\n| Port | Dịch vụ | Mô tả | Hành động | Rủi ro | Biến |\n| --- | --- | --- | --- | --- | --- |\n| 443 | HTTPS | Scan an HTTPS service | Open Terminal | Cảnh báo | target=192.168.1.10; ports=443 |\n| 53 | DNS | Scan a DNS service | Copy | An toàn | |\n\`\`\``,
    "Common Ports",
    new Set(["common-ports-row-1"]),
  );
  equal(preview.format, "markdown");
  equal(hasTableImportErrors(preview), false);
  equal(preview.commands.length, 2);
  equal(preview.commands[0]?.id, "common-ports-row-1-2");
  equal(preview.commands[0]?.name, "Table Row 1");
  equal(preview.commands[0]?.command, "443");
  equal(preview.commands[0]?.action, "open-terminal");
  equal(preview.commands[0]?.risk, "caution");
  equal(preview.commands[0]?.variables?.[0]?.default, "192.168.1.10");
  ok(Boolean(preview.commands[0]?.notes?.includes("Dịch vụ: HTTPS")));
});

test("imports TSV and CSV with quoted values", () => {
  const tsv = parseTablePaste(
    "Command\tInformation\tRisk\nnmap -sV {{target}}\tService detection\tDanger",
    "Nmap",
    new Set(),
  );
  equal(tsv.format, "tsv");
  equal(hasTableImportErrors(tsv), false);
  equal(tsv.commands[0]?.description, "Service detection");
  equal(tsv.commands[0]?.risk, "danger");

  const csv = parseTablePaste(
    'Command,Description,Notes\n"nmap -p ""22,80"" {{target}}","Comma, kept","Line one\nLine two"',
    "Quoted CSV",
    new Set(),
  );
  equal(csv.format, "csv");
  equal(hasTableImportErrors(csv), false);
  equal(csv.commands[0]?.command, 'nmap -p "22,80" {{target}}');
  equal(csv.commands[0]?.description, "Comma, kept");
  equal(csv.commands[0]?.notes, "Line one\nLine two");
});

test("keeps unknown columns and rejects invalid pasted rows", () => {
  const unknowns = parseTablePaste(
    "Port,Service,State\n22,SSH,open",
    "Ports",
    new Set(),
  );
  equal(hasTableImportErrors(unknowns), false);
  equal(unknowns.commands[0]?.description, "Service: SSH");
  equal(unknowns.commands[0]?.notes, "State: open");
  ok(unknowns.issues.some((issue) => issue.severity === "warning"));

  const invalid = parseTablePaste(
    "Command,Risk,Variables\nnmap -sV target,urgent,1bad=value",
    "Bad Import",
    new Set(),
  );
  equal(hasTableImportErrors(invalid), true);
  ok(invalid.issues.some((issue) => issue.message.includes("Unknown Risk")));
  ok(invalid.issues.some((issue) => issue.message.includes("Invalid variable")));
});

test("requires a recognized command column and complete rows", () => {
  const missingCommand = parseTablePaste("Name,Description\nHTTPS,Service", "Broken", new Set());
  equal(hasTableImportErrors(missingCommand), true);
  ok(missingCommand.issues.some((issue) => issue.message.includes("Command, Port, or Value")));

  const incomplete = parseTablePaste("Command,Description\nnmap -sV", "Broken", new Set());
  equal(hasTableImportErrors(incomplete), true);
  ok(incomplete.issues.some((issue) => issue.message.includes("Expected 2 columns")));
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

console.log(`\n${tests.length} validation tests passed.`);

function test(name: string, run: () => void): void {
  tests.push({ name, run });
}

function ok(condition: boolean): asserts condition {
  if (!condition) {
    throw new Error("Expected condition to be true.");
  }
}

function equal(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}.`);
  }
}
