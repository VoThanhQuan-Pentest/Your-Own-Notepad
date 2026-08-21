const VARIABLE_PATTERN = /{{\s*([A-Za-z][A-Za-z0-9_-]*)\s*}}/g;

export function renderCommandTemplate(
  template: string,
  values: ReadonlyMap<string, string>,
): string {
  return template.replace(VARIABLE_PATTERN, (placeholder, name: string) => {
    return values.get(name) ?? placeholder;
  });
}

export function extractVariableNames(template: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const match of template.matchAll(VARIABLE_PATTERN)) {
    const name = match[1];
    if (name && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}
