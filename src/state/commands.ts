import {
  foregroundSession,
  MAX_STACK_DEPTH,
  projectAll,
  projectSession,
  sessionStack,
  type SessionProjection,
} from '../domain/session';
import { buildSnapshot } from '../domain/reentry';
import type {
  AppState,
  CheckIn,
  ChecklistItem,
  Client,
  Id,
  IdleResolution,
  Millis,
  NewSessionEvent,
  PauseReason,
  SessionEvent,
  SessionOutcome,
  Task,
  TaskPriority,
  TaskType,
} from '../domain/types';
import type { Action } from './reducer';
import { dayKey } from '../lib/time';
import { parseQuickAdd, plannedDayFor, resolveClient } from '../domain/quickAdd';

/**
 * Commands validate invariants against the current state and return the
 * actions to apply. They are pure: time and ids are injected.
 */
export interface Deps {
  now: Millis;
  newId: () => Id;
}

export type CommandResult = { ok: true; actions: Action[] } | { ok: false; error: string };

const ok = (actions: Action[]): CommandResult => ({ ok: true, actions });
const fail = (error: string): CommandResult => ({ ok: false, error });

function ev(deps: Deps, e: NewSessionEvent): Action {
  return { type: 'session/event', event: { ...e, id: deps.newId() } as SessionEvent };
}

function project(state: AppState, sessionId: Id, now: Millis): SessionProjection | null {
  return projectSession(state, state.events, sessionId, now);
}

// ---------------------------------------------------------------------------
// Tasks & clients
// ---------------------------------------------------------------------------

export interface TaskInput {
  title: string;
  type: TaskType;
  /** Own name when type is "other". */
  typeLabel?: string;
  clientId: Id | null;
  estimateMin: number;
  intention: string;
  billable?: boolean;
  priority?: TaskPriority;
  plannedStart?: Millis | null;
  plannedDay?: string;
  checklist?: string[];
  notes?: string;
}

export function createTask(state: AppState, deps: Deps, input: TaskInput, position: 'start' | 'end' = 'end'): CommandResult & { taskId?: Id } {
  const title = input.title.trim();
  if (!title) return fail('Bitte gib der Aufgabe einen Titel.');
  if (!Number.isFinite(input.estimateMin) || input.estimateMin < 5 || input.estimateMin > 600) {
    return fail('Bitte schätze zwischen 5 und 600 Minuten.');
  }
  const client = input.clientId ? state.clients[input.clientId] : undefined;
  if (input.clientId && !client) return fail('Unbekannter Kunde.');
  const id = deps.newId();
  const task: Task = {
    id,
    title,
    type: input.type,
    ...(input.type === 'other' && input.typeLabel?.trim() ? { typeLabel: input.typeLabel.trim().slice(0, 40) } : {}),
    clientId: client?.id ?? null,
    estimateMin: Math.round(input.estimateMin),
    intention: input.intention.trim() || title,
    status: 'planned',
    priority: input.priority ?? 'normal',
    billable: input.billable ?? client?.billableDefault ?? false,
    checklist: (input.checklist ?? [])
      .map((l) => l.trim())
      .filter(Boolean)
      .map((label): ChecklistItem => ({ id: deps.newId(), label, doneAt: null })),
    notes: input.notes ?? '',
    plannedStart: input.plannedStart ?? null,
    plannedDay: input.plannedDay ?? dayKey(deps.now),
    createdAt: deps.now,
    updatedAt: deps.now,
  };
  return { ...ok([{ type: 'task/add', task, position }]), taskId: id };
}

/** Estimate when the quick line names none: a small, honest default. */
export const QUICK_DEFAULT_MIN = 30;

/**
 * One line from quick capture becomes a task (see domain/quickAdd). An
 * unknown @client stays in the title instead of disappearing.
 */
