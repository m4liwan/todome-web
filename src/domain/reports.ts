import type { SessionProjection } from './session';
import type { AppState, Client, Id, Millis, Rounding, TaskType } from './types';
import { dayKey, formatTime, median, MIN } from '../lib/time';
import { contextLabels } from './userContext';

/** Projection of stopped (and still open) sessions into time entries for reports. */
export interface TimeEntry {
  sessionId: Id;
  day: string;
  start: Millis;
  end: Millis | null;
  taskTitle: string;
  intention: string;
  clientId: Id | null;
  clientName: string;
  billable: boolean;
  netMs: Millis;
  /** Pause counted for the look back: each pause at most `maxPauseMs` (see countedPauseMs). */
  pauseMs: Millis;
  interruptions: number;
  outcome: string | null;
  open: boolean;
  /** Day summary of condensed old sessions: no clock times, billing kept exact. */
  archived?: { sessions: number; billableMin: number };
}

/**
 * A pause longer than this was no break: the session was parked (overnight,
 * over a weekend, or while the computer slept, which pauses a running
 * session at the moment it went to sleep). The event log keeps the real
 * length; the look back counts each pause at most this long.
 */
export const MAX_COUNTED_PAUSE_MS = 90 * MIN;
/** Highest pause index shown: 200 % (twice as much pause as focus). */
export const MAX_PAUSE_RATIO = 2;

export interface ReportOptions {
  /** Longest pause counted per pause (default MAX_COUNTED_PAUSE_MS). */
  maxPauseMs?: Millis;
}

/** Pause time of one session as the look back counts it: every single pause capped. */
export function countedPauseMs(p: Pick<SessionProjection, 'pauseIntervals'>, maxPauseMs: Millis = MAX_COUNTED_PAUSE_MS): Millis {
  return p.pauseIntervals.reduce((sum, [start, end]) => sum + Math.min(Math.max(0, end - start), maxPauseMs), 0);
}

export function toTimeEntries(state: AppState, projections: readonly SessionProjection[], opts: ReportOptions = {}): TimeEntry[] {
  return projections
    .map((p): TimeEntry | null => {
      const task = state.tasks[p.taskId];
      if (!task) return null;
      const client = task.clientId ? state.clients[task.clientId] : undefined;
      return {
        sessionId: p.sessionId,
        day: dayKey(p.startedAt),
        start: p.startedAt,
        end: p.stoppedAt,
        taskTitle: task.title,
        intention: p.intention,
        clientId: client?.id ?? null,
        clientName: client?.name ?? 'Intern',
        billable: task.billable && Boolean(client),
        netMs: p.netMs,
        pauseMs: countedPauseMs(p, opts.maxPauseMs),
        interruptions: p.interruptionCount,
        outcome: p.outcome,
        open: p.status !== 'stopped',
      };
    })
    .filter((e): e is TimeEntry => e !== null)
    .concat(archivedEntries(state, opts))
    .sort((a, b) => a.start - b.start);
}

/** Condensed sessions as one entry per day and task (placed at noon of that day). */
export function archivedEntries(state: Pick<AppState, 'archive'>, opts: ReportOptions = {}): TimeEntry[] {
  const cap = opts.maxPauseMs ?? MAX_COUNTED_PAUSE_MS;
  return (state.archive ?? []).map((a) => {
    const noon = new Date(`${a.day}T12:00:00`).getTime();
    return {
      sessionId: `archiv:${a.day}:${a.taskId}`,
      day: a.day,
      start: noon,
      end: noon,
      taskTitle: a.taskTitle,
      intention: '',
      clientId: a.clientId,
      clientName: a.clientName,
      billable: a.billable,
      netMs: a.netMs,
      // Summaries condensed before the cap existed: at most one capped pause per session.
      pauseMs: Math.min(a.pauseMs, a.sessions * cap),
      interruptions: a.interruptions,
      outcome: a.achieved > 0 ? 'achieved' : null,
      open: false,
      archived: { sessions: a.sessions, billableMin: a.billableMin },
    };
  });
}

/** Billable minutes of one entry: rounded per session, or kept from the summary. */
export function billableMinutes(e: TimeEntry, client: Client | undefined): number {
  if (!e.billable || !client) return 0;
  return e.archived ? e.archived.billableMin : roundMinutes(e.netMs / MIN, client.rounding);
}

/** Rounding is applied on export only – raw data stays minute-exact. */
export function roundMinutes(minutes: number, rounding: Rounding): number {
  if (rounding === 'six') return Math.ceil(minutes / 6) * 6;
  if (rounding === 'fifteen') return Math.ceil(minutes / 15) * 15;
  return Math.round(minutes);
}

export interface ClientTotal {
  clientId: Id | null;
  clientName: string;
  netMs: Millis;
  billableMin: number;
  amount: number;
}

