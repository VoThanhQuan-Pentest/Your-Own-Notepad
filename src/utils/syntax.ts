import { element } from "./dom";

/**
 * Token types for command line syntax highlighting
 */
export type TokenType =
  | "cmd"
  | "flag"
  | "string"
  | "target"
  | "var"
  | "op"
  | "arg"
  | "whitespace";

interface Token {
  type: TokenType;
  text: string;
}

const OPERATOR_REGEX = /^(\|\||&&|\||;|>>|>|<|2>&1)/;
const FLAG_REGEX = /^(--[a-zA-Z0-9_-]+|-[a-zA-Z0-9]+)/;
const STRING_REGEX = /^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/;
const TARGET_REGEX = /^(https?:\/\/[^\s]+|(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?|:\d{2,5}\b)/;
const VAR_REGEX = /^(\$[a-zA-Z_][a-zA-Z0-9_]*|\$\{[^}]+\})/;
const WHITESPACE_REGEX = /^(\s+)/;
const WORD_REGEX = /^([^\s|&;><"'$]+)/;

const COMMAND_MODIFIERS = new Set(["sudo", "doas", "nohup", "time", "eval", "exec", "env"]);

export function tokenizeCommandLine(cmd: string): Token[] {
  const tokens: Token[] = [];
  let remaining = cmd;
  let expectCommand = true;

  while (remaining.length > 0) {
    // 1. Whitespace
    const wsMatch = remaining.match(WHITESPACE_REGEX);
    if (wsMatch) {
      tokens.push({ type: "whitespace", text: wsMatch[0] });
      remaining = remaining.slice(wsMatch[0].length);
      continue;
    }

    // 2. Operators (| && || ; > >>)
    const opMatch = remaining.match(OPERATOR_REGEX);
    if (opMatch) {
      tokens.push({ type: "op", text: opMatch[0] });
      remaining = remaining.slice(opMatch[0].length);
      expectCommand = true;
      continue;
    }

    // 3. Quoted Strings
    const strMatch = remaining.match(STRING_REGEX);
    if (strMatch) {
      tokens.push({ type: "string", text: strMatch[0] });
      remaining = remaining.slice(strMatch[0].length);
      expectCommand = false;
      continue;
    }

    // 4. Variables ($VAR, ${VAR})
    const varMatch = remaining.match(VAR_REGEX);
    if (varMatch) {
      tokens.push({ type: "var", text: varMatch[0] });
      remaining = remaining.slice(varMatch[0].length);
      expectCommand = false;
      continue;
    }

    // 5. Flags (--flag, -f)
    const flagMatch = remaining.match(FLAG_REGEX);
    if (flagMatch) {
      tokens.push({ type: "flag", text: flagMatch[0] });
      remaining = remaining.slice(flagMatch[0].length);
      expectCommand = false;
      continue;
    }

    // 6. Network Targets (IPs, Ports, URLs)
    const targetMatch = remaining.match(TARGET_REGEX);
    if (targetMatch) {
      tokens.push({ type: "target", text: targetMatch[0] });
      remaining = remaining.slice(targetMatch[0].length);
      expectCommand = false;
      continue;
    }

    // 7. General Words (Command or Argument)
    const wordMatch = remaining.match(WORD_REGEX);
    if (wordMatch) {
      const word = wordMatch[0];
      if (expectCommand) {
        tokens.push({ type: "cmd", text: word });
        if (!COMMAND_MODIFIERS.has(word.toLowerCase())) {
          expectCommand = false;
        }
      } else {
        tokens.push({ type: "arg", text: word });
      }
      remaining = remaining.slice(word.length);
      continue;
    }

    // Fallback: take 1 char
    tokens.push({ type: "arg", text: remaining[0] });
    remaining = remaining.slice(1);
  }

  return tokens;
}

/**
 * Renders highlighted tokens into a target <code> element.
 * If not in full performance mode, renders plain text to conserve resources.
 */
export function renderHighlightedCommand(
  container: HTMLElement,
  command: string,
  isFullPerformance = false,
): void {
  if (!isFullPerformance) {
    container.textContent = command;
    return;
  }

  const tokens = tokenizeCommandLine(command);
  const fragment = document.createDocumentFragment();

  for (const token of tokens) {
    if (token.type === "whitespace" || token.type === "arg") {
      fragment.append(document.createTextNode(token.text));
    } else {
      const span = element("span", `syntax-${token.type}`, token.text);
      fragment.append(span);
    }
  }

  container.replaceChildren(fragment);
}
