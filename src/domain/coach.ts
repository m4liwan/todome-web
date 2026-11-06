import { STREAK_GAP_MS, type PlannedCheckIn } from './checkinEngine';
import { sumIntervals, type Interval, type SessionProjection } from './session';
import type { AppState, Millis } from './types';
import { energyProfile } from './energy';
import { atTimeOfDay, dayKey, HOUR, MIN, startOfDay } from '../lib/time';

/**
 * Pause coaching & burnout protection (concept §3.2).
 * Works across sessions: a focus streak continues when the user switches tasks.
 */

/** Merge running intervals of all sessions; gaps shorter than `gapMs` are bridged. */
export function mergeWorkIntervals(projections: readonly SessionProjection[], gapMs = STREAK_GAP_MS): Interval[] {
  const all = projections
    .flatMap((p) => p.runningIntervals)
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  const merged: [Millis, Millis][] = [];
  for (const [s, e] of all) {
    const last = merged[merged.length - 1];
    if (last && s - last[1] < gapMs) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  return merged;
}

/** Current uninterrupted focus streak (0 if nobody is running). */
export function currentFocusStreakMs(projections: readonly SessionProjection[], now: Millis): Millis {
  if (!projections.some((p) => p.status === 'running')) return 0;
  const last = mergeWorkIntervals(projections).at(-1);
  if (!last || now - last[1] > 1000) return 0;
  return last[1] - last[0];
}

/** Net working time on the local day of `now` (clipped to that day). */
export function netTodayMs(projections: readonly SessionProjection[], now: Millis): Millis {
  const from = startOfDay(now);
  const to = from + 24 * HOUR;
  return projections.reduce((acc, p) => {
    const inDay = p.runningIntervals.map(
      ([s, e]) => [Math.max(s, from), Math.min(e, to)] as const,
    );
    const share = sumIntervals(p.runningIntervals) > 0
      ? sumIntervals(inDay) / sumIntervals(p.runningIntervals)
      : 0;
    return acc + p.netMs * share;
  }, 0);
}

export function isAfterWorkday(state: Pick<AppState, 'settings' | 'coach'>, now: Millis): boolean {
  return now >= atTimeOfDay(now, state.settings.workdayEnd) || state.coach.closedDay === dayKey(now);
}

const raisedSince = (state: AppState, kind: PlannedCheckIn['kind'], since: Millis) =>
  (state.coach.lastRaised[kind] ?? 0) >= since;
const snoozed = (state: AppState, kind: PlannedCheckIn['kind'], now: Millis) =>
  (state.coach.snoozedUntil[kind] ?? 0) > now;

/** Next coach prompt (break, daily cap, shutdown) or null. */
export function planCoachPrompt(
  state: AppState,
  projections: readonly SessionProjection[],
  now: Millis,
): PlannedCheckIn | null {
  const { settings } = state;
  const today = dayKey(now);
  const dayStart = startOfDay(now);
  const running = projections.find((p) => p.status === 'running') ?? null;
  // Coach prompts are not bound to a session: stopping a session must not swallow them.
  const base = { sessionId: null, taskId: running?.taskId ?? null };

  // Daily cap reached (once per day).
  if (running && netTodayMs(projections, now) >= settings.dailyCapMin * MIN && !raisedSince(state, 'daily_cap', dayStart) && !snoozed(state, 'daily_cap', now)) {
    return { ...base, kind: 'daily_cap', dueAt: now, channel: 'push', data: { capMin: settings.dailyCapMin }, priority: 0 };
  }

  // Focus budget exceeded → break suggestion (at most every 30 min).
  const streak = currentFocusStreakMs(projections, now);
  const budgetMin = Math.min(settings.focusBudgetMin, energyProfile(state, now)?.focusBudgetMin ?? Number.POSITIVE_INFINITY);
  if (running && streak >= budgetMin * MIN && !raisedSince(state, 'break_suggestion', now - 30 * MIN) && !snoozed(state, 'break_suggestion', now)) {
    return {
      ...base,
      kind: 'break_suggestion',
      dueAt: now,
      channel: 'push',
      data: { streakMin: Math.round(streak / MIN) },
      priority: 1,
    };
  }

  // Shutdown routine: from 30 min before workday end until 3 h after, once per day.
  const end = atTimeOfDay(now, settings.workdayEnd);
  if (
    now >= end - 30 * MIN &&
    now < end + 3 * HOUR &&
    state.coach.closedDay !== today &&
    // Back for a second shift: no one asks about Feierabend again today.
    state.coach.secondShiftDay !== today &&
    !raisedSince(state, 'shutdown', dayStart) &&
    !snoozed(state, 'shutdown', now)
  ) {
    return { ...base, kind: 'shutdown', dueAt: end - 30 * MIN, channel: 'push', data: { workdayEnd: settings.workdayEnd }, priority: 2 };
  }
  return null;
}
