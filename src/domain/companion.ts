import { quietReason } from './checkinEngine';
import { foregroundSession, type SessionProjection } from './session';
import type { AppState, AvatarId, Id, Millis, SessionFeel, TaskPriority, Tone } from './types';
import { atTimeOfDay, dayKey, MIN } from '../lib/time';

/**
 * The companion: a small avatar that drops by on the desktop edge.
 * - focus visits during a session ("still on it?"), interval scaled by task priority
 * - hydration reminders with a daily water counter
 * - short motivation after real progress
 * Planning is pure; delivery (desktop window or in-app bubble) lives in the app layer.
 */

export type CompanionKind = 'focus_check' | 'hydration' | 'motivation' | 'checkin' | 'hello' | 'soft_check' | 'feel';
export type Mood = 'happy' | 'curious' | 'calm' | 'alert' | 'sleepy';

export interface CompanionOption {
  id: string;
  label: string;
  primary?: boolean;
}

export interface CompanionMessage {
  id: Id;
  kind: CompanionKind;
  title: string;
  text: string;
  mood: Mood;
  options: CompanionOption[];
  /** For kind "checkin": the prompt this message mirrors. */
  checkInId?: Id;
  /** For kind "feel": the block that just ended. */
  sessionId?: Id;
  /** Auto-hide after this many ms. */
  ttlMs: number;
}

/** Character group, only used to order the picker (neutral first). */
export type AvatarVibe = 'neutral' | 'boy' | 'girl';

export interface AvatarProfile {
  id: AvatarId;
  name: string;
  description: string;
  vibe: AvatarVibe;
  /** How the companion introduces itself (onboarding, hello). */
  intro: string;
  /** A short, warm thank-you in its own voice (feedback sent, first tasks). */
  thanks: string;
}

export const DEFAULT_AVATAR: AvatarId = 'spike';

export const AVATARS: AvatarProfile[] = [
  {
    id: 'spike',
    name: 'Spike',
    vibe: 'neutral',
    description: 'Kleiner Kaktus. Außen ein bisschen pieksig, innen ganz weich.',
    intro: 'Ich bin Spike, ein kleiner Kaktus. Ich brauche nicht viel, nur ab und zu einen Schluck Wasser und einen ruhigen Platz an deiner Seite.',
    thanks: 'Danke dir! Das hat mich gerade richtig blühen lassen.',
  },
  {
    id: 'mark',
    name: 'Mark',
    vibe: 'neutral',
    description: 'Kleine Tomate. Rund, rot und immer gut gelaunt.',
    intro: 'Ich bin Mark, eine kleine Tomate. Schon die Pomodoro-Technik wusste: Mit einer Tomate an deiner Seite geht Arbeit leichter von der Hand.',
    thanks: 'Danke dir! Jetzt bin ich noch ein bisschen röter geworden.',
  },
  {
    id: 'bit',
    name: 'Bit',
    vibe: 'boy',
    description: 'Kleiner Roboter, pünktlich wie ein Uhrwerk.',
    intro: 'Ich bin Bit, ein kleiner Roboter. Ich behalte die Zeit im Blick, damit dein Kopf frei bleibt.',
    thanks: 'Danke dir! Nachricht empfangen, Herz-Modul auf warm.',
  },
  {
    id: 'spark',
    name: 'Spark',
    vibe: 'boy',
    description: 'Kleiner Drache. Bringt den Funken für den Anfang.',
    intro: 'Ich bin Spark, ein kleiner Drache. Ich puste dir den ersten Funken zu, den Rest schaffst du ganz entspannt.',
    thanks: 'Danke dir! Mein Schwanz glüht vor Freude.',
  },
  {
    id: 'kiki',
    name: 'Kiki',
    vibe: 'girl',
    description: 'Kleine Katze. Schnurrt, wenn du etwas geschafft hast.',
    intro: 'Ich bin Kiki, eine kleine Katze. Ich weiß genau, wann eine Pause guttut, und ich schnurre, wenn du etwas geschafft hast.',
    thanks: 'Danke dir! Ich schnurre gerade ganz leise.',
  },
  {
    id: 'pixie',
    name: 'Pixie',
    vibe: 'girl',
    description: 'Kleines Einhorn. Glaubt fest an deinen nächsten Schritt.',
    intro: 'Ich bin Pixie, ein kleines Einhorn. Ich glaube fest an deinen nächsten Schritt, auch wenn er ganz klein ist.',
    thanks: 'Danke dir! Ein bisschen Glitzer ist gerade zu dir unterwegs.',
  },
  {
    id: 'keimi',
    name: 'Keimi',
    vibe: 'neutral',
    description: 'Kleiner Spross. Wächst mit jedem Schritt mit dir.',
    intro: 'Ich bin Keimi, ein kleiner Spross. Mit jedem Schritt wachsen wir ein Stück.',
    thanks: 'Danke dir! Gerade ist ein neues Blatt gewachsen.',
  },
  {
    id: 'woody',
    name: 'Woody',
    vibe: 'neutral',
    description: 'Kleiner Baumstamm. Fest verwurzelt, bringt Ruhe in jeden Tag.',
    intro: 'Ich bin Woody, ein kleiner Baumstamm. Ich wachse langsam, aber stetig. Genau so machen wir das mit deinem Tag.',
    thanks: 'Danke dir! Das schreibe ich mir in meine Jahresringe.',
  },
];

