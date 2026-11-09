import { effectiveTone } from '../domain/energy';
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { promptFor } from '../domain/copy';
import { foregroundSession, projectAll, type SessionProjection } from '../domain/session';
import type { AppState, CheckIn, Millis } from '../domain/types';
import { notify } from '../lib/notifier';
import { promptVarsFor } from './promptVars';
import { desktop } from '../lib/desktop';
import { pauseSession } from '../state/commands';
import { companionForCheckIn } from './companion';
import { formatClock, MIN } from '../lib/time';
import { tick } from '../state/scheduler';
import { useServices } from './services';
import { contextLabels, type ContextLabels } from '../domain/userContext';
import { currentMoment } from './attention';

export function useAppState(): AppState {
  const { store } = useServices();
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

/** The words for the chosen context (study, work, everyday). */
export function useLabels(): ContextLabels {
  return contextLabels(useAppState().settings.userContext);
}

// --- shared 1-second ticker (one interval for the whole app) ---------------
let tickValue = 0;
const tickListeners = new Set<() => void>();
let tickTimer: ReturnType<typeof setInterval> | null = null;
function subscribeTicker(listener: () => void) {
  tickListeners.add(listener);
  if (!tickTimer) {
    tickTimer = setInterval(() => {
      tickValue++;
      tickListeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    tickListeners.delete(listener);
    if (tickListeners.size === 0 && tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  };
}

/** Current (possibly time-lapsed) time, re-rendering every real second. */
export function useNow(): Millis {
  const { clock } = useServices();
  useSyncExternalStore(subscribeTicker, () => tickValue, () => tickValue);
  return clock.now();
}

export function useProjections(): { state: AppState; now: Millis; projections: SessionProjection[]; foreground: SessionProjection | null } {
  const state = useAppState();
  const now = useNow();
  const projections = useMemo(() => projectAll(state, now), [state, now]);
  return { state, now, projections, foreground: foregroundSession(projections) };
}

/** Drives the check-in engine: expiry, planning, sending, notifying. */
export function useScheduler(): void {
  const services = useServices();
  useEffect(() => {
    const run = () => {
      const { store } = services;
      const state = store.getState();
      // First start: no coach prompts until the setup is done.
      if (!state.settings.onboarded) return;
      const deps = services.deps();
      // Typing right now: the next focus pulse waits for the pause after it.
      const result = tick(state, deps, { focusSignalActive: currentMoment() === 'typing' });
      if (result.actions.length === 0) return;
      store.dispatch(result.actions);
      for (const c of result.sent) {
        // Desktop, app not in front: the companion asks at the screen edge.
        const away = typeof document !== 'undefined' && (document.hidden || !document.hasFocus());
        if (desktop && away && companionForCheckIn(services, c, deps.now)) continue;
        announceCheckIn(store.getState(), c, deps.now);
      }
    };
    run();
    const id = setInterval(run, 1000);
    return () => clearInterval(id);
  }, [services]);
}

function announceCheckIn(state: AppState, c: CheckIn, now: Millis) {
  const content = promptFor(c.kind, effectiveTone(state, now), promptVarsFor(state, c, now));
  notify(c.channel, `ToDoMe · ${content.title}`, content.push, `todome-${c.id}`, state.settings.systemNotifications);
}

/**
 * System-wide idle detection. On return from idle during a running session an
 * "idle" prompt asks how to book the away time.
 * - Desktop app: OS idle time and screen lock via the Electron bridge (all platforms).
 * - Browser: Idle Detection API (Chromium, needs permission).
 */
export function useIdleDetection(): void {
  const services = useServices();
  const state = useAppState();
  const enabled = state.settings.idleDetection && services.mode === 'live';
  const threshold = state.settings.idleThresholdMin;
  const idleSince = useRef<Millis | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const onIdle = (since: Millis) => {
      if (idleSince.current === null) idleSince.current = since;
    };
    const onActive = () => {
      if (idleSince.current === null) return;
      const from = idleSince.current;
      idleSince.current = null;
      raiseIdlePrompt(services, from, services.clock.now());
    };

    if (desktop) {
      let cancelled = false;
      const poll = async () => {
        try {
          const { state: s, idleSeconds } = await desktop!.getIdleState(threshold * 60);
          if (cancelled) return;
          if (s === 'idle' || s === 'locked') onIdle(services.clock.now() - idleSeconds * 1000);
          else if (s === 'active') onActive();
        } catch {
          /* bridge unavailable – skip this round */
        }
      };
      void poll();
      const id = setInterval(poll, 10_000);
      return () => {
        cancelled = true;
        clearInterval(id);
      };
    }

    const Ctor = window.IdleDetector;
    if (!Ctor) return;
    const controller = new AbortController();
    const detector = new Ctor();
    const onChange = () => {
      const idle = detector.userState === 'idle' || detector.screenState === 'locked';
      if (idle) onIdle(services.clock.now() - threshold * MIN);
      else onActive();
    };
    detector.addEventListener('change', onChange);
    detector.start({ threshold: Math.max(60_000, threshold * MIN), signal: controller.signal }).catch(() => {
      services.announce('Leerlauf-Erkennung konnte nicht gestartet werden.');
    });
    return () => {
      detector.removeEventListener('change', onChange);
      controller.abort();
    };
  }, [enabled, threshold, services]);
}

/**
 * Desktop: when the computer wakes from sleep, a running session is paused
 * retroactively at the moment it went to sleep – sleep never counts as work.
 */
export function usePowerEvents(): void {
  const services = useServices();
  useEffect(() => {
    if (!desktop || services.mode !== 'live') return;
    return desktop.onPower((e) => {
      if (e.type !== 'resume' || e.resumedAt - e.suspendedAt < MIN) return;
      const state = services.store.getState();
      const fg = foregroundSession(projectAll(state, e.suspendedAt));
      if (!fg || fg.status !== 'running' || e.suspendedAt <= fg.phaseStartedAt) return;
      const ok = services.run(pauseSession(state, { now: e.suspendedAt, newId: services.deps().newId }, fg.sessionId, 'none', null));
      if (ok) services.announce('Der Rechner war im Ruhezustand. Deine Session wurde dort pausiert.');
    });
  }, [services]);
}

export function raiseIdlePrompt(services: ReturnType<typeof useServices>, from: Millis, to: Millis): void {
  const { store } = services;
  const fg = foregroundSession(projectAll(store.getState(), to));
  if (!fg || fg.status !== 'running' || to - from < MIN) return;
  const deps = services.deps();
  // An open prompt is superseded: the user was away, the idle question matters more.
  const open = Object.values(store.getState().checkIns).filter((c) => c.sessionId === fg.sessionId && c.answeredAt === null && c.expiredAt === null);
  const checkInId = deps.newId();
  store.dispatch([
    ...open.map((c) => ({ type: 'checkin/answer' as const, id: c.id, answer: 'system:superseded', at: deps.now })),
    {
      type: 'checkin/send',
      checkIn: {
        id: checkInId,
        kind: 'idle',
        sessionId: fg.sessionId,
        taskId: fg.taskId,
        channel: 'push',
        sentAt: deps.now,
        answeredAt: null,
        expiredAt: null,
        answer: null,
        data: { from: Math.max(from, fg.phaseStartedAt), to, idleMin: Math.round((to - Math.max(from, fg.phaseStartedAt)) / MIN) },
      },
    },
  ]);
  const sent = store.getState().checkIns[checkInId];
  if (sent) announceCheckIn(store.getState(), sent, deps.now);
}

/** Tab title as "live activity": remaining time and state of the foreground session. */
export function useDocumentTitle(foreground: SessionProjection | null, label: string | null, openPrompts: number): void {
  const remaining = foreground ? foreground.effectiveTimeboxMin * MIN - foreground.netMs : 0;
  const text = foreground
    ? `${openPrompts > 0 ? '● ' : ''}${foreground.status === 'paused' ? 'Pause · ' : ''}${formatClock(remaining)} · ${label ?? 'ToDoMe.'}`
    : openPrompts > 0
      ? '● ToDoMe.'
      : 'ToDoMe.';
  const attention = openPrompts > 0;
  useEffect(() => {
    document.title = text;
    desktop?.setStatus({ text, attention });
  }, [text, attention]);
}