export function quickAddTask(state: AppState, deps: Deps, line: string): CommandResult & { taskId?: Id; plannedDay?: string; clientName?: string } {
  const draft = parseQuickAdd(line);
  const client = resolveClient(draft.clientQuery, state.clients);
  const title = draft.clientQuery && !client ? `${draft.title} @${draft.clientQuery}` : draft.title;
  const plannedDay = plannedDayFor(draft, dayKey(deps.now));
  const result = createTask(state, deps, {
    title,
    type: 'deep_work',
    clientId: client?.id ?? null,
    estimateMin: Math.min(600, Math.max(5, draft.estimateMin ?? QUICK_DEFAULT_MIN)),
    intention: '',
    priority: draft.priority ?? 'normal',
    plannedDay,
  });
  return result.ok ? { ...result, plannedDay, ...(client ? { clientName: client.name } : {}) } : result;
}

export function updateTask(state: AppState, deps: Deps, id: Id, patch: Partial<Omit<Task, 'id' | 'createdAt'>>): CommandResult {
  if (!state.tasks[id]) return fail('Aufgabe nicht gefunden.');
  if (patch.title !== undefined && !patch.title.trim()) return fail('Der Titel darf nicht leer sein.');
  return ok([{ type: 'task/update', id, patch, at: deps.now }]);
}

export function toggleChecklistItem(state: AppState, deps: Deps, taskId: Id, itemId: Id): CommandResult {
  const task = state.tasks[taskId];
  if (!task) return fail('Aufgabe nicht gefunden.');
  const checklist = task.checklist.map((i) =>
    i.id === itemId ? { ...i, doneAt: i.doneAt === null ? deps.now : null } : i,
  );
  return ok([{ type: 'task/update', id: taskId, patch: { checklist }, at: deps.now }]);
}

export function addChecklistItem(state: AppState, deps: Deps, taskId: Id, label: string, atStart = false): CommandResult {
  const task = state.tasks[taskId];
  if (!task) return fail('Aufgabe nicht gefunden.');
  if (!label.trim()) return fail('Leerer Schritt.');
  const item: ChecklistItem = { id: deps.newId(), label: label.trim(), doneAt: null };
  const checklist = atStart ? [item, ...task.checklist] : [...task.checklist, item];
  return ok([{ type: 'task/update', id: taskId, patch: { checklist }, at: deps.now }]);
}

/** "Zu groß" → split into sub-tasks that inherit client and type. */
export function splitTask(state: AppState, deps: Deps, taskId: Id, titles: string[]): CommandResult {
  const task = state.tasks[taskId];
  if (!task) return fail('Aufgabe nicht gefunden.');
  const parts = titles.map((t) => t.trim()).filter(Boolean);
  if (parts.length < 2) return fail('Mindestens zwei Teilschritte angeben.');
  const per = Math.max(10, Math.round(task.estimateMin / parts.length / 5) * 5);
  const actions: Action[] = [];
  for (const title of [...parts].reverse()) {
    const r = createTask(state, deps, {
      title,
      type: task.type,
      clientId: task.clientId,
      estimateMin: per,
      intention: title,
      billable: task.billable,
      priority: task.priority,
      plannedDay: task.plannedDay,
    }, 'start');
    if (!r.ok) return r;
    actions.push(...r.actions);
  }
  actions.push({ type: 'task/update', id: taskId, patch: { status: 'dropped', notes: `${task.notes}\nAufgeteilt in: ${parts.join(', ')}`.trim() }, at: deps.now });
  return ok(actions);
}

export function deferTask(state: AppState, deps: Deps, taskId: Id, day: string): CommandResult {
  if (!state.tasks[taskId]) return fail('Aufgabe nicht gefunden.');
  return ok([{ type: 'task/update', id: taskId, patch: { plannedDay: day, plannedStart: null, status: 'planned' }, at: deps.now }]);
}

