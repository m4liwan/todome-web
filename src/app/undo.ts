import type { Services } from './services';

/**
 * Undo for the few destructive one-click actions (crossing out a task, a
 * quick capture): a toast with "Rückgängig" for 8 seconds, and Ctrl+Z while
 * it is showing. Only the newest action can be undone; each one once.
 */
export const UNDO_MS = 8000;

let last: { run: () => void; until: number } | null = null;

export function announceWithUndo(services: Services, message: string, undo: () => void): void {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    if (last?.run === run) last = null;
    undo();
    services.announce('Rückgängig gemacht.');
  };
  last = { run, until: Date.now() + UNDO_MS };
  services.announce(message, { label: 'Rückgängig', run });
}

/** Ctrl+Z: undoes the newest action while its toast is still there. */
export function undoLast(now = Date.now()): boolean {
  if (!last || now > last.until) return false;
  last.run();
  return true;
}

/** For tests. */
export function resetUndo(): void {
  last = null;
}
