import { TASK_TYPES } from './taskTypes';
import type { AppState, Millis, Task, Tone } from './types';
import { dayKey } from '../lib/time';

/**
 * Energy (1–10) shapes the whole day. ToDoMe meets you where you are:
 * low energy → gentle mode with micro steps, high energy → ambitious blocks.
 */

export type EnergyMode = 'low' | 'mid' | 'high';

/** What the companion does while you work. */
export type Activity = 'tea' | 'reading' | 'writing' | 'treadmill' | 'weights' | 'waiting' | 'sleeping';

export interface EnergyProfile {
  mode: EnergyMode;
  label: string;
  headline: string;
  description: string;
  /** Upper bound for suggested timeboxes. */
  timeboxCapMin: number;
  /** Planning buffer as share of the remaining day. */
  bufferRatio: number;
  /** Continuous focus before a break is suggested. */
  focusBudgetMin: number;
  /** Forced tone (gentle when energy is low), null = user's choice. */
  tone: Tone | null;
  /** Suggest micro-steps instead of full tasks. */
  micro: boolean;
  activities: Activity[];
}

export const ENERGY_PROFILES: Record<EnergyMode, EnergyProfile> = {
  low: {
    mode: 'low',
    label: 'Sanft-Modus',
    headline: 'Heute machen wir es dir leicht.',
    description: 'Nur kleine Schritte, viel Puffer. Alles, was du heute schaffst, zählt doppelt.',
    timeboxCapMin: 15,
    bufferRatio: 0.4,
    focusBudgetMin: 45,
    tone: 'gentle',
    micro: true,
    activities: ['tea', 'reading'],
  },
  mid: {
    mode: 'mid',
    label: 'Ausgewogen',
    headline: 'Ein guter, ruhiger Tag.',
    description: 'Fokusblöcke mit bewussten Pausen dazwischen. Kein Rennen, ein Rhythmus.',
    timeboxCapMin: 75,
    bufferRatio: 0.25,
    focusBudgetMin: 75,
    tone: null,
    micro: false,
    activities: ['writing', 'reading'],
  },
  high: {
    mode: 'high',
    label: 'Volle Kraft',
    headline: 'Du hast Energie. Lass sie uns gut einsetzen.',
    description: 'Längere Fokusblöcke für das, was dir wirklich wichtig ist.',
    timeboxCapMin: 120,
    bufferRatio: 0.15,
    focusBudgetMin: 100,
    tone: null,
    micro: false,
    activities: ['treadmill', 'weights', 'writing'],
  },
};

export const ENERGY_WORDS: Record<number, string> = {
  1: 'Völlig leer',
  2: 'Sehr müde',
  3: 'Müde',
  4: 'Etwas schlapp',
  5: 'Okay',
  6: 'Ganz gut',
  7: 'Gut drauf',
  8: 'Frisch',
  9: 'Sehr fit',
  10: 'Topfit',
};

export function energyMode(level: number | null): EnergyMode | null {
  if (level === null || !Number.isFinite(level)) return null;
  if (level <= 3) return 'low';
  if (level <= 7) return 'mid';
  return 'high';
}

export function energyToday(state: Pick<AppState, 'wellbeing'>, now: Millis): number | null {
  return state.wellbeing.energyDay === dayKey(now) ? state.wellbeing.energyLevel : null;
}

export function energyProfile(state: Pick<AppState, 'wellbeing'> & { settings?: Pick<AppState['settings'], 'brain'> }, now: Millis): EnergyProfile | null {
  const mode = energyMode(energyToday(state, now));
  const base = mode ? ENERGY_PROFILES[mode] : null;
  const brain = state.settings?.brain ?? null;
  // Aufschieben: the soft mode is always on, small blocks make starting easy.
  if (brain === 'procrastination') return ENERGY_PROFILES.low;
  // ADHS: short 15-minute blocks, movement breaks after 30 minutes, micro steps.
  if (brain === 'adhd') {
    const b = base ?? ENERGY_PROFILES.mid;
    return { ...b, timeboxCapMin: Math.min(b.timeboxCapMin, 15), focusBudgetMin: Math.min(b.focusBudgetMin, 30), micro: true };
  }
  return base;
}

/** Tone the app actually uses: gentle whenever energy is low. */
export function effectiveTone(state: Pick<AppState, 'wellbeing' | 'settings'>, now: Millis): Tone {
  return energyProfile(state, now)?.tone ?? state.settings.tone;
}