/** Companions of earlier versions, mapped to the closest one of today. */
export const LEGACY_AVATARS: Record<string, AvatarId> = { mochi: 'kiki', nova: 'pixie', tropf: 'spike', kumo: 'woody', stubbi: 'woody', pingo: 'spark', mio: 'kiki' };

/** Any stored value to a valid companion (old ids keep their spirit). */
export function normalizeAvatar(value: unknown): AvatarId {
  const v = String(value ?? '');
  if (AVATARS.some((a) => a.id === v)) return v as AvatarId;
  return LEGACY_AVATARS[v] ?? DEFAULT_AVATAR;
}

export const avatarProfile = (id: AvatarId): AvatarProfile => AVATARS.find((a) => a.id === id) ?? AVATARS[0]!;
export const avatarName = (id: AvatarId) => avatarProfile(id).name;

/** Important work gets more frequent visits; low priority fewer. */
export const PRIORITY_FACTOR: Record<TaskPriority, number> = { high: 0.6, normal: 1, low: 1.6 };

export const PRIORITY_LABELS: Record<TaskPriority, string> = { high: 'Wichtig', normal: 'Normal', low: 'Niedrig' };

export function waterToday(state: Pick<AppState, 'wellbeing'>, now: Millis): number {
  return state.wellbeing.waterDay === dayKey(now) ? state.wellbeing.waterCount : 0;
}

export function focusVisitIntervalMs(state: AppState, priority: TaskPriority): number {
  return Math.round(state.settings.companion.visitIntervalMin * PRIORITY_FACTOR[priority] * MIN);
}

export interface PlannedVisit {
  kind: 'focus_check' | 'hydration';
  dueAt: Millis;
  sessionId: Id | null;
}

