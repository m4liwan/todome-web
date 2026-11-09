import {
  findExpired,
  gate,
  openCheckIns,
  planSessionCheckIn,
  planStartDelay,
  type PlannedCheckIn,
} from '../domain/checkinEngine';
import { planCoachPrompt } from '../domain/coach';
import { HELD_IN_FOCUS, pomodoroPhase } from '../domain/pomodoro';
import { foregroundSession, projectAll } from '../domain/session';
import type { AppState, CheckIn } from '../domain/types';
import { sendCheckIn, type Deps } from './commands';
import type { Action } from './reducer';

const COACH_KINDS: ReadonlySet<CheckIn['kind']> = new Set(['break_suggestion', 'daily_cap', 'shutdown', 'start_delay']);

export interface TickResult {
  actions: Action[];
  /** Prompts sent in this tick (the caller renders/notifies them). */
  sent: CheckIn[];
}

/**
 * One scheduler tick. Pure: decides which prompts expire and which one is sent.
 * At most ONE new prompt per tick and never more than one open session prompt
 * plus one open coach prompt at a time.
 */
export function tick(state: AppState, deps: Deps, opts: { focusSignalActive?: boolean; focusTimer?: boolean } = {}): TickResult {
  const actions: Action[] = [];
  const sent: CheckIn[] = [];
  const all = Object.values(state.checkIns);

  for (const c of findExpired(all, deps.now, state.settings.promptExpiryMin)) {
    actions.push({ type: 'checkin/expire', id: c.id, at: deps.now });
  }
  const expiredIds = new Set(actions.map((a) => (a.type === 'checkin/expire' ? a.id : '')));
  const current = all.map((c) => (expiredIds.has(c.id) ? { ...c, expiredAt: deps.now } : c));
  const open = openCheckIns(current);

  const projections = projectAll(state, deps.now);
  const fg = foregroundSession(projections);
  const candidates: PlannedCheckIn[] = [];
  // Focus timer round: the timer is the structure, check-ins wait for the break.
  const hold = opts.focusTimer && fg && pomodoroPhase(state, fg, deps.now).kind === 'focus' ? HELD_IN_FOCUS : undefined;

  if (fg) {
    const task = state.tasks[fg.taskId];
    if (task) {
      const plan = planSessionCheckIn({
        projection: fg,
        taskType: task.type,
        checkIns: current,
        now: deps.now,
        focusSignalActive: opts.focusSignalActive ?? false,
        hold,
      });
      if (plan) candidates.push(plan);
    }
  }

  if (!open.some((c) => COACH_KINDS.has(c.kind))) {
    const coach = planCoachPrompt(state, projections, deps.now);
    if (coach && !hold?.has(coach.kind)) candidates.push(coach);
    const delay = planStartDelay(Object.values(state.tasks), projections, current, deps.now);
    if (delay) candidates.push(delay);
  }

  const next = candidates
    .filter((c) => gate(c, deps.now, state.settings, current).allowed)
    .sort((a, b) => a.priority - b.priority || a.dueAt - b.dueAt)[0];

  if (next) {
    const sendActions = sendCheckIn(deps, {
      kind: next.kind,
      sessionId: next.sessionId,
      taskId: next.taskId,
      channel: next.channel,
      data: next.data,
    });
    actions.push(...sendActions);
    for (const a of sendActions) if (a.type === 'checkin/send') sent.push(a.checkIn);
  }
  return { actions, sent };
}
