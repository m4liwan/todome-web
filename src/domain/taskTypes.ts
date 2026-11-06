import type { Channel, TaskType } from './types';

/**
 * Check-in rhythm per task type (concept §3.1, "Adaptive Nachfass-Intervalle").
 * All values in minutes of *net* working time unless stated otherwise.
 */
export interface TaskTypeProfile {
  label: string;
  short: string;
  defaultTimeboxMin: number;
  /** No pulses/milestones before this much net time. */
  quietMin: number;
  /** One-off nudge to break start inertia (acquisition: "first sentence written?"). */
  firstStepMin: number | null;
  /** Pulse interval after the quiet phase; null = no pulses. */
  pulseEveryMin: number | null;
  /** Milestone as share of the original timebox; null = none. */
  milestoneAt: number | null;
  /** Overrun tolerance: max(ratio × timebox, minMin). `null` = never prompt (exploration). */
  overrunTolerance: { ratio: number; minMin: number } | null;
  channel: Channel;
}

export const TASK_TYPES: Record<TaskType, TaskTypeProfile> = {
  deep_work: {
    label: 'Deep Work',
    short: 'Deep',
    defaultTimeboxMin: 90,
    quietMin: 45,
    firstStepMin: null,
    pulseEveryMin: 40,
    milestoneAt: 0.8,
    overrunTolerance: { ratio: 0.2, minMin: 5 },
    channel: 'haptic',
  },
  communication: {
    label: 'Kommunikation',
    short: 'Komm.',
    defaultTimeboxMin: 25,
    quietMin: 0,
    firstStepMin: null,
    pulseEveryMin: null,
    milestoneAt: 0.8,
    overrunTolerance: { ratio: 0.1, minMin: 3 },
    channel: 'push',
  },
  admin: {
    label: 'Admin & Buchhaltung',
    short: 'Admin',
    defaultTimeboxMin: 30,
    quietMin: 0,
    firstStepMin: null,
    pulseEveryMin: null,
    milestoneAt: null,
    overrunTolerance: { ratio: 0, minMin: 5 },
    channel: 'push',
  },
  acquisition: {
    label: 'Akquise',
    short: 'Akquise',
    defaultTimeboxMin: 30,
    quietMin: 0,
    firstStepMin: 3,
    pulseEveryMin: null,
    milestoneAt: 0.5,
    overrunTolerance: { ratio: 0.15, minMin: 3 },
    channel: 'push',
  },
  learning: {
    label: 'Lernen',
    short: 'Lernen',
    defaultTimeboxMin: 45,
    quietMin: 25,
    firstStepMin: null,
    pulseEveryMin: 25,
    milestoneAt: null,
    overrunTolerance: { ratio: 0.25, minMin: 5 },
    channel: 'ambient',
  },
  exploration: {
    label: 'Kreative Exploration',
    short: 'Explore',
    defaultTimeboxMin: 60,
    quietMin: Number.POSITIVE_INFINITY,
    firstStepMin: null,
    pulseEveryMin: null,
    milestoneAt: null,
    overrunTolerance: null,
    channel: 'ambient',
  },
  other: {
    label: 'Sonstiges',
    short: 'Sonst.',
    defaultTimeboxMin: 45,
    quietMin: 20,
    firstStepMin: null,
    pulseEveryMin: null,
    milestoneAt: 0.8,
    overrunTolerance: { ratio: 0.2, minMin: 5 },
    channel: 'push',
  },
};

/** The name to show for a task's kind of work (own name for "Sonstiges…"). */
export function typeLabel(task: { type: TaskType; typeLabel?: string }): string {
  return task.type === 'other' && task.typeLabel?.trim() ? task.typeLabel.trim() : TASK_TYPES[task.type].label;
}

export const TASK_TYPE_ORDER: TaskType[] = [
  'deep_work',
  'communication',
  'admin',
  'acquisition',
  'learning',
  'exploration',
  'other',
];

const CHANNEL_ORDER: Channel[] = ['ambient', 'haptic', 'push'];

/** One step quieter (used after repeatedly ignored prompts). */
export function quieterChannel(channel: Channel, steps = 1): Channel {
  const idx = Math.max(0, CHANNEL_ORDER.indexOf(channel) - steps);
  return CHANNEL_ORDER[idx] ?? 'ambient';
}

export function overrunToleranceMs(type: TaskType, timeboxMin: number): number | null {
  const tol = TASK_TYPES[type].overrunTolerance;
  if (!tol) return null;
  return Math.max(tol.ratio * timeboxMin, tol.minMin) * 60_000;
}
