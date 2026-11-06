/**
 * Defensive localStorage access: storage can be unavailable (private mode,
 * sandboxed iframes, policy) or full (quota). The app keeps working in
 * memory then, and since 1.11 it says so: `storageHealth` reports the
 * problem, the app shows a calm notice with a backup download, and the
 * notice clears itself once a write succeeds again.
 */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): boolean;
  remove(key: string): void;
}

export type StorageProblem = 'full' | 'blocked';

export interface StorageHealth {
  problem: StorageProblem | null;
  /** When the current problem started (ms). */
  since: number | null;
  /** Counts problems, so a notice can tell a new one from an old one. */
  seq: number;
}

let health: StorageHealth = { problem: null, since: null, seq: 0 };
const healthListeners = new Set<() => void>();
/** The newest write that did not reach the disk (retried on demand). */
let lastFailed: { key: string; value: string } | null = null;

function setHealth(problem: StorageProblem | null): void {
  if (problem === health.problem) return;
  health = problem ? { problem, since: Date.now(), seq: health.seq + 1 } : { problem: null, since: null, seq: health.seq };
  healthListeners.forEach((l) => l());
}

/** Quota errors differ between engines (name, legacy codes 22 and 1014). */
export function classifyStorageError(err: unknown): StorageProblem {
  const e = err as { name?: string; code?: number } | null;
  if (e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014)) return 'full';
  return 'blocked';
}

export const storageHealth = {
  get: (): StorageHealth => health,
  subscribe(listener: () => void): () => void {
    healthListeners.add(listener);
    return () => healthListeners.delete(listener);
  },
  /** Writes the newest unsaved value again. True when everything is stored now. */
  retry(): boolean {
    if (!lastFailed) {
      setHealth(null);
      return true;
    }
    return browserStore.set(lastFailed.key, lastFailed.value);
  },
};

const memory = new Map<string, string>();

export const browserStore: KeyValueStore = {
  get(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (err) {
      // Not even readable: the app would look empty. Say so instead of staying silent.
      setHealth(classifyStorageError(err));
      return memory.get(key) ?? null;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, value);
      memory.delete(key);
      if (lastFailed?.key === key) lastFailed = null;
      if (!lastFailed) setHealth(null);
      return true;
    } catch (err) {
      memory.set(key, value);
      lastFailed = { key, value };
      setHealth(classifyStorageError(err));
      return false;
    }
  },
  remove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* nothing to lose */
    }
    memory.delete(key);
    if (lastFailed?.key === key) {
      lastFailed = null;
      setHealth(null);
    }
  },
};

/** Test helper: back to a healthy start. */
export function resetStorageHealth(): void {
  lastFailed = null;
  memory.clear();
  health = { problem: null, since: null, seq: 0 };
}

export function createMemoryStore(): KeyValueStore {
  const m = new Map<string, string>();
  return {
    get: (k) => m.get(k) ?? null,
    set: (k, v) => (m.set(k, v), true),
    remove: (k) => void m.delete(k),
  };
}

export function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