export function upsertClient(_state: AppState, deps: Deps, input: Omit<Client, 'id' | 'archived'> & { id?: Id; archived?: boolean }): CommandResult {
  if (!input.name.trim()) return fail('Bitte einen Kundennamen angeben.');
  if (!Number.isFinite(input.hourlyRate) || input.hourlyRate < 0) return fail('Ungültiger Stundensatz.');
  return ok([
    {
      type: 'client/upsert',
      client: {
        id: input.id ?? deps.newId(),
        name: input.name.trim(),
        hourlyRate: input.hourlyRate,
        billableDefault: input.billableDefault,
        rounding: input.rounding,
        archived: input.archived ?? false,
      },
    },
  ]);
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

export function startSession(
  state: AppState,
  deps: Deps,
  input: { taskId: Id; timeboxMin: number; intention: string },
): CommandResult & { sessionId?: Id } {
  const task = state.tasks[input.taskId];
  if (!task) return fail('Aufgabe nicht gefunden.');
  if (task.status === 'done') return fail('Diese Aufgabe ist bereits erledigt.');
  const fg = foregroundSession(projectAll(state, deps.now));
  if (fg) return fail('Es läuft bereits eine Session. Pausiere oder beende sie zuerst – oder nutze „Unterbrechung“.');
  if (!Number.isFinite(input.timeboxMin) || input.timeboxMin < 1 || input.timeboxMin > 480) {
    return fail('Wähle eine Timebox zwischen 1 und 480 Minuten.');
  }
  const sessionId = deps.newId();
  return {
    ...ok([
      { type: 'session/create', session: { id: sessionId, taskId: task.id, parentSessionId: null, createdAt: deps.now } },
      ev(deps, { type: 'started', sessionId, at: deps.now, timeboxMin: Math.round(input.timeboxMin), intention: input.intention.trim() || task.intention }),
      { type: 'task/update', id: task.id, patch: { status: 'in_progress', intention: input.intention.trim() || task.intention }, at: deps.now },
    ]),
    sessionId,
  };
}

export function pauseSession(state: AppState, deps: Deps, sessionId: Id, reason: PauseReason = 'none', plannedMin: number | null = null): CommandResult {
  const p = project(state, sessionId, deps.now);
  if (!p) return fail('Session nicht gefunden.');
  if (p.status !== 'running') return fail('Nur eine laufende Session kann pausiert werden.');
  return ok([ev(deps, { type: 'paused', sessionId, at: deps.now, reason, plannedMin })]);
}

export function annotatePause(state: AppState, deps: Deps, sessionId: Id, reason: PauseReason, plannedMin: number | null): CommandResult {
  const p = project(state, sessionId, deps.now);
  if (!p?.currentPause) return fail('Keine offene Pause.');
  return ok([ev(deps, { type: 'pause_annotated', sessionId, at: deps.now, reason, plannedMin })]);
}

export function resumeSession(state: AppState, deps: Deps, sessionId: Id): CommandResult {
  const p = project(state, sessionId, deps.now);
  if (!p) return fail('Session nicht gefunden.');
  if (p.status !== 'paused') return fail('Die Session ist nicht pausiert.');
  return ok([ev(deps, { type: 'resumed', sessionId, at: deps.now }), ...closeOpenPrompts(state, deps, sessionId, ['pause_over'], 'resume')]);
}

export function saveSnapshot(state: AppState, deps: Deps, sessionId: Id, parkingNote: string, resources: string[] = []): CommandResult & { snapshotId?: Id } {
  const p = project(state, sessionId, deps.now);
  const task = p ? state.tasks[p.taskId] : undefined;
  if (!p || !task) return fail('Session nicht gefunden.');
  const id = deps.newId();
  const snapshot = buildSnapshot(id, p, task, parkingNote, resources.map((r) => r.trim()).filter(Boolean), deps.now);
  return {
    ...ok([{ type: 'snapshot/save', snapshot }, ev(deps, { type: 'snapshot_saved', sessionId, at: deps.now, snapshotId: id })]),
    snapshotId: id,
  };
}

/**
 * Interruption by other work: the foreground session goes onto the stack and
 * a new session (with its own client and billing) starts immediately.
 */
export function interruptWith(
  state: AppState,
  deps: Deps,
  input: {
    sessionId: Id;
    reason: PauseReason;
    title: string;
    clientId: Id | null;
    type: TaskType;
    parkingNote?: string;
    timeboxMin?: number;
  },
): CommandResult & { newSessionId?: Id } {
  const projections = projectAll(state, deps.now);
  const p = projections.find((x) => x.sessionId === input.sessionId);
  if (!p || (p.status !== 'running' && p.status !== 'paused')) return fail('Keine aktive Session zum Unterbrechen.');
  if (sessionStack(projections).length >= MAX_STACK_DEPTH) {
    return fail(`Maximal ${MAX_STACK_DEPTH} unterbrochene Sessions. Schließe zuerst eine ab.`);
  }
  const actions: Action[] = [];
  if (input.parkingNote?.trim()) {
    const snap = saveSnapshot(state, deps, input.sessionId, input.parkingNote);
    if (snap.ok) actions.push(...snap.actions);
  }
  const created = createTask(state, deps, {
    title: input.title,
    type: input.type,
    clientId: input.clientId,
    estimateMin: Math.max(5, input.timeboxMin ?? 15),
    intention: input.title,
  }, 'start');
  if (!created.ok || !created.taskId) return created;
  actions.push(...created.actions);

  const newSessionId = deps.newId();
  actions.push(
    ev(deps, { type: 'interrupted', sessionId: input.sessionId, at: deps.now, reason: input.reason, bySessionId: newSessionId }),
    { type: 'session/create', session: { id: newSessionId, taskId: created.taskId, parentSessionId: input.sessionId, createdAt: deps.now } },
    ev(deps, { type: 'started', sessionId: newSessionId, at: deps.now, timeboxMin: input.timeboxMin ?? 15, intention: input.title.trim() }),
    { type: 'task/update', id: created.taskId, patch: { status: 'in_progress' }, at: deps.now },
    ...closeOpenPrompts(state, deps, input.sessionId, null, 'interrupted'),
  );
  return { ...ok(actions), newSessionId };
}

export function returnToSession(state: AppState, deps: Deps, sessionId: Id): CommandResult {
  const projections = projectAll(state, deps.now);
  const p = projections.find((x) => x.sessionId === sessionId);
  if (!p || p.status !== 'interrupted') return fail('Diese Session ist nicht unterbrochen.');
  if (foregroundSession(projections)) return fail('Beende oder pausiere zuerst die aktuelle Session.');
  return ok([ev(deps, { type: 'returned', sessionId, at: deps.now })]);
}

export function extendSession(state: AppState, deps: Deps, sessionId: Id, minutes: number): CommandResult {
  const p = project(state, sessionId, deps.now);
  if (!p || p.status === 'stopped') return fail('Session nicht aktiv.');
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 240) return fail('Ungültige Verlängerung.');
  return ok([ev(deps, { type: 'extended', sessionId, at: deps.now, minutes: Math.round(minutes) })]);
}

