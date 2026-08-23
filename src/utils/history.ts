interface HistoryStacks<T> {
  past: T[];
  future: T[];
}

export class SessionHistory<T> {
  private readonly entries = new Map<string, HistoryStacks<T>>();

  constructor(
    private readonly limit: number,
    private readonly clone: (value: T) => T,
  ) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error("History limit must be a positive integer.");
    }
  }

  record(key: string, previous: T): void {
    const stacks = this.getOrCreate(key);
    stacks.past.push(this.clone(previous));
    if (stacks.past.length > this.limit) {
      stacks.past.splice(0, stacks.past.length - this.limit);
    }
    stacks.future = [];
  }

  canUndo(key: string): boolean {
    return (this.entries.get(key)?.past.length ?? 0) > 0;
  }

  canRedo(key: string): boolean {
    return (this.entries.get(key)?.future.length ?? 0) > 0;
  }

  peekUndo(key: string): T | null {
    const past = this.entries.get(key)?.past;
    const value = past?.[past.length - 1];
    return value === undefined ? null : this.clone(value);
  }

  peekRedo(key: string): T | null {
    const future = this.entries.get(key)?.future;
    const value = future?.[future.length - 1];
    return value === undefined ? null : this.clone(value);
  }

  commitUndo(key: string, current: T): void {
    const stacks = this.entries.get(key);
    if (!stacks?.past.length) {
      return;
    }
    stacks.past.pop();
    stacks.future.push(this.clone(current));
    if (stacks.future.length > this.limit) {
      stacks.future.splice(0, stacks.future.length - this.limit);
    }
  }

  commitRedo(key: string, current: T): void {
    const stacks = this.entries.get(key);
    if (!stacks?.future.length) {
      return;
    }
    stacks.future.pop();
    stacks.past.push(this.clone(current));
    if (stacks.past.length > this.limit) {
      stacks.past.splice(0, stacks.past.length - this.limit);
    }
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  deletePrefix(prefix: string): void {
    [...this.entries.keys()].forEach((key) => {
      if (key === prefix || key.startsWith(`${prefix}/`) || key.startsWith(`${prefix}\\`)) {
        this.entries.delete(key);
      }
    });
  }

  remapPrefix(oldPrefix: string, newPrefix: string): void {
    [...this.entries.entries()].forEach(([key, value]) => {
      if (key !== oldPrefix && !key.startsWith(`${oldPrefix}/`) && !key.startsWith(`${oldPrefix}\\`)) {
        return;
      }
      this.entries.delete(key);
      this.entries.set(`${newPrefix}${key.slice(oldPrefix.length)}`, value);
    });
  }

  clear(): void {
    this.entries.clear();
  }

  private getOrCreate(key: string): HistoryStacks<T> {
    const existing = this.entries.get(key);
    if (existing) {
      return existing;
    }
    const created = { past: [], future: [] } satisfies HistoryStacks<T>;
    this.entries.set(key, created);
    return created;
  }
}
