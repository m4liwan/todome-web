import type { PromptVars } from '../domain/copy';
import { overrunRatio, projectSession } from '../domain/session';
import type { AppState, CheckIn, Millis } from '../domain/types';
import { formatHours, MIN } from '../lib/time';

/** Variables for the persona copy of a prompt, computed at render/send time. */
export function promptVarsFor(state: AppState, c: CheckIn, now: Millis): PromptVars {
  const task = c.taskId ? state.tasks[c.taskId] : undefined;
  const client = task?.clientId ? state.clients[task.clientId] : undefined;
  const p = c.sessionId ? projectSession(state, state.events, c.sessionId, now) : null;
  // Use the values as they were when the prompt was sent, so the text doesn't drift.
  const at = p?.status === 'running' ? Math.min(now, c.sentAt) : now;
  const ps = c.sessionId ? projectSession(state, state.events, c.sessionId, at) : null;
  return {
    taskTitle: task?.title ?? '',
    clientName: client?.name ?? null,
    intention: ps?.intention ?? task?.intention ?? '',
    overMin: ps ? Math.max(0, Math.round((ps.netMs - ps.timeboxMin * MIN) / MIN)) : 0,
    overrunRatio: ps ? overrunRatio(ps) : 0,
    remainingMin: ps ? Math.max(0, Math.round((ps.effectiveTimeboxMin * MIN - ps.netMs) / MIN)) : 0,
    streakMin: Number(c.data.streakMin ?? 0),
    idleMin: Number(c.data.idleMin ?? 0),
    pauseMin: Number(c.data.plannedMin ?? 0),
    capHours: formatHours(state.settings.dailyCapMin * MIN, 0),
    userName: state.settings.userName,
    movement: state.settings.brain === 'adhd',
    context: state.settings.userContext,
  };
}
