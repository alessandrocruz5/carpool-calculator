// Minimal browser-API shims so zustand's persist + resilientFetch can run under node.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(k: string): string | null {
    return this.store.has(k) ? this.store.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.store.set(k, String(v));
  }
  removeItem(k: string): void {
    this.store.delete(k);
  }
  clear(): void {
    this.store.clear();
  }
  key(i: number): string | null {
    return Array.from(this.store.keys())[i] ?? null;
  }
  get length(): number {
    return this.store.size;
  }
}

export function installDomShim() {
  const g = globalThis as unknown as {
    localStorage?: MemoryStorage;
    navigator?: { onLine: boolean };
    window?: { localStorage?: MemoryStorage };
  };
  const storage = g.localStorage ?? new MemoryStorage();
  g.localStorage = storage;
  if (!g.navigator) g.navigator = { onLine: true };
  if (!g.window) g.window = { localStorage: storage };
  else if (!g.window.localStorage) g.window.localStorage = storage;
}
