import { overrunToleranceMs, quieterChannel, TASK_TYPES } from './taskTypes';
import type { SessionProjection } from './session';
import type { Channel, CheckIn, CheckInKind, Id, Millis, Settings, Task, TaskType } from './types';
import { atTimeOfDay, dayKey, isWithin, MIN, HOUR } from '../lib/time';

/**
 * Check-in engine (concept §3.1 "Taktlogik").
 *
 * Deterministic and side-effect free: given a session projection and the
 * check-in history it answers "what is the next prompt and when is it due?".
 * Timing never depends on an LLM – it must work offline and be testable.
 *
 * Due times are planned in NET working time (pauses don't count) and mapped
 * back to wall-clock time: while running, net time advances 1:1.
 */

export interface PlannedCheckIn {
  kind: CheckInKind;
  sessionId: Id | null;
  taskId: Id | null;
  dueAt: Millis;
  channel: Channel;
  data: Record<string, number | string | null>;
  /** Lower = more important (used for tie-breaks). */
  priority: number;
}

export type QuietReason = 'dnd' | 'lunch' | 'after_hours';

/** Gap below which two working intervals count as one focus streak. */
export const STREAK_GAP_MS = 5 * MIN;
/** Pulses are skipped if they would land this close to a milestone/overrun prompt. */
const PULSE_COLLISION_MS = 10 * MIN;
/** Focus signal (e.g. desktop companion sees the right tool) defers the next pulse. */
const FOCUS_SIGNAL_DEFER_MS = 15 * MIN;
const START_DELAY_MS = 10 * MIN;

const isOpen = (c: CheckIn) => c.answeredAt === null && c.expiredAt === null;

/** Consecutive ignored (expired) prompts at the end of a session's history. */
export function ignoredStreak(sessionCheckIns: readonly CheckIn[]): number {
  const sorted = [...sessionCheckIns].sort((a, b) => a.sentAt - b.sentAt);
  let streak = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const c = sorted[i];
    if (!c || c.expiredAt === null) break;
    streak++;
  }
  return streak;
}

export interface SessionEngineInput {
  projection: SessionProjection;
  taskType: TaskType;
  checkIns: readonly CheckIn[];
  now: Millis;
  /** External "user is active in the right tool" signal (desktop companion). */
  focusSignalActive?: boolean;
}

/** Next prompt for one session, or null. Does not apply quiet hours / caps (see `gate`). */
export function planSessionCheckIn(input: SessionEngineInput): PlannedCheckIn | null {
  const { projection: p, taskType, now } = input;
  const profile = TASK_TYPES[taskType];
  const own = input.checkIns.filter((c) => c.sessionId === p.sessionId);

  if (own.some(isOpen)) return null; // one prompt at a time

  const base = { sessionId: p.sessionId, taskId: p.taskId };

  if (p.status === 'paused') {
    const pause = p.currentPause;
    if (!pause || pause.plannedMin === null) return null;
    const already = own.some(
      (c) => c.kind === 'pause_over' && c.data.pauseSince === pause.since && c.data.plannedMin === pause.plannedMin,
    );
    if (already) return null;
    return {
      ...base,
      kind: 'pause_over',
      dueAt: pause.since + pause.plannedMin * MIN,
      channel: 'push',
      data: { pauseSince: pause.since, plannedMin: pause.plannedMin },
      priority: 0,
    };
  }
  if (p.status !== 'running') return null;

  const streak = ignoredStreak(own);
  const adapt = streak >= 2 ? 1.5 : 1;
  const channel: Channel = streak >= 2 ? quieterChannel(profile.channel) : profile.channel;
  const phaseExpired = own.some((c) => c.sentAt >= p.phaseStartedAt && c.expiredAt !== null);
  const toWall = (targetNetMs: Millis) => now + Math.max(0, targetNetMs - p.netMs);
  const sent = (kind: CheckInKind) => own.filter((c) => c.kind === kind);

  const candidates: PlannedCheckIn[] = [];
  const timeboxMs = p.effectiveTimeboxMin * MIN;

  // 1) Overrun – fires once per threshold; extending the timebox moves the threshold.
  const tol = overrunToleranceMs(taskType, p.timeboxMin);
  const overrunAt = tol === null ? null : timeboxMs + tol;
  if (overrunAt !== null && !sent('overrun').some((c) => c.data.threshold === overrunAt)) {
    candidates.push({
      ...base,
      kind: 'overrun',
      dueAt: toWall(overrunAt),
      channel: 'push', // overrun always surfaces: it changes the plan and the time record
      data: { threshold: overrunAt },
      priority: 0,
    });
  }

  // After an ignored prompt in this phase only the overrun may still come (concept: no nagging).
  if (!phaseExpired) {
    const milestoneAt = profile.milestoneAt === null ? null : p.timeboxMin * MIN * profile.milestoneAt;
    if (milestoneAt !== null && sent('milestone').length === 0 && p.netMs < timeboxMs) {
      candidates.push({
        ...base,
        kind: 'milestone',
        dueAt: toWall(milestoneAt),
        channel,
        data: { share: profile.milestoneAt },
        priority: 1,
      });
    }

    if (profile.firstStepMin !== null && sent('first_step').length === 0) {
      candidates.push({
        ...base,
        kind: 'first_step',
        dueAt: toWall(profile.firstStepMin * MIN),
        channel,
        data: {},
        priority: 2,
      });
    }

    if (profile.pulseEveryMin !== null) {
      const last = sent('pulse').sort((a, b) => b.sentAt - a.sentAt)[0];
      const lastNet = typeof last?.data.netMs === 'number' ? last.data.netMs : null;
      let nextNet =
        lastNet === null ? profile.quietMin * MIN : lastNet + profile.pulseEveryMin * adapt * MIN;
      if (input.focusSignalActive) nextNet += FOCUS_SIGNAL_DEFER_MS;
      const collides = [milestoneAt, overrunAt].some(
        (t) => t !== null && Math.abs(t - nextNet) < PULSE_COLLISION_MS,
      );
      if (!collides && nextNet < timeboxMs) {
        candidates.push({
          ...base,
          kind: 'pulse',
          dueAt: toWall(nextNet),
          channel: channel === 'push' ? 'haptic' : channel,
          data: { netMs: nextNet },
          priority: 3,
        });
      }
    }
  }

  candidates.sort((a, b) => a.dueAt - b.dueAt || a.priority - b.priority);
  return candidates[0] ?? null;
}

