import { useEffect, useRef } from 'react';
import { avatarActivity, energyMode, energyToday, theOneThing } from '../domain/energy';
import type { SessionProjection } from '../domain/session';
import type { AppState, Millis } from '../domain/types';
import { desktop, type OverlayState } from '../lib/desktop';
import { MIN } from '../lib/time';
import { useServices } from './services';

/** Calm status for the mini overlay, never a ticking number. */
export function overlayState(state: AppState, now: Millis, fg: SessionProjection | null): OverlayState {
  const avatar = state.settings.companion.avatar;
  if (!fg) {
    const one = theOneThing(state, now);
    const low = energyMode(energyToday(state, now)) === 'low';
    return { avatar, activity: low ? 'tea' : 'writing', status: 'idle', title: one ? one.title : 'Gerade frei', progress: 0, hint: one ? 'Wartet geduldig auf dich' : 'Bereit, wenn du es bist' };
  }
  const task = state.tasks[fg.taskId] ?? null;
  const progress = Math.min(1, fg.netMs / Math.max(1, fg.effectiveTimeboxMin * MIN));
  const paused = fg.status === 'paused';
  const over = fg.netMs > fg.effectiveTimeboxMin * MIN;
  const hint = paused ? 'Kurze Pause, alles gut' : over ? 'Länger als geplant, ganz okay' : progress < 0.15 ? 'Gut angekommen' : progress < 0.6 ? 'Schön im Fluss' : progress < 0.9 ? 'Ein gutes Stück geschafft' : 'Fast am Ziel';
  return {
    avatar,
    activity: paused ? 'tea' : avatarActivity(state, now, task),
    status: paused ? 'paused' : over ? 'over' : 'running',
    title: task?.title ?? 'Fokus',
    progress,
    hint,
  };
}

/** Keeps the desktop mini overlay in sync with the app (config + calm status). */
export function useOverlaySync(state: AppState, now: Millis, fg: SessionProjection | null, theme: 'light' | 'dark'): void {
  const services = useServices();
  const o = state.settings.overlay;
  const palette = state.settings.appearance.palette;

  useEffect(() => {
    desktop?.overlayConfig({ ...o, theme, palette });
  }, [o, theme, palette]);

  const last = useRef('');
  const status = o.enabled ? overlayState(state, now, fg) : null;
  // Round progress so the IPC only fires when something visibly changes.
  const key = status ? JSON.stringify({ ...status, progress: Math.round(status.progress * 50) }) : '';
  useEffect(() => {
    if (!status || key === last.current) return;
    last.current = key;
    desktop?.overlayState(status);
    // `key` captures every visible change of `status`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!desktop) return;
    const set = (enabled: boolean) => {
      const cur = services.store.getState().settings.overlay;
      services.store.dispatch({ type: 'settings/update', patch: { overlay: { ...cur, enabled } } });
    };
    const offToggle = desktop.onToggleOverlay(() => set(!services.store.getState().settings.overlay.enabled));
    const offClosed = desktop.onOverlayClosed(() => {
      set(false);
      services.announce('Mini-Overlay ausgeblendet. Du kannst es im Tray oder in den Einstellungen wieder einschalten.');
    });
    return () => {
      offToggle();
      offClosed();
    };
  }, [services]);
}
