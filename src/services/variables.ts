export interface TacticalVariables {
  TARGET: string;
  PORT: string;
  LHOST: string;
  LPORT: string;
  WORDLIST: string;
  USER: string;
  custom: Record<string, string>;
}

export interface ExtractedVariable {
  rawPlaceholder: string;
  canonicalKey: string;
}

export interface ReplacedVariable {
  placeholder: string;
  key: string;
  value: string;
}

export interface InjectionResult {
  injected: string;
  hasPlaceholders: boolean;
  replaced: ReplacedVariable[];
  missing: ExtractedVariable[];
}

const STORAGE_KEY = "command-vault.tactical-variables";

export const DEFAULT_VARIABLES: TacticalVariables = {
  TARGET: "",
  PORT: "",
  LHOST: "",
  LPORT: "",
  WORDLIST: "",
  USER: "",
  custom: {},
};

// Aliases mapping placeholder names to canonical variable keys
const ALIAS_MAP: Record<string, keyof Omit<TacticalVariables, "custom">> = {
  TARGET: "TARGET",
  TARGET_IP: "TARGET",
  TARGETIP: "TARGET",
  IP: "TARGET",
  RHOST: "TARGET",
  RHOSTS: "TARGET",
  HOST: "TARGET",
  VICTIM: "TARGET",
  URL: "TARGET",

  PORT: "PORT",
  RPORT: "PORT",
  TARGET_PORT: "PORT",

  LHOST: "LHOST",
  LOCAL_IP: "LHOST",
  LOCALIP: "LHOST",
  MY_IP: "LHOST",
  ATTACKER_IP: "LHOST",

  LPORT: "LPORT",
  LOCAL_PORT: "LPORT",
  LOCALPORT: "LPORT",
  ATTACKER_PORT: "LPORT",

  WORDLIST: "WORDLIST",
  WORDLISTS: "WORDLIST",
  DICT: "WORDLIST",
  PASSWORDS: "WORDLIST",

  USER: "USER",
  USERNAME: "USER",
  ADMIN: "USER",
  LOGIN: "USER",
};

export function resolveCanonicalKey(name: string): string {
  const upper = name.trim().toUpperCase();
  return ALIAS_MAP[upper] ?? upper;
}

// Regex to capture:
// 1. Angle brackets: <TARGET>, <TARGET_IP>, <PORT>, <wordlist>, etc.
// 2. Curly braces: {TARGET}, {target}, {PORT}, {lhost}, etc.
// 3. Env style: $TARGET, $LHOST, $PORT, $WORDLIST (capital letters, digits, underscore, at least 2 chars)
const PLACEHOLDER_REGEX = /<([a-zA-Z_][a-zA-Z0-9_-]*)>|\{([a-zA-Z_][a-zA-Z0-9_-]*)\}|\$([A-Z_][A-Z0-9_]{1,})/g;

let cachedVariables: TacticalVariables | null = null;
const listeners = new Set<(vars: TacticalVariables) => void>();

export function getTacticalVariables(): TacticalVariables {
  if (cachedVariables) {
    return cachedVariables;
  }
  if (typeof localStorage === "undefined") {
    cachedVariables = structuredClone(DEFAULT_VARIABLES);
    return cachedVariables;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cachedVariables = structuredClone(DEFAULT_VARIABLES);
      return cachedVariables;
    }
    const parsed = JSON.parse(raw) as Partial<TacticalVariables>;
    cachedVariables = {
      TARGET: typeof parsed.TARGET === "string" ? parsed.TARGET.trim() : "",
      PORT: typeof parsed.PORT === "string" ? parsed.PORT.trim() : "",
      LHOST: typeof parsed.LHOST === "string" ? parsed.LHOST.trim() : "",
      LPORT: typeof parsed.LPORT === "string" ? parsed.LPORT.trim() : "",
      WORDLIST: typeof parsed.WORDLIST === "string" ? parsed.WORDLIST.trim() : "",
      USER: typeof parsed.USER === "string" ? parsed.USER.trim() : "",
      custom: parsed.custom && typeof parsed.custom === "object" ? parsed.custom : {},
    };
    return cachedVariables;
  } catch {
    cachedVariables = structuredClone(DEFAULT_VARIABLES);
    return cachedVariables;
  }
}

export function saveTacticalVariables(vars: Partial<TacticalVariables>): TacticalVariables {
  const current = getTacticalVariables();
  const next: TacticalVariables = {
    ...current,
    ...vars,
    custom: {
      ...current.custom,
      ...(vars.custom ?? {}),
    },
  };
  cachedVariables = next;
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage errors
    }
  }
  notifyListeners(next);
  return next;
}

export function setTacticalVariable(key: string, value: string): TacticalVariables {
  const canonical = resolveCanonicalKey(key);
  const current = getTacticalVariables();
  const trimmed = value.trim();

  if (canonical in DEFAULT_VARIABLES && canonical !== "custom") {
    return saveTacticalVariables({
      [canonical]: trimmed,
    } as unknown as Partial<TacticalVariables>);
  }

  const custom = { ...current.custom, [canonical]: trimmed };
  return saveTacticalVariables({ custom });
}

export function clearTacticalVariables(): TacticalVariables {
  cachedVariables = structuredClone(DEFAULT_VARIABLES);
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  }
  notifyListeners(cachedVariables);
  return cachedVariables;
}

export function subscribeTacticalVariables(listener: (vars: TacticalVariables) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners(vars: TacticalVariables): void {
  for (const listener of listeners) {
    try {
      listener(vars);
    } catch {
      // Protect from listener errors
    }
  }
}

export function extractPlaceholders(command: string): ExtractedVariable[] {
  const matches: ExtractedVariable[] = [];
  const seen = new Set<string>();

  const regex = new RegExp(PLACEHOLDER_REGEX);
  let match: RegExpExecArray | null;

  while ((match = regex.exec(command)) !== null) {
    const raw = match[0];
    const name = match[1] || match[2] || match[3];
    if (!name) continue;
    const canonical = resolveCanonicalKey(name);
    if (!seen.has(raw)) {
      seen.add(raw);
      matches.push({
        rawPlaceholder: raw,
        canonicalKey: canonical,
      });
    }
  }

  return matches;
}

export function injectVariables(
  command: string,
  overrideVars?: TacticalVariables,
): InjectionResult {
  const vars = overrideVars ?? getTacticalVariables();
  const extracted = extractPlaceholders(command);

  if (extracted.length === 0) {
    return {
      injected: command,
      hasPlaceholders: false,
      replaced: [],
      missing: [],
    };
  }

  const replaced: ReplacedVariable[] = [];
  const missing: ExtractedVariable[] = [];
  let result = command;

  for (const item of extracted) {
    let value: string | undefined;
    if (item.canonicalKey in vars && item.canonicalKey !== "custom") {
      value = (vars as unknown as Record<string, string>)[item.canonicalKey];
    } else {
      value = vars.custom[item.canonicalKey];
    }

    if (value && value.trim().length > 0) {
      const val = value.trim();
      // Replace all occurrences of rawPlaceholder
      result = result.split(item.rawPlaceholder).join(val);
      replaced.push({
        placeholder: item.rawPlaceholder,
        key: item.canonicalKey,
        value: val,
      });
    } else {
      missing.push(item);
    }
  }

  return {
    injected: result,
    hasPlaceholders: true,
    replaced,
    missing,
  };
}
