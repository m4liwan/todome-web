import type {
  AppState,
  Id,
  Millis,
  PauseReason,
  SessionEvent,
  SessionOutcome,
} from './types';

export type SessionStatus = 'running' | 'paused' | 'interrupted' | 'stopped';
export type Interval = readonly [start: Millis, end: Millis];

export interface SessionProjection {
  sessionId: Id;
  taskId: Id;
  parentSessionId: Id | null;
  status: SessionStatus;
  intention: string;
  startedAt: Millis;
  stoppedAt: Millis | null;
  outcome: SessionOutcome | null;
  timeboxMin: number;
  extendedMin: number;
  effectiveTimeboxMin: number;
  /** Wall-clock intervals in which the session was running (open interval ends at `now`). */
  runningIntervals: Interval[];
  /** Wall-clock pause intervals (open pause ends at `now`). */
  pauseIntervals: Interval[];
  grossMs: Millis;
  pauseMs: Millis;
  interruptMs: Millis;
  /** Idle time the user booked as break/distraction (only the part overlapping running time). */
  idleDeductMs: Millis;
  correctionMs: Millis;
  netMs: Millis;
  /** Start of the current phase: start, resume, return or extension. */
  phaseStartedAt: Millis;
  currentPause: { since: Millis; reason: PauseReason; plannedMin: number | null } | null;
  currentInterruption: { since: Millis; bySessionId: Id } | null;
  pauseCount: number;
  interruptionCount: number;
  lastSnapshotId: Id | null;
}

function overlapMs(a: Interval, b: Interval): Millis {
  return Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));
}

export function sumIntervals(intervals: readonly Interval[]): Millis {
  return intervals.reduce((acc, [s, e]) => acc + Math.max(0, e - s), 0);
}

/**
 * Pure projection of one session's event log at time `now`.
 * Events are expected in insertion order; we sort defensively by `at` (stable).
 */