export function totalsByClient(entries: readonly TimeEntry[], clients: Record<Id, Client>): ClientTotal[] {
  const map = new Map<string, ClientTotal>();
  for (const e of entries) {
    const key = e.clientId ?? '__internal__';
    const client = e.clientId ? clients[e.clientId] : undefined;
    const t = map.get(key) ?? { clientId: e.clientId, clientName: e.clientName, netMs: 0, billableMin: 0, amount: 0 };
    t.netMs += e.netMs;
    if (e.billable && client) {
      const min = billableMinutes(e, client);
      t.billableMin += min;
      t.amount += (min / 60) * client.hourlyRate;
    }
    map.set(key, t);
  }
  return [...map.values()].sort((a, b) => b.netMs - a.netMs);
}

function csvCell(value: string | number): string {
  const s = String(value);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Semicolon-separated CSV with BOM (opens cleanly in German Excel). */
export function entriesToCsv(entries: readonly TimeEntry[], clients: Record<Id, Client>): string {
  const header = ['Datum', 'Start', 'Ende', 'Kunde', 'Aufgabe', 'Tätigkeit', 'Netto (min)', 'Abrechenbar (min)', 'Stundensatz', 'Betrag (EUR)'];
  const rows = entries.map((e) => {
    const client = e.clientId ? clients[e.clientId] : undefined;
    const netMin = Math.round(e.netMs / MIN);
    const billMin = billableMinutes(e, client);
    const amount = client ? (billMin / 60) * client.hourlyRate : 0;
    return [
      e.day,
      e.archived ? '' : formatTime(e.start),
      e.archived ? '' : e.end ? formatTime(e.end) : 'läuft',
      e.clientName,
      e.taskTitle,
      e.archived ? `Tagessumme (${e.archived.sessions} Sessions)` : e.intention,
      netMin,
      billMin,
      client ? client.hourlyRate.toFixed(2).replace('.', ',') : '',
      amount.toFixed(2).replace('.', ','),
    ];
  });
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
}

/**
 * Personal estimation factor: median(actual ÷ planned) of the last 10 finished
 * sessions of a type (and client, if enough data), clamped to 0.5–3.0.
 */
export function estimationFactor(
  state: AppState,
  projections: readonly SessionProjection[],
  type: TaskType,
  clientId: Id | null,
): number | null {
  const finished = projections
    .filter((p) => p.status === 'stopped' && p.timeboxMin > 0 && state.tasks[p.taskId]?.type === type)
    .sort((a, b) => (b.stoppedAt ?? 0) - (a.stoppedAt ?? 0));
  const sameClient = finished.filter((p) => state.tasks[p.taskId]?.clientId === clientId);
  const sample = (sameClient.length >= 3 ? sameClient : finished).slice(0, 10);
  if (sample.length < 3) return null;
  const m = median(sample.map((p) => p.netMs / (p.timeboxMin * MIN)));
  return m === null ? null : Math.min(3, Math.max(0.5, m));
}

/**
 * Lücken-Assistent: windows inside [from, to] not covered by any session
 * (start → stop), minus excluded windows such as lunch.
 */
export function findGaps(
  projections: readonly SessionProjection[],
  from: Millis,
  to: Millis,
  minGapMs: Millis,
  excluded: ReadonlyArray<readonly [Millis, Millis]> = [],
): Array<[Millis, Millis]> {
  if (to <= from) return [];
  const covered = [
    ...projections.map((p) => [p.startedAt, p.stoppedAt ?? to] as const),
    ...excluded,
  ]
    .map(([s, e]) => [Math.max(s, from), Math.min(e, to)] as const)
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  const gaps: Array<[Millis, Millis]> = [];
  let cursor = from;
  for (const [s, e] of covered) {
    if (s - cursor >= minGapMs) gaps.push([cursor, s]);
    cursor = Math.max(cursor, e);
  }
  if (to - cursor >= minGapMs) gaps.push([cursor, to]);
  return gaps;
}

// ---------------------------------------------------------------------------
// Weekly look back – recognition, not a spreadsheet
// ---------------------------------------------------------------------------

export interface WeekDay {
  day: string;
  netMs: Millis;
  billableMs: Millis;
  sessions: number;
  done: number;
  water: number;
  pauseMs: Millis;
}

export interface WeekSummary {
  days: WeekDay[];
  focusMs: Millis;
  billableMs: Millis;
  amount: number;
  sessions: number;
  tasksDone: string[];
  longestBlockMs: Millis;
  bestDay: WeekDay | null;
  activeDays: number;
  waterGoalDays: number;
  clients: ClientTotal[];
  pauseMs: Millis;
}

/** The last seven days ending today. */
export function weekSummary(state: AppState, projections: readonly SessionProjection[], now: Millis, opts: ReportOptions = {}): WeekSummary {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(dayKey(d.getTime()));
  }
  const inWeek = new Set(days);
  const entries = toTimeEntries(state, projections, opts).filter((e) => inWeek.has(e.day));
  const doneTitles: string[] = [];
  const weekDays: WeekDay[] = days.map((day) => {
    const list = entries.filter((e) => e.day === day);
    const achieved = list.filter((e) => e.outcome === 'achieved');
    for (const e of achieved) if (!doneTitles.includes(e.taskTitle)) doneTitles.push(e.taskTitle);
    return {
      day,
      netMs: list.reduce((a, e) => a + e.netMs, 0),
      billableMs: list.filter((e) => e.billable).reduce((a, e) => a + e.netMs, 0),
      sessions: list.length,
      done: achieved.length,
      water: state.wellbeing.waterLog[day] ?? (state.wellbeing.waterDay === day ? state.wellbeing.waterCount : 0),
      pauseMs: list.reduce((a, e) => a + e.pauseMs, 0),
    };
  });
  const clients = totalsByClient(entries, state.clients);
  const best = [...weekDays].sort((a, b) => b.netMs - a.netMs)[0];
  return {
    days: weekDays,
    focusMs: weekDays.reduce((a, d) => a + d.netMs, 0),
    billableMs: weekDays.reduce((a, d) => a + d.billableMs, 0),
    amount: clients.reduce((a, c) => a + c.amount, 0),
    sessions: entries.length,
    tasksDone: doneTitles,
    longestBlockMs: Math.max(0, ...entries.map((e) => e.netMs)),
    bestDay: best && best.netMs > 0 ? best : null,
    activeDays: weekDays.filter((d) => d.netMs > 0).length,
    waterGoalDays: weekDays.filter((d) => d.water >= state.settings.companion.waterGoal).length,
    clients,
    pauseMs: weekDays.reduce((a, d) => a + d.pauseMs, 0),
  };
}