export function resolveIdle(state: AppState, deps: Deps, sessionId: Id, from: Millis, to: Millis, resolution: IdleResolution): CommandResult {
  const p = project(state, sessionId, deps.now);
  if (!p) return fail('Session nicht gefunden.');
  if (to <= from) return fail('Ungültiges Zeitfenster.');
  return ok([ev(deps, { type: 'idle_resolved', sessionId, at: deps.now, from, to: Math.min(to, deps.now), resolution })]);
}

export function correctSession(state: AppState, deps: Deps, sessionId: Id, deductMin: number, note: string): CommandResult {
  const p = project(state, sessionId, deps.now);
  if (!p) return fail('Session nicht gefunden.');
  if (!Number.isFinite(deductMin) || deductMin <= 0) return fail('Bitte eine positive Minutenzahl angeben.');
  if (deductMin * 60_000 > p.netMs) return fail('Die Korrektur ist größer als die erfasste Netto-Zeit.');
  return ok([ev(deps, { type: 'corrected', sessionId, at: deps.now, deductMin: Math.round(deductMin), note: note.trim() })]);
}

export function stopSession(
  state: AppState,
  deps: Deps,
  sessionId: Id,
  outcome: SessionOutcome,
  options: { restNote?: string; deferTo?: string } = {},
): CommandResult {
  const p = project(state, sessionId, deps.now);
  if (!p) return fail('Session nicht gefunden.');
  if (p.status === 'stopped') return fail('Session ist bereits beendet.');
  const task = state.tasks[p.taskId];
  const actions: Action[] = [
    ev(deps, { type: 'stopped', sessionId, at: deps.now, outcome }),
    ...closeOpenPrompts(state, deps, sessionId, null, 'stopped'),
  ];
  if (task) {
    const rest = options.restNote?.trim();
    const patch: Partial<Task> =
      outcome === 'achieved'
        ? { status: 'done' }
        : {
            status: 'planned',
            notes: rest ? `${task.notes}\nOffen: ${rest}`.trim() : task.notes,
            ...(options.deferTo ? { plannedDay: options.deferTo, plannedStart: null } : {}),
          };
    actions.push({ type: 'task/update', id: task.id, patch, at: deps.now });
  }
  return ok(actions);
}

