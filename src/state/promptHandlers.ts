import type { AnswerId } from '../domain/copy';
import { foregroundSession, projectAll, projectSession } from '../domain/session';
import type { AppState, CheckIn, Id } from '../domain/types';
import { addDays, dayKey, HOUR, MIN } from '../lib/time';
import {
  annotatePause,
  deferTask,
  extendSession,
  pauseSession,
  resolveIdle,
  startSession,
  stopSession,
  updateTask,
  type CommandResult,
  type Deps,
} from './commands';
import type { Action } from './reducer';

/** What the UI should open next after an answer (dialogs are UI concerns). */
export type FollowUp =
  | { kind: 'stuck'; sessionId: Id }
  | { kind: 'end_check'; sessionId: Id }
  | { kind: 'reentry'; sessionId: Id; mode: 'resume' | 'info' }
  | { kind: 'pause_details'; sessionId: Id }
  | { kind: 're_estimate'; sessionId: Id }
  | { kind: 'correct_time'; sessionId: Id }
  | { kind: 'sharpen_dod'; sessionId: Id }
  | { kind: 'shutdown' };

export interface AnswerOutcome {
  result: CommandResult;
  followUp: FollowUp | null;
}

const answered = (checkIn: CheckIn, answer: AnswerId, deps: Deps): Action => ({
  type: 'checkin/answer',
  id: checkIn.id,
  answer,
  at: deps.now,
});

function chain(base: Action, ...results: CommandResult[]): CommandResult {
  const actions: Action[] = [base];
  for (const r of results) {
    if (!r.ok) return r;
    actions.push(...r.actions);
  }
  return { ok: true, actions };
}

/**
 * Maps a prompt answer to state changes + an optional UI follow-up.
 * Pure: the caller dispatches `result.actions` and opens `followUp`.
 */
export function handleAnswer(state: AppState, deps: Deps, checkIn: CheckIn, answer: AnswerId): AnswerOutcome {
  const record = answered(checkIn, answer, deps);
  const sid = checkIn.sessionId;
  const none = (): AnswerOutcome => ({ result: { ok: true, actions: [record] }, followUp: null });
  const withSession = (fn: (sessionId: Id) => AnswerOutcome): AnswerOutcome => (sid ? fn(sid) : none());

  switch (answer) {
    case 'ok':
    case 'yes':
    case 'on_track':
    case 'continue':
      return none();

    case 'stuck':
    case 'not_yet':
    case 'cause_stuck':
      return withSession((s) => ({ result: chain(record), followUp: { kind: 'stuck', sessionId: s } }));

    case 'extend_10':
    case 'extend_15':
    case 'extend_25': {
      const minutes = answer === 'extend_10' ? 10 : answer === 'extend_15' ? 15 : 25;
      return withSession((s) => ({ result: chain(record, extendSession(state, deps, s, minutes)), followUp: null }));
    }

    case 'finish':
      return withSession((s) => ({ result: chain(record), followUp: { kind: 'end_check', sessionId: s } }));

    case 'defer':
      return withSession((s) => ({
        result: chain(record, stopSession(state, deps, s, 'partial', { deferTo: addDays(dayKey(deps.now), 1) })),
        followUp: null,
      }));

    case 'cause_bigger':
      return withSession((s) => ({ result: chain(record), followUp: { kind: 're_estimate', sessionId: s } }));
    case 'cause_interrupted':
      return withSession((s) => ({ result: chain(record), followUp: { kind: 'correct_time', sessionId: s } }));
    case 'cause_perfection':
      return withSession((s) => ({ result: chain(record), followUp: { kind: 'sharpen_dod', sessionId: s } }));

    case 'resume':
      return withSession((s) => ({ result: chain(record), followUp: { kind: 'reentry', sessionId: s, mode: 'resume' } }));

    case 'extend_pause':
      return withSession((s) => {
        const p = projectSession(state, state.events, s, deps.now);
        const pause = p?.currentPause;
        if (!pause) return none();
        // plannedMin counts from the pause start → current length + 10.
        const elapsed = Math.round((deps.now - pause.since) / MIN);
        return { result: chain(record, annotatePause(state, deps, s, pause.reason, elapsed + 10)), followUp: null };
      });

    case 'working':
    case 'break':
    case 'distracted':
      return withSession((s) => {
        const from = typeof checkIn.data.from === 'number' ? checkIn.data.from : null;
        const to = typeof checkIn.data.to === 'number' ? checkIn.data.to : null;
        if (from === null || to === null) return none();
        return {
          result: chain(record, resolveIdle(state, deps, s, from, to, answer)),
          followUp: answer === 'distracted' ? { kind: 'reentry', sessionId: s, mode: 'info' } : null,
        };
      });

    case 'start_5': {
      const taskId = checkIn.taskId;
      const task = taskId ? state.tasks[taskId] : undefined;
      if (!task) return none();
      return { result: chain(record, startSession(state, deps, { taskId: task.id, timeboxMin: 5, intention: task.intention })), followUp: null };
    }

    case 'later': {
      if (checkIn.kind === 'shutdown') {
        return { result: { ok: true, actions: [record, { type: 'coach/snooze', kind: 'shutdown', until: deps.now + 15 * MIN }] }, followUp: null };
      }
      const task = checkIn.taskId ? state.tasks[checkIn.taskId] : undefined;
      if (!task) return none();
      return { result: chain(record, updateTask(state, deps, task.id, { plannedStart: deps.now + HOUR })), followUp: null };
    }

    case 'tomorrow': {
      const task = checkIn.taskId ? state.tasks[checkIn.taskId] : undefined;
      if (!task) return none();
      return { result: chain(record, deferTask(state, deps, task.id, addDays(dayKey(deps.now), 1))), followUp: null };
    }

    case 'take_break': {
      const fg = foregroundSession(projectAll(state, deps.now));
      if (!fg || fg.status !== 'running') return none();
      return {
        result: chain(record, pauseSession(state, deps, fg.sessionId, 'planned_break', 15)),
        followUp: { kind: 'pause_details', sessionId: fg.sessionId },
      };
    }

    case 'snooze':
      return { result: { ok: true, actions: [record, { type: 'coach/snooze', kind: 'break_suggestion', until: deps.now + 20 * MIN }] }, followUp: null };

    case 'wrap_up':
    case 'start_shutdown':
      return { result: { ok: true, actions: [record] }, followUp: { kind: 'shutdown' } };
  }
}