/** Next companion visit (focus check or hydration), or null. Due may lie in the future. */
export function planCompanionVisit(state: AppState, projections: readonly SessionProjection[], now: Millis): PlannedVisit | null {
  const c = state.settings.companion;
  if (!c.enabled) return null;
  const quiet = quietReason(now, state.settings);
  if (quiet === 'dnd') return null;
  const w = state.wellbeing;
  const plans: PlannedVisit[] = [];

  const fg = foregroundSession(projections);
  if (c.visitIntervalMin > 0 && fg && fg.status === 'running') {
    const task = state.tasks[fg.taskId];
    const own = Object.values(state.checkIns).filter((x) => x.sessionId === fg.sessionId);
    const hasOpenPrompt = own.some((x) => x.answeredAt === null && x.expiredAt === null);
    if (task && !hasOpenPrompt) {
      // Any recent interaction with the session counts as "checked in".
      const lastAnswer = Math.max(0, ...own.map((x) => x.answeredAt ?? 0));
      const base = Math.max(fg.phaseStartedAt, w.lastVisitAt ?? 0, lastAnswer);
      plans.push({ kind: 'focus_check', dueAt: base + focusVisitIntervalMs(state, task.priority), sessionId: fg.sessionId });
    }
  }

  const start = atTimeOfDay(now, state.settings.workdayStart);
  const end = atTimeOfDay(now, state.settings.workdayEnd);
  if (c.hydrationIntervalMin > 0 && now >= start && now < end && waterToday(state, now) < c.waterGoal) {
    const base = Math.max(start, w.lastWaterAt ?? 0, w.lastHydrationPromptAt ?? 0);
    const due = Math.max(base + c.hydrationIntervalMin * MIN, w.hydrationSnoozedUntil ?? 0);
    plans.push({ kind: 'hydration', dueAt: due, sessionId: fg?.sessionId ?? null });
  }

  plans.sort((a, b) => a.dueAt - b.dueAt);
  return plans[0] ?? null;
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

/** Deterministic pick so a message doesn't change on re-render but varies over time. */
function pick<T>(items: readonly T[], seed: number): T {
  return items[Math.abs(Math.floor(seed)) % items.length] as T;
}

const FOCUS_LINES: Record<Tone, string[]> = {
  gentle: ['Ich wollte nur kurz hallo sagen. Bist du noch bei „{task}“? Jeder kleine Schritt zählt.', 'Wie fühlt sich „{task}“ gerade an? Du machst das gut.'],
  direct: ['Noch bei „{task}“? Du bringst dich gerade selbst voran.', 'Kurzer Check: Läuft „{task}“?'],
  sporty: ['Noch voll dabei bei „{task}“? Stark!', 'Zwischenstand! Läuft „{task}“?'],
};

const WATER_LINES = [
  'Ein Glas Wasser für dein zukünftiges Ich. Heute Abend wirst du dich klarer fühlen.',
  'Kleiner Schluck gefällig? Ein hydrierter Kopf denkt leichter.',
  'Wasserpause! Ein Glas jetzt, und die Konzentration hält länger.',
  'Gönn dir ein Glas Wasser. Dein Körper sagt danke, ganz ohne Worte.',
];

const MOTIVATION_DONE = [
  '„{task}“ ist erledigt. Stark gemacht!',
  'Haken dran: „{task}“. Genau so geht ein guter Tag.',
  '„{task}“ fertig. Gönn dir einen Moment, bevor es weitergeht.',
];

export function focusCheckMessage(id: Id, tone: Tone, taskTitle: string, seed: number): CompanionMessage {
  return {
    id,
    kind: 'focus_check',
    title: 'Kurz vorbeigeschaut',
    text: pick(FOCUS_LINES[tone], seed).replace('{task}', taskTitle),
    mood: 'curious',
    options: [
      { id: 'on_it', label: 'Bin dran', primary: true },
      { id: 'drifted', label: 'Kurz abgedriftet' },
      { id: 'pause', label: 'Pause machen' },
    ],
    ttlMs: 45_000,
  };
}

export function hydrationMessage(id: Id, glasses: number, goal: number, seed: number): CompanionMessage {
  return {
    id,
    kind: 'hydration',
    title: `Wasser ${glasses}/${goal}`,
    text: pick(WATER_LINES, seed),
    mood: 'happy',
    options: [
      { id: 'drank', label: 'Getrunken', primary: true },
      { id: 'later', label: 'Gleich' },
    ],
    ttlMs: 40_000,
  };
}

export function motivationMessage(id: Id, taskTitle: string, seed: number): CompanionMessage {
  return {
    id,
    kind: 'motivation',
    title: 'Erledigt',
    text: pick(MOTIVATION_DONE, seed).replace('{task}', taskTitle),
    mood: 'happy',
    options: [{ id: 'thanks', label: 'Danke', primary: true }],
    ttlMs: 12_000,
  };
}

/**
 * Nachmittags-Sanft-Check: once per day, early afternoon, a gentle offer to
 * take the rest of the day softer. Never on low energy (already soft), never
 * in a meeting, never after work.
 */
export function shouldOfferSoftCheck(state: AppState, now: Millis, energyLevel: number | null): boolean {
  const c = state.settings.companion;
  if (!c.enabled || !c.softCheck) return false;
  if (state.wellbeing.softCheckDay === dayKey(now)) return false;
  if (energyLevel !== null && energyLevel <= 3) return false;
  if (quietReason(now, state.settings) !== null) return false;
  const minutes = new Date(now).getHours() * 60 + new Date(now).getMinutes();
  const end = atTimeOfDay(now, state.settings.workdayEnd);
  return minutes >= 14 * 60 + 30 && minutes <= 16 * 60 + 30 && now < end - 45 * MIN;
}

export function softCheckMessage(id: Id, name: string): CompanionMessage {
  return {
    id,
    kind: 'soft_check',
    title: 'Kurzer Nachmittags-Check',
    text: `${name ? `${name}, d` : 'D'}er Nachmittag darf leichter werden. Magst du den Rest des Tages im Sanft-Modus verbringen? Kürzere Blöcke, mehr Luft, ganz ohne schlechtes Gewissen.`,
    mood: 'calm',
    options: [
      { id: 'soft', label: 'Ja, sanfter weiter', primary: true },
      { id: 'keep', label: 'Passt gerade gut' },
    ],
    ttlMs: 90_000,
  };
}

/** After a block: "Wie hat sich das angefühlt?" No right or wrong answer. */
export function feelMessage(id: Id, sessionId: Id, taskTitle: string, achieved: boolean): CompanionMessage {
  return {
    id,
    kind: 'feel',
    sessionId,
    title: 'Wie hat sich das angefühlt?',
    text: `${achieved ? `„${taskTitle}“ ist geschafft. ` : ''}Kein Richtig, kein Falsch. Nur ein kurzes Gefühl.`,
    mood: 'curious',
    options: [
      { id: 'smooth', label: 'Flüssig', primary: true },
      { id: 'tough', label: 'Zäh' },
      { id: 'neutral', label: 'Egal' },
    ],
    ttlMs: 60_000,
  };
}

/** The companion's answer to the feeling: warm, never judging. */
export const FEEL_REPLIES: Record<SessionFeel, string> = {
  smooth: 'Schön! Merk dir, was heute geholfen hat. Das darfst du wiederholen.',
  tough: 'Danke, dass du drangeblieben bist. Zäh ist auch Arbeit. Gönn dir kurz Luft.',
  neutral: 'Auch völlig okay. Weiter geht es in deinem Tempo.',
};

export function helloMessage(id: Id, name: string, avatar: AvatarId): CompanionMessage {
  return {
    id,
    kind: 'hello',
    title: avatarName(avatar),
    text: `Hi${name ? ` ${name}` : ''}! ${avatarProfile(avatar).intro} Ich schaue ab und zu vorbei. Versprochen: nie, wenn du im Termin bist.`,
    mood: 'happy',
    options: [{ id: 'thanks', label: 'Hallo!', primary: true }],
    ttlMs: 15_000,
  };
}

/** Motivation only after real progress, at most every 30 minutes. */
export function canMotivate(state: AppState, now: Millis): boolean {
  const c = state.settings.companion;
  return c.enabled && c.motivation && now - (state.wellbeing.lastMotivationAt ?? 0) >= 30 * MIN && quietReason(now, state.settings) !== 'dnd';
}