// ---------------------------------------------------------------------------
// Self-care: gentle indices, never a grade
// ---------------------------------------------------------------------------

export interface CarePart {
  id: 'pauses' | 'proud' | 'closed' | 'water' | 'routines';
  label: string;
  /** 0 … 1 */
  value: number;
}

export interface CareSummary {
  /** Pause time relative to focus time this week. */
  pauseRatio: number;
  pauseWord: string;
  /** 0 … 100, how kindly you treated yourself. */
  selfCompassion: number;
  selfCompassionWord: string;
  parts: CarePart[];
  /** Energy per day (oldest first), null where not asked. */
  energy: Array<{ day: string; level: number | null }>;
  energyWord: string;
}

export function careSummary(state: AppState, week: WeekSummary): CareSummary {
  const w = state.wellbeing;
  const days = week.days.map((d) => d.day);
  const active = Math.max(1, week.activeDays);
  // A few minutes of focus next to a long pause would make any ratio explode: capped at 200 %.
  const pauseRatio = week.focusMs > 0 ? Math.min(MAX_PAUSE_RATIO, week.pauseMs / week.focusMs) : 0;
  const share = (n: number) => Math.min(1, n / active);
  const parts: CarePart[] = [
    { id: 'pauses', label: 'Pausen gegönnt', value: Math.min(1, pauseRatio / 0.12) },
    { id: 'proud', label: 'Stolz notiert', value: share(days.filter((d) => Boolean(w.proud[d])).length) },
    { id: 'closed', label: contextLabels(state.settings.userContext).closedDays, value: share(days.filter((d) => w.closedLog[d]).length) },
    { id: 'water', label: 'Gut getrunken', value: share(week.waterGoalDays) },
    { id: 'routines', label: 'Wohlfühl-Momente', value: share(days.filter((d) => (w.routines[d] ?? []).length > 0).length) },
  ];
  const selfCompassion = Math.round((parts.reduce((a, p) => a + p.value, 0) / parts.length) * 100);
  const energy = days.map((day) => ({ day, level: w.energyLog[day] ?? (w.energyDay === day ? w.energyLevel : null) }));
  const known = energy.map((e) => e.level).filter((l): l is number => l !== null);
  const first = known.slice(0, Math.ceil(known.length / 2));
  const last = known.slice(Math.floor(known.length / 2));
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const trend = known.length >= 3 ? avg(last) - avg(first) : 0;
  return {
    pauseRatio,
    pauseWord:
      week.focusMs === 0
        ? 'Noch keine Fokuszeit diese Woche.'
        : pauseRatio < 0.05
          ? 'Kaum Pausen. Dein Kopf freut sich über etwas mehr Luft.'
          : pauseRatio <= 0.3
            ? 'Ein gesunder Rhythmus aus Fokus und Erholung.'
            : 'Viel Erholung. Auch das ist produktiv.',
    selfCompassion,
    selfCompassionWord:
      selfCompassion >= 70 ? 'Du gehst liebevoll mit dir um.' : selfCompassion >= 40 ? 'Du achtest auf dich, Schritt für Schritt.' : 'Da ist noch Raum für mehr Freundlichkeit mit dir.',
    parts,
    energy,
    energyWord:
      known.length < 2
        ? 'Sobald du ein paar Tage deine Energie einträgst, siehst du hier deinen Verlauf.'
        : trend > 0.8
          ? 'Deine Energie steigt. Was auch immer du gerade anders machst: Es tut dir gut.'
          : trend < -0.8
            ? 'Deine Energie sinkt etwas. Das ist ein freundlicher Hinweis, dir mehr Ruhe zu gönnen.'
            : 'Deine Energie ist recht stabil. Ein guter Boden für deine Woche.',
  };
}
