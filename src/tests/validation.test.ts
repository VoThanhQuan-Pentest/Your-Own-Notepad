import { createId } from "../utils/ids";
import { hasTableImportErrors, parseTablePaste } from "../utils/table-import";
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