/** "Info fehlt vom Kunden": park the task as waiting and stop the session. */
export function markWaiting(state: AppState, deps: Deps, sessionId: Id, note: string): CommandResult {
  const stopped = stopSession(state, deps, sessionId, 'partial', { restNote: note });
  if (!stopped.ok) return stopped;
  const p = project(state, sessionId, deps.now);
  if (!p) return stopped;
  return ok([...stopped.actions, { type: 'task/update', id: p.taskId, patch: { status: 'waiting' }, at: deps.now }]);
}

/**
 * Lücken-Assistent: book an untracked window retroactively as a finished
 * session. Events carry the historic timestamps; nothing existing is altered.
 */
export function bookGap(
  state: AppState,
  deps: Deps,
  input: { from: Millis; to: Millis; title: string; clientId: Id | null; type: TaskType },
): CommandResult {
  if (input.to - input.from < 60_000) return fail('Die Lücke ist zu kurz.');
  if (input.to > deps.now) return fail('Lücken können nur rückwirkend gebucht werden.');
  const created = createTask(state, deps, {
    title: input.title,
    type: input.type,
    clientId: input.clientId,
    estimateMin: Math.max(5, Math.round((input.to - input.from) / 60_000)),
    intention: input.title,
  });
  if (!created.ok || !created.taskId) return created;
  const sessionId = deps.newId();
  const minutes = Math.max(1, Math.round((input.to - input.from) / 60_000));
  return ok([
    ...created.actions,
    { type: 'task/update', id: created.taskId, patch: { status: 'done' }, at: deps.now },
    { type: 'session/create', session: { id: sessionId, taskId: created.taskId, parentSessionId: null, createdAt: deps.now } },
    ev(deps, { type: 'started', sessionId, at: input.from, timeboxMin: minutes, intention: input.title.trim() }),
    ev(deps, { type: 'stopped', sessionId, at: input.to, outcome: 'achieved' }),
  ]);
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

export function sendCheckIn(deps: Deps, input: Omit<CheckIn, 'id' | 'sentAt' | 'answeredAt' | 'expiredAt' | 'answer'>): Action[] {
  const checkIn: CheckIn = { ...input, id: deps.newId(), sentAt: deps.now, answeredAt: null, expiredAt: null, answer: null };
  const actions: Action[] = [{ type: 'checkin/send', checkIn }];
  if (input.sessionId === null || ['break_suggestion', 'daily_cap', 'shutdown'].includes(input.kind)) {
    actions.push({ type: 'coach/raised', kind: input.kind, at: deps.now });
  }
  return actions;
}

/** Marks open prompts of a session as answered by a system action (no "ignored" penalty). */
export function closeOpenPrompts(state: AppState, deps: Deps, sessionId: Id, kinds: CheckIn['kind'][] | null, answer: string): Action[] {
  return Object.values(state.checkIns)
    .filter((c) => c.sessionId === sessionId && c.answeredAt === null && c.expiredAt === null && (kinds === null || kinds.includes(c.kind)))
    .map((c) => ({ type: 'checkin/answer', id: c.id, answer: `system:${answer}`, at: deps.now }) as const);
}

/** Mikro-Schritt-Modus: gives a task without steps three small bites. */
export function addMicroBites(state: AppState, deps: Deps, taskId: Id, labels: readonly string[]): CommandResult {
  const task = state.tasks[taskId];
  if (!task) return fail('Aufgabe nicht gefunden.');
  if (task.checklist.length > 0) return fail('Die Aufgabe hat schon Schritte.');
  const checklist: ChecklistItem[] = labels.map((label) => ({ id: deps.newId(), label, doneAt: null }));
  return ok([{ type: 'task/update', id: taskId, patch: { checklist }, at: deps.now }]);
}
