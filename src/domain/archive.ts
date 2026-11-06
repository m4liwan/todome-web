import { projectAll } from './session';
import { roundMinutes } from './reports';
import type { AppState, DaySummary, Id, Millis } from './types';
import { dayKey, MIN } from '../lib/time';

/** Sessions older than this are condensed into day summaries. */
export const ARCHIVE_AFTER_MONTHS = 12;

/** First day that stays detailed: the same calendar day, 12 months back. */
export function archiveCutoffDay(now: Millis, months = ARCHIVE_AFTER_MONTHS): string {
  const d = new Date(now);
  d.setMonth(d.getMonth() - months);
  return dayKey(d.getTime());
}

const summaryKey = (day: string, taskId: Id) => `${day}|${taskId}`;

/**
 * Condenses stopped sessions that started and ended before the cutoff into one
 * summary per day and task, and drops their events, snapshots and prompts.
 * Pure: returns the same object when there is nothing to condense.
 *
 * Kept exact: net time, pause time, billable minutes (rounded per session, as
 * on the original invoice), number of sessions, interruptions and achieved
 * outcomes. Given up: start/end times and the per-session detail.
 */
export function compactSessions(state: AppState, now: Millis, months = ARCHIVE_AFTER_MONTHS): { state: AppState; condensed: number } {
  const cutoff = archiveCutoffDay(now, months);
  const projections = projectAll(state, now);
  const old = new Set(
    projections.filter((p) => p.status === 'stopped' && p.stoppedAt !== null && dayKey(p.startedAt) < cutoff && dayKey(p.stoppedAt) < cutoff).map((p) => p.sessionId),
  );
  // A session stays as long as a newer one still points to it (session stack).
  let changed = true;
  while (changed) {
    changed = false;
    for (const s of Object.values(state.sessions)) {
      if (s.parentSessionId && old.has(s.parentSessionId) && !old.has(s.id)) {
        old.delete(s.parentSessionId);
        changed = true;
      }
    }
  }

  const closedPromptBefore = new Date(`${cutoff}T00:00:00`).getTime();
  const oldPrompts = Object.values(state.checkIns).filter(
    (c) => (c.sessionId !== null && old.has(c.sessionId)) || (c.sessionId === null && (c.answeredAt ?? c.expiredAt ?? Infinity) < closedPromptBefore),
  );
  if (old.size === 0 && oldPrompts.length === 0) return { state, condensed: 0 };

  const summaries = new Map<string, DaySummary>(state.archive.map((a) => [summaryKey(a.day, a.taskId), { ...a }]));
  for (const p of projections) {
    if (!old.has(p.sessionId)) continue;
    const task = state.tasks[p.taskId];
    // Reports skip sessions whose task is gone; the summary does the same.
    if (!task) continue;
    const client = task.clientId ? state.clients[task.clientId] : undefined;
    const billable = task.billable && Boolean(client);
    const day = dayKey(p.startedAt);
    const key = summaryKey(day, task.id);
    const sum = summaries.get(key) ?? {
      day,
      taskId: task.id,
      taskTitle: task.title,
      clientId: client?.id ?? null,
      clientName: client?.name ?? 'Intern',
      billable,
      netMs: 0,
      pauseMs: 0,
      billableMin: 0,
      sessions: 0,
      interruptions: 0,
      achieved: 0,
    };
    sum.netMs += p.netMs;
    sum.pauseMs += p.pauseMs;
    if (billable && client) sum.billableMin += roundMinutes(p.netMs / MIN, client.rounding);
    sum.sessions += 1;
    sum.interruptions += p.interruptionCount;
    if (p.outcome === 'achieved') sum.achieved += 1;
    summaries.set(key, sum);
  }

  const sessions = { ...state.sessions };
  for (const id of old) delete sessions[id];
  const snapshots = Object.fromEntries(Object.entries(state.snapshots).filter(([, s]) => !old.has(s.sessionId)));
  const dropPrompts = new Set(oldPrompts.map((c) => c.id));
  const feelLog = Object.fromEntries(Object.entries(state.wellbeing.feelLog ?? {}).filter(([id]) => !old.has(id)));
  const checkIns = Object.fromEntries(Object.entries(state.checkIns).filter(([id]) => !dropPrompts.has(id)));

  return {
    state: {
      ...state,
      sessions,
      events: state.events.filter((e) => !old.has(e.sessionId)),
      snapshots,
      checkIns,
      wellbeing: { ...state.wellbeing, feelLog },
      archive: [...summaries.values()].sort((a, b) => (a.day === b.day ? a.taskTitle.localeCompare(b.taskTitle) : a.day < b.day ? -1 : 1)),
    },
    condensed: old.size,
  };
}
