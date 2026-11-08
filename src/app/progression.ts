import { useSyncExternalStore } from 'react';
import { isAwardStep, isFeatureUnlocked, progressionEvents, type FeatureId, type ProgressionEvent } from '../domain/companionProgression';
import type { AppState } from '../domain/types';
import type { Store } from '../state/store';
import { hasPro } from './pro';

/**
 * Progression in the app layer.
 *
 * XP is paid inside the reducer (see state/reducer, "task/update"), so it is
 * part of the persisted state and the backup. This module only listens: it
 * compares the progression before and after each change and announces what
 * happened (floating "+15 XP", level-up, unlock, welcome back) to whoever
 * subscribes. Events are never stored.
 */

export type ProgressionListener = (events: ProgressionEvent[]) => void;

const listeners = new Set<ProgressionListener>();

export function onProgression(listener: ProgressionListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(events: ProgressionEvent[]): void {
  for (const l of listeners) {
    try {
      l(events);
    } catch {
      // A broken animation must never break the task flow.
    }
  }
}

/** Starts listening to the store. Returns a disconnect function. */
export function connectProgression(store: Pick<Store, 'getState' | 'subscribe'>): () => void {
  let prev = store.getState().progression;
  return store.subscribe(() => {
    const next = store.getState().progression;
    if (next === prev) return;
    const before = prev;
    prev = next;
    // A replaced state (backup import) is not progress: stay silent.
    if (!isAwardStep(before, next)) return;
    const events = progressionEvents(before, next);
    if (events.length > 0) emit(events);
  });
}

/** Feature gate: bought Pro opens everything, otherwise the companion level decides. */
export function canUseFeature(state: Pick<AppState, 'progression'>, feature: FeatureId, pro = hasPro()): boolean {
  return pro || isFeatureUnlocked(state.progression.stats, feature);
}

/** Latest batch of events for components (e.g. the XP floater). */
let latest: { seq: number; events: ProgressionEvent[] } = { seq: 0, events: [] };
const latestListeners = new Set<() => void>();
onProgression((events) => {
  latest = { seq: latest.seq + 1, events };
  latestListeners.forEach((l) => l());
});

export function useProgressionEvents(): { seq: number; events: ProgressionEvent[] } {
  return useSyncExternalStore(
    (l) => {
      latestListeners.add(l);
      return () => latestListeners.delete(l);
    },
    () => latest,
    () => latest,
  );
}
