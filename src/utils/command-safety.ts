const SHELL_METACHARACTERS = /[|&;><$`*?\[\]{}()~\r\n]/;
const SHELL_PROGRAMS = new Set([
  "sh",
  "bash",
  "dash",
  "zsh",
  "fish",
  "cmd",
  "cmd.exe",
  "powershell",
  "powershell.exe",
  "pwsh",
  "pwsh.exe",
]);
const ELEVATION_PROGRAMS = new Set(["sudo", "su", "doas"]);

export function supportsDirectRun(command: string): boolean {
  if (SHELL_METACHARACTERS.test(command)) {
    return false;
  }
  const parts = tokenizeStructuredCommand(command);
  if (!parts || parts.length === 0 || !parts[0]) {
    return false;
  }

  const program = basename(parts[0]).toLocaleLowerCase();
  if (ELEVATION_PROGRAMS.has(program)) {
    return false;
  }
  if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(parts[0])) {
    return false;
  }

  return !SHELL_PROGRAMS.has(program);
}

export function tokenizeStructuredCommand(source: string): string[] | null {
  const parts: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let tokenStarted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] as string;
    if (quote && character === quote) {
      quote = null;
      tokenStarted = true;
    } else if (quote === "'") {
      current += character;
      tokenStarted = true;
    } else if (character === "\\") {
      index += 1;
      if (index >= source.length) {
        return null;
      }
      current += source[index];
      tokenStarted = true;
    } else if (quote === '"') {
      current += character;
      tokenStarted = true;
    } else if (character === "'" || character === '"') {
      quote = character;
      tokenStarted = true;
    } else if (/\s/.test(character)) {
      if (tokenStarted) {
        parts.push(current);
        current = "";
        tokenStarted = false;
      }
    } else {
      current += character;
      tokenStarted = true;
    }
  }

  if (quote || !tokenStarted && parts.length === 0) {
    return null;
  }
  if (tokenStarted) {
    parts.push(current);
  }
  return parts;
}

function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? path;
}
