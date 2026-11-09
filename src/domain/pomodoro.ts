import { formatClock, MIN } from '../lib/time';
import type { CompanionMessage, Moment } from './companion';
import type { SessionProjection } from './session';
import type { AppState, CheckInKind, Id, Millis, Settings } from './types';

/**
 * Focus timer (Pomodoro), unlocked at companion level 10.
 *
 * It runs as a focus style inside an ordinary session, and like everything
 * else it is derived from the session's event log, never counted:
 *  - a focus round is running time (ordinary pauses stop its clock),
 *  - the break between two rounds is a real session pause with the reason
 *    "pomodoro", so reports and net time stay true,
 *  - after every fourth round the break is the long one.
 * Pure: time comes in as `now`, nothing here touches the UI.
 */
export const POMODORO_ROUNDS = 4;

/**
 * Check-ins that wait while a focus round runs (the timer is the structure).
 * Overrun, idle, the end of a break and the daily cap still come through:
 * they protect the plan, the time record and the evening.
 */
export const HELD_IN_FOCUS: ReadonlySet<CheckInKind> = new Set<CheckInKind>(['first_step', 'pulse', 'milestone', 'break_suggestion']);

export type PomodoroPhase =
  | {
      kind: 'focus';
      /** 1 … POMODORO_ROUNDS */
      round: number;
      rounds: number;
      /** Wall-clock start of this round (session start or the end of the last break). */
      startedAt: Millis;
      elapsedMs: Millis;
      remainingMs: Millis;
      /** The round is full: time for the break. */
      due: boolean;
    }
  | {
      kind: 'break';
      /** The round that was just finished. */
      round: number;
      rounds: number;
      long: boolean;
      startedAt: Millis;
      plannedMin: number;
      remainingMs: Millis;
    };

/** Phase of the foreground session's focus timer at `now`. */
export function pomodoroPhase(state: Pick<AppState, 'events' | 'settings'>, p: SessionProjection, now: Millis): PomodoroPhase {
  const breaks = state.events.filter((e) => e.sessionId === p.sessionId && e.type === 'paused' && e.reason === 'pomodoro' && e.at <= now);
  const done = breaks.length;
  const roundOf = (n: number) => ((n - 1) % POMODORO_ROUNDS) + 1;

  if (p.status === 'paused' && p.currentPause?.reason === 'pomodoro') {
    const plannedMin = p.currentPause.plannedMin ?? state.settings.pomodoro.breakMin;
    return {
      kind: 'break',
      round: roundOf(done),
      rounds: POMODORO_ROUNDS,
      long: done % POMODORO_ROUNDS === 0,
      startedAt: p.currentPause.since,
      plannedMin,
      remainingMs: Math.max(0, plannedMin * MIN - (now - p.currentPause.since)),
    };
  }

  // The current round began after the last break (or with the session).
  const since = breaks.reduce((latest, e) => Math.max(latest, e.at), p.startedAt);
  const runs = p.runningIntervals.filter(([, end]) => end > since);
  const elapsedMs = runs.reduce((sum, [start, end]) => sum + Math.max(0, end - Math.max(start, since)), 0);
  const focusMs = state.settings.pomodoro.focusMin * MIN;
  return {
    kind: 'focus',
    round: roundOf(done + 1),
    rounds: POMODORO_ROUNDS,
    startedAt: runs[0] ? Math.max(runs[0][0], since) : since,
    elapsedMs,
    remainingMs: Math.max(0, focusMs - elapsedMs),
    due: elapsedMs >= focusMs,
  };
}

/** Same patience as the companion's: never mid-sentence, but at most 3 minutes late. */
const MAX_WAIT_FOR_PAUSE_MS = 3 * MIN;

export interface PomodoroBreak {
  type: 'break';
  /** The round that is finished. */
  round: number;
  long: boolean;
  plannedMin: number;
}

/**
 * Should the break start now? Only once the round is full, and then at the
 * next pause of the hands (`typing` waits, at most 3 minutes). Away from the
 * desk or without an input signal (browser) it starts right away.
 */
export function pomodoroStep(phase: PomodoroPhase, moment: Moment | null, settings: Pick<Settings, 'pomodoro'>): PomodoroBreak | null {
  if (phase.kind !== 'focus' || !phase.due) return null;
  const overdueMs = phase.elapsedMs - settings.pomodoro.focusMin * MIN;
  if (moment === 'typing' && overdueMs < MAX_WAIT_FOR_PAUSE_MS) return null;
  const long = phase.round % POMODORO_ROUNDS === 0;
  return { type: 'break', round: phase.round, long, plannedMin: long ? settings.pomodoro.longBreakMin : settings.pomodoro.breakMin };
}

/** Tray and window title: "Fokus 2/4 · 18:30", "Pause · 4:00", "Lange Pause · 12:00". */
export function pomodoroStatus(phase: PomodoroPhase): string {
  if (phase.kind === 'focus') return `Fokus ${phase.round}/${phase.rounds} · ${formatClock(phase.remainingMs)}`;
  return `${phase.long ? 'Lange Pause' : 'Pause'} · ${formatClock(phase.remainingMs)}`;
}

/** A round counts as freshly started during its first minute. */
const FRESH_MS = MIN;

/** Key of a round that just started (the companion comments once per key), else null. */
export function focusStartKey(sessionId: Id, phase: PomodoroPhase, now: Millis): string | null {
  if (phase.kind !== 'focus' || phase.elapsedMs >= FRESH_MS || now - phase.startedAt >= FRESH_MS) return null;
  return `${sessionId}:${phase.startedAt}`;
}

const minutes = (n: number) => `${n} ${n === 1 ? 'Minute' : 'Minuten'}`;

/** The companion at the start of a round. */
export function pomodoroFocusMessage(id: Id, round: number, focusMin: number, taskTitle: string): CompanionMessage {
  return {
    id,
    kind: 'pomodoro',
    title: `Runde ${round} von ${POMODORO_ROUNDS}`,
    text: `${minutes(focusMin)} nur für „${taskTitle}“. Ich halte dir den Rücken frei und melde mich zur Pause.`,
    mood: 'happy',
    options: [{ id: 'ok', label: 'Los geht’s', primary: true }],
    ttlMs: 12_000,
  };
}

/** The companion when a round is finished. */
export function pomodoroBreakMessage(id: Id, b: PomodoroBreak): CompanionMessage {
  return {
    id,
    kind: 'pomodoro',
    title: b.long ? 'Lange Pause' : 'Pause',
    text: b.long
      ? `Vier Runden geschafft. Gönn dir ${minutes(b.plannedMin)}: raus aus dem Stuhl, etwas trinken, den Kopf lüften.`
      : `Runde ${b.round} geschafft. ${minutes(b.plannedMin)} Pause: aufstehen, trinken, kurz in die Ferne schauen.`,
    mood: 'calm',
    options: [{ id: 'ok', label: 'Mach ich', primary: true }],
    ttlMs: 20_000,
  };
}
