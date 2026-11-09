import { useEffect, useSyncExternalStore } from 'react';
import { desktop, isQuickView } from '../lib/desktop';
import { addDays, dayKey } from '../lib/time';
import { quickAddTask } from '../state/commands';
import { trackEvent } from '../services/telemetry';
import { useAppState } from './hooks';
import { useServices, type Services } from './services';
import { announceWithUndo } from './undo';
import { DEFAULT_SETTINGS } from '../state/defaults';
import type { QuickCaptureKey } from '../domain/types';

/**
 * Quick capture, app side: registers the global shortcut the settings name,
 * and turns every line from the quick window into a task (with undo).
 */
export const QUICK_KEY_LABELS = {
  ctrl_alt_space: 'Strg + Alt + Leertaste',
  ctrl_alt_t: 'Strg + Alt + T',
  alt_shift_n: 'Alt + Umschalt + N',
  off: 'Aus',
} as const;

/** Tried in this order when the default shortcut is taken. */
export const QUICK_FALLBACKS: QuickCaptureKey[] = ['ctrl_alt_t', 'alt_shift_n'];

/** Whether the chosen shortcut is really registered (another app may own it). */
let quickActive: boolean | null = null;
const listeners = new Set<() => void>();
export const quickStatus = {
  get: () => quickActive,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
function setQuickActive(active: boolean | null) {
  quickActive = active;
  listeners.forEach((l) => l());
}
export const useQuickStatus = () => useSyncExternalStore(quickStatus.subscribe, quickStatus.get, quickStatus.get);

/** Creates the task for one quick line. Returns what the quick window says. */
export function handleQuickAdd(services: Services, text: string): { ok: boolean; message: string } {
  const result = quickAddTask(services.store.getState(), services.deps(), text);
  if (!result.ok) return { ok: false, message: result.error };
  services.store.dispatch(result.actions);
  const id = result.taskId!;
  const task = services.store.getState().tasks[id]!;
  const today = dayKey(services.clock.now());
  const when = result.plannedDay === today ? 'heute' : result.plannedDay === addDays(today, 1) ? 'morgen' : 'übermorgen';
  trackEvent('task_created', { task_type: task.type, priority: task.priority, has_checklist: false, source: 'quick', planned: when === 'heute' ? 'today' : 'later' });
  announceWithUndo(services, `Gemerkt für ${when}: „${task.title}“`, () => services.store.dispatch({ type: 'task/remove', id }));
  return { ok: true, message: `Gemerkt für ${when}${result.clientName ? ` · ${result.clientName}` : ''}` };
}

export function useQuickCapture(): void {
  const services = useServices();
  const key = useAppState().settings.quickCapture;

  useEffect(() => {
    if (!desktop || isQuickView) return;
    const bridge = desktop;
    let alive = true;
    void (async () => {
      try {
        const r = await bridge.quickConfig(key);
        if (!alive) return;
        if (r.ok || key === 'off') return setQuickActive(key === 'off' ? null : r.active);
        // The default is taken (e.g. by another launcher): quietly take the first free alternative.
        if (key === DEFAULT_SETTINGS.quickCapture) {
          for (const alt of QUICK_FALLBACKS) {
            const r2 = await bridge.quickConfig(alt);
            if (!alive) return;
            if (r2.ok) {
              services.store.dispatch({ type: 'settings/update', patch: { quickCapture: alt } });
              services.announce(`${QUICK_KEY_LABELS[key]} ist schon von einem anderen Programm belegt. Die Schnellerfassung öffnest du mit ${QUICK_KEY_LABELS[alt]}.`);
              return;
            }
          }
        }
        setQuickActive(false);
        services.announce(`${QUICK_KEY_LABELS[key]} ist schon von einem anderen Programm belegt. Unter Einstellungen → Allgemein kannst du ein anderes Kürzel wählen.`);
      } catch {
        if (alive) setQuickActive(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [key, services]);

  useEffect(() => {
    if (!desktop || isQuickView) return;
    const bridge = desktop;
    return bridge.onQuickAdd(({ id, text }) => {
      let reply: { ok: boolean; message: string };
      try {
        reply = handleQuickAdd(services, text);
      } catch {
        reply = { ok: false, message: 'Das hat nicht geklappt. Versuch es noch einmal.' };
      }
      bridge.quickResult({ id, ...reply });
    });
  }, [services]);
}