/** Timebox suggestion that respects today's energy. */
export function suggestTimebox(task: Task, estimationFactor: number | null, profile: EnergyProfile | null): number {
  const base = Math.max(5, task.estimateMin * (estimationFactor ?? 1));
  const round5 = (m: number) => Math.max(5, Math.round(m / 5) * 5);
  if (!profile) return round5(base);
  if (profile.mode === 'low') return round5(Math.min(profile.timeboxCapMin, base));
  if (profile.mode === 'high') return round5(Math.min(profile.timeboxCapMin, Math.max(base, TASK_TYPES[task.type].defaultTimeboxMin)));
  return round5(Math.min(profile.timeboxCapMin, base));
}

/**
 * Radical micro-commitment: the ONE thing to show on the home screen.
 * Running task first, then important ones, then the next planned start,
 * then the user's order. On low energy, the smallest important step wins.
 */
export function theOneThing(state: AppState, now: Millis): Task | null {
  const today = dayKey(now);
  const order = new Map(state.taskOrder.map((id, i) => [id, i]));
  const open = Object.values(state.tasks).filter((t) => t.plannedDay <= today && (t.status === 'planned' || t.status === 'in_progress'));
  if (open.length === 0) return null;
  const rank = { high: 0, normal: 1, low: 2 } as const;
  const low = energyMode(energyToday(state, now)) === 'low';
  open.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'in_progress' ? -1 : 1;
    if (rank[a.priority] !== rank[b.priority]) return rank[a.priority] - rank[b.priority];
    if (low && a.estimateMin !== b.estimateMin) return a.estimateMin - b.estimateMin;
    const sa = a.plannedStart ?? Number.POSITIVE_INFINITY;
    const sb = b.plannedStart ?? Number.POSITIVE_INFINITY;
    if (sa !== sb) return sa - sb;
    return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
  });
  return open[0] ?? null;
}

/** What the companion is doing right now. */
export function avatarActivity(state: AppState, now: Millis, running: Task | null): Activity {
  if (!running) return 'waiting';
  const profile = energyProfile(state, now) ?? ENERGY_PROFILES.mid;
  if (running.type === 'learning') return 'reading';
  if (running.type === 'communication' || running.type === 'admin') return profile.mode === 'low' ? 'tea' : 'writing';
  // Rotate calmly through the pool, one activity per 20 minutes.
  const slot = Math.floor(now / (20 * 60_000));
  return profile.activities[slot % profile.activities.length] ?? 'writing';
}

export const ACTIVITY_LABELS: Record<Activity, string> = {
  tea: 'trinkt einen Tee mit dir',
  reading: 'liest konzentriert',
  writing: 'schreibt mit',
  treadmill: 'läuft auf dem Laufband',
  weights: 'stemmt Gewichte',
  waiting: 'wartet entspannt',
  sleeping: 'schläft ein bisschen',
};

/** Words and suggestions that follow today's energy, for every dialog. */
export interface EnergyCopy {
  /** Short line at the top of the task dialog. */
  taskHint: string;
  /** Estimate chips in the task dialog. */
  estimatePresets: number[];
  /** Default estimate for a new task. */
  defaultEstimate: number;
  /** Placeholder for "what is done at the end". */
  intentionPlaceholder: string;
  /** Line in the pause dialog. */
  pauseLine: string;
  /** Line in the end check. */
  endLine: string;
}

export function energyCopy(mode: EnergyMode | null): EnergyCopy {
  if (mode === 'low') {
    return {
      taskHint: 'Heute zählt jeder kleine Schritt. Halte es winzig, 80 % reichen völlig.',
      estimatePresets: [5, 10, 15, 25],
      defaultEstimate: 15,
      intentionPlaceholder: 'z. B. nur die Datei öffnen und eine Zeile schreiben',
      pauseLine: 'Pausen sind heute besonders wertvoll. Nimm dir, was du brauchst.',
      endLine: 'Mit wenig Energie angefangen zu haben, ist schon eine echte Leistung.',
    };
  }
  if (mode === 'high') {
    return {
      taskHint: 'Du hast Energie. Gönn dir einen tiefen Fokusblock für etwas, das dir wirklich wichtig ist.',
      estimatePresets: [45, 60, 90, 120],
      defaultEstimate: 90,
      intentionPlaceholder: 'z. B. Konzept steht komplett, bereit für Feedback',
      pauseLine: 'Kurz auftanken, dann geht es mit frischem Kopf weiter.',
      endLine: 'Schön, wie du deine Energie heute eingesetzt hast.',
    };
  }
  return {
    taskHint: 'Plane mit Luft: Kurze Pausen zwischen den Blöcken halten dich frisch.',
    estimatePresets: [25, 45, 60, 90],
    defaultEstimate: 45,
    intentionPlaceholder: 'z. B. 3 Screens in Figma, bereit für Feedback',
    pauseLine: 'Die Uhr steht. Alles hier ist freiwillig.',
    endLine: 'Egal wie es ausgeht: Du hast angefangen, und das zählt.',
  };
}
