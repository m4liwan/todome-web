import type { AppState } from '../domain/types';
import { desktop, type VaultEntry, type VaultKind } from '../lib/desktop';
import { HOUR } from '../lib/time';
import { inspectState, type StateCheck } from '../state/store';

/**
 * Datensafe, renderer side. The desktop shell keeps rotating JSON copies in
 * the user profile (electron/vault.cjs); in a plain browser there is no
 * safe and the manual backup download stays the only copy.
 */
export const vaultSupported = (): boolean => desktop !== null;

/** Hands a copy of the state to the shell. Never throws, never blocks the UI for long. */
export function snapshotState(kind: VaultKind, state: AppState): void {
  if (!desktop) return;
  try {
    desktop.vaultSave(kind, JSON.stringify(state));
  } catch (err) {
    console.error('[todome] backup failed', err);
  }
}

/** Raw text (e.g. unreadable data at start): kept exactly as it was. */
export function snapshotRaw(kind: VaultKind, raw: string): void {
  if (!desktop) return;
  try {
    desktop.vaultSave(kind, raw);
  } catch (err) {
    console.error('[todome] backup failed', err);
  }
}

const FIRST_DAILY_MS = 20_000;
const DAILY_EVERY_MS = 3 * HOUR;

/**
 * One copy per day (refreshed every 3 hours while the app runs). Only after
 * the onboarding: an empty first start is nothing worth keeping.
 */
export function startDailySnapshots(getState: () => AppState): () => void {
  if (!desktop) return () => undefined;
  const save = () => {
    const state = getState();
    if (state.settings.onboarded) snapshotState('daily', state);
  };
  const first = window.setTimeout(save, FIRST_DAILY_MS);
  const every = window.setInterval(save, DAILY_EVERY_MS);
  return () => {
    window.clearTimeout(first);
    window.clearInterval(every);
  };
}

export async function listSnapshots(): Promise<VaultEntry[]> {
  if (!desktop) return [];
  try {
    return await desktop.vaultList();
  } catch {
    return [];
  }
}

/** Reads and checks one copy. */
export async function readSnapshot(name: string): Promise<StateCheck> {
  if (!desktop) return { status: 'empty' };
  try {
    return inspectState(await desktop.vaultRead(name));
  } catch {
    return { status: 'unreadable' };
  }
}

export const VAULT_KIND_LABEL: Record<VaultKind, string> = {
  daily: 'Tägliche Sicherung',
  'pre-update': 'Vor einem Update',
  'pre-import': 'Vor dem Ersetzen der Daten',
  unreadable: 'Nicht lesbarer Stand',
};

export function snapshotLabel(entry: VaultEntry): string {
  const at = new Date(entry.at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return `${at} · ${VAULT_KIND_LABEL[entry.kind]}`;
}

/** A short summary so nobody replaces their data blindly. */
export function describeState(state: AppState): string {
  const tasks = Object.keys(state.tasks).length;
  const sessions = Object.keys(state.sessions).length;
  const n = (v: number, one: string, many: string) => `${v} ${v === 1 ? one : many}`;
  const archived = state.archive.length > 0 ? `, ${n(state.archive.length, 'archivierter Tag', 'archivierte Tage')}` : '';
  return `${n(tasks, 'Aufgabe', 'Aufgaben')}, ${n(sessions, 'Session', 'Sessions')}${archived}`;
}