/** Start-delay nudge: a planned start passed by 10 min and nothing was started. */
export function planStartDelay(
  tasks: readonly Task[],
  projections: readonly SessionProjection[],
  checkIns: readonly CheckIn[],
  now: Millis,
): PlannedCheckIn | null {
  if (projections.some((p) => p.status === 'running' || p.status === 'paused')) return null;
  const today = dayKey(now);
  const due = tasks
    .filter(
      (t) =>
        t.status === 'planned' &&
        t.plannedStart !== null &&
        t.plannedDay === today &&
        now >= t.plannedStart + START_DELAY_MS &&
        !projections.some((p) => p.taskId === t.id && p.startedAt >= (t.plannedStart ?? 0) - HOUR) &&
        !checkIns.some(
          (c) => c.kind === 'start_delay' && c.taskId === t.id && c.data.plannedStart === t.plannedStart,
        ),
    )
    .sort((a, b) => (a.plannedStart ?? 0) - (b.plannedStart ?? 0))[0];
  if (!due || due.plannedStart === null) return null;
  return {
    kind: 'start_delay',
    sessionId: null,
    taskId: due.id,
    dueAt: due.plannedStart + START_DELAY_MS,
    channel: 'push',
    data: { plannedStart: due.plannedStart },
    priority: 1,
  };
}

export function quietReason(now: Millis, settings: Settings): QuietReason | null {
  if (settings.doNotDisturb) return 'dnd';
  if (isWithin(now, atTimeOfDay(now, settings.lunchStart), atTimeOfDay(now, settings.lunchEnd))) {
    return 'lunch';
  }
  const start = atTimeOfDay(now, settings.workdayStart);
  const end = atTimeOfDay(now, settings.workdayEnd);
  if (now < start || now >= end) return 'after_hours';
  return null;
}

/** Kinds that belong to a session the user deliberately runs – they ignore "after hours". */
const SESSION_KINDS: ReadonlySet<CheckInKind> = new Set([
  'first_step',
  'pulse',
  'milestone',
  'overrun',
  'pause_over',
]);
/** Kinds that may exceed the hourly cap (they protect plan, time record or recovery). */
const CAP_EXEMPT: ReadonlySet<CheckInKind> = new Set(['overrun', 'pause_over', 'idle', 'shutdown']);

export type GateResult = { allowed: true } | { allowed: false; reason: QuietReason | 'cap' | 'not_due' };

/** Quiet hours and hourly cap – applied right before a planned prompt is sent. */
export function gate(
  plan: PlannedCheckIn,
  now: Millis,
  settings: Settings,
  checkIns: readonly CheckIn[],
): GateResult {
  if (plan.dueAt > now) return { allowed: false, reason: 'not_due' };
  const quiet = quietReason(now, settings);
  if (quiet === 'dnd' || quiet === 'lunch') return { allowed: false, reason: quiet };
  if (quiet === 'after_hours' && !SESSION_KINDS.has(plan.kind) && plan.kind !== 'shutdown') {
    return { allowed: false, reason: quiet };
  }
  if (!CAP_EXEMPT.has(plan.kind)) {
    const lastHour = checkIns.filter(
      (c) => c.sentAt > now - HOUR && c.channel !== 'ambient' && !CAP_EXEMPT.has(c.kind),
    ).length;
    if (lastHour >= settings.maxPromptsPerHour) return { allowed: false, reason: 'cap' };
  }
  return { allowed: true };
}

/** Open prompts older than the expiry window → counted as ignored. */
export function findExpired(checkIns: readonly CheckIn[], now: Millis, expiryMin: number): CheckIn[] {
  return checkIns.filter((c) => isOpen(c) && now - c.sentAt >= expiryMin * MIN);
}

export function openCheckIns(checkIns: readonly CheckIn[]): CheckIn[] {
  return checkIns.filter(isOpen).sort((a, b) => a.sentAt - b.sentAt);
}
