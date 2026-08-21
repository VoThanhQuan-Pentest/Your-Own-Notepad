import { parseCommandFile, serializeCommandFile } from "../utils/validation";
import { createId } from "../utils/ids";
import { extractVariableNames, renderCommandTemplate } from "../utils/variables";
import { supportsDirectRun, tokenizeStructuredCommand } from "../utils/command-safety";

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