export function projectSession(
  state: Pick<AppState, 'sessions'>,
  events: readonly SessionEvent[],
  sessionId: Id,
  now: Millis,
): SessionProjection | null {
  const session = state.sessions[sessionId];
  if (!session) return null;
  const log = events
    .filter((e) => e.sessionId === sessionId)
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.at - b.e.at || a.i - b.i)
    .map(({ e }) => e);

  const first = log[0];
  if (!first || first.type !== 'started') return null;

  const p: SessionProjection = {
    sessionId,
    taskId: session.taskId,
    parentSessionId: session.parentSessionId,
    status: 'running',
    intention: first.intention,
    startedAt: first.at,
    stoppedAt: null,
    outcome: null,
    timeboxMin: first.timeboxMin,
    extendedMin: 0,
    effectiveTimeboxMin: first.timeboxMin,
    runningIntervals: [],
    pauseIntervals: [],
    grossMs: 0,
    pauseMs: 0,
    interruptMs: 0,
    idleDeductMs: 0,
    correctionMs: 0,
    netMs: 0,
    phaseStartedAt: first.at,
    currentPause: null,
    currentInterruption: null,
    pauseCount: 0,
    interruptionCount: 0,
    lastSnapshotId: null,
  };

  let runStart: Millis | null = first.at;
  const idleWindows: Interval[] = [];

  const closeRun = (at: Millis) => {
    if (runStart !== null) {
      p.runningIntervals.push([runStart, Math.max(runStart, at)]);
      runStart = null;
    }
  };
  const closePause = (at: Millis) => {
    if (p.currentPause) {
      p.pauseMs += Math.max(0, at - p.currentPause.since);
      p.pauseIntervals.push([p.currentPause.since, Math.max(p.currentPause.since, at)]);
      p.currentPause = null;
    }
  };
  const closeInterruption = (at: Millis) => {
    if (p.currentInterruption) {
      p.interruptMs += Math.max(0, at - p.currentInterruption.since);
      p.currentInterruption = null;
    }
  };

  for (const e of log.slice(1)) {
    if (p.status === 'stopped') break; // nothing after stop is applied
    switch (e.type) {
      case 'started':
        break; // duplicate start – ignore
      case 'paused':
        if (p.status !== 'running') break;
        closeRun(e.at);
        p.status = 'paused';
        p.pauseCount += 1;
        p.currentPause = { since: e.at, reason: e.reason, plannedMin: e.plannedMin };
        break;
      case 'pause_annotated':
        if (p.currentPause) {
          p.currentPause = { ...p.currentPause, reason: e.reason, plannedMin: e.plannedMin };
        }
        break;
      case 'resumed':
        if (p.status !== 'paused') break;
        closePause(e.at);
        p.status = 'running';
        runStart = e.at;
        p.phaseStartedAt = e.at;
        break;
      case 'interrupted':
        if (p.status === 'running') closeRun(e.at);
        else if (p.status === 'paused') closePause(e.at);
        else break;
        p.status = 'interrupted';
        p.interruptionCount += 1;
        p.currentInterruption = { since: e.at, bySessionId: e.bySessionId };
        break;
      case 'returned':
        if (p.status !== 'interrupted') break;
        closeInterruption(e.at);
        p.status = 'running';
        runStart = e.at;
        p.phaseStartedAt = e.at;
        break;
      case 'extended':
        p.extendedMin += e.minutes;
        p.phaseStartedAt = e.at;
        break;
      case 'idle_resolved':
        if (e.resolution !== 'working' && e.to > e.from) idleWindows.push([e.from, e.to]);
        break;
      case 'corrected':
        p.correctionMs += Math.max(0, e.deductMin) * 60_000;
        break;
      case 'snapshot_saved':
        p.lastSnapshotId = e.snapshotId;
        break;
      case 'stopped':
        closeRun(e.at);
        closePause(e.at);
        closeInterruption(e.at);
        p.status = 'stopped';
        p.stoppedAt = e.at;
        p.outcome = e.outcome;
        break;
    }
  }

  const end = p.stoppedAt ?? now;
  closeRun(end);
  if (p.status === 'paused' && p.currentPause) {
    p.pauseMs += Math.max(0, end - p.currentPause.since);
    p.pauseIntervals.push([p.currentPause.since, Math.max(p.currentPause.since, end)]);
  }
  if (p.status === 'interrupted' && p.currentInterruption) {
    p.interruptMs += Math.max(0, end - p.currentInterruption.since);
  }

  p.effectiveTimeboxMin = p.timeboxMin + p.extendedMin;
  p.grossMs = Math.max(0, end - p.startedAt);
  p.idleDeductMs = idleWindows.reduce(
    (acc, w) => acc + p.runningIntervals.reduce((a, r) => a + overlapMs(w, r), 0),
    0,
  );
  p.netMs = Math.max(0, sumIntervals(p.runningIntervals) - p.idleDeductMs - p.correctionMs);
  return p;
}

export function projectAll(state: AppState, now: Millis): SessionProjection[] {
  return Object.keys(state.sessions)
    .map((id) => projectSession(state, state.events, id, now))
    .filter((p): p is SessionProjection => p !== null);
}

/** The session currently in the foreground (running or paused). At most one by invariant. */
export function foregroundSession(projections: readonly SessionProjection[]): SessionProjection | null {
  return (
    projections
      .filter((p) => p.status === 'running' || p.status === 'paused')
      .sort((a, b) => b.phaseStartedAt - a.phaseStartedAt)[0] ?? null
  );
}

/** Interrupted sessions, most recently interrupted first (LIFO stack). */
export function sessionStack(projections: readonly SessionProjection[]): SessionProjection[] {
  return projections
    .filter((p) => p.status === 'interrupted')
    .sort((a, b) => (b.currentInterruption?.since ?? 0) - (a.currentInterruption?.since ?? 0));
}

export const MAX_STACK_DEPTH = 3;

/** Overrun of net time vs. the ORIGINAL timebox, as ratio (0.3 = 30 % over). */
export function overrunRatio(p: SessionProjection): number {
  if (p.timeboxMin <= 0) return 0;
  return p.netMs / (p.timeboxMin * 60_000) - 1;
}

export function remainingMs(p: SessionProjection): Millis {
  return p.effectiveTimeboxMin * 60_000 - p.netMs;
}
