import type { Millis, Task } from './types';
import { addDays, dayKey } from '../lib/time';

/**
 * Companion progression: XP, levels, a gentle streak and level unlocks.
 *
 * Principles (ToDoMe is a calm coach, not a slot machine):
 * - Every completion is counted, but XP has a daily cap. Working more than a
 *   healthy day never pays more.
 * - Every completion pays exactly once (the ledger), so ticking a task off
 *   and on again earns nothing.
 * - Weekends never break a streak. A missed workday can be bridged by a
 *   streak freeze. Coming back after a break is welcomed with a small bonus,
 *   never with a lost-streak message.
 * - XP is the source of truth: the level is always recomputed from XP, and
 *   unlocks are never taken away again.
 *
 * Everything here is pure. Time comes in as epoch ms, days as local
 * YYYY-MM-DD keys (see lib/time).
 */

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------

export type FeatureId = 'advanced_stats' | 'focus_timer' | 'exclusive_themes';

export interface CompanionStats {
  /** Total XP ever earned (source of truth for the level). */
  xp: number;
  /** Derived from xp; stored for convenience and always recomputed on load. */
  level: number;
  /** Consecutive active days (weekends do not count as gaps). */
  streak: number;
  maxStreak: number;
  /** Last local day (YYYY-MM-DD) with a completion, null before the first one. */
  lastActiveDate: string | null;
  streakFreezes: number;
  /** Unlocked by level; monotonic (never revoked). Canonical order of FEATURE_UNLOCKS. */
  unlockedFeatures: FeatureId[];
  /** Every completed task, also those beyond the daily cap. */
  tasksCompleted: number;
  subtasksCompleted: number;
}

/** XP earned on one local day, for the daily caps. */
export interface DailyXp {
  day: string | null;
  taskXp: number;
  subtaskXp: number;
}

export interface CompanionProgression {
  stats: CompanionStats;
  daily: DailyXp;
  /** Award key ("t:<taskId>", "s:<taskId>:<itemId>") → day it was paid. */
  ledger: Record<string, string>;
}

export type CompletionKind = 'task' | 'subtask';

export interface Completion {
  kind: CompletionKind;
  /** Stable, unique key of what was completed (see `taskKey`, `subtaskKey`). */
  key: string;
  at: Millis;
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export const XP_RULES = {
  taskXp: 15,
  subtaskXp: 5,
  /** Task XP per day, after the streak multiplier. */
  dailyTaskCap: 150,
  /** Sub-task XP per day (ten small steps), so long checklists can't be farmed. */
  dailySubtaskCap: 50,
  /** Once, on the first completion after a break that ended a streak. */
  comebackBonus: 10,
  /** A streak freeze is earned every this many streak days … */
  freezeEvery: 7,
  /** … and at most this many are kept. */
  maxFreezes: 3,
  /** Ledger entries older than this are forgotten. */
  ledgerDays: 120,
  /** Hard ceiling for the ledger (newest entries win). */
  ledgerMax: 4000,
} as const;

/** Highest multiplier first. */
export const STREAK_MULTIPLIERS: ReadonlyArray<{ fromDay: number; factor: number }> = [
  { fromDay: 7, factor: 1.5 },
  { fromDay: 3, factor: 1.2 },
];

/** Days of the week that never count as missed (0 = Sunday, 6 = Saturday). */
export const REST_DAYS: ReadonlySet<number> = new Set([0, 6]);

export const MAX_LEVEL = 999;
/**
 * Level curve: each level needs LEVEL_BASE + LEVEL_STEP × level XP. Tuned for
 * a typical day (~100 XP: four tasks plus a few steps) and ~21 active days a
 * month: level 5 after ~2 weeks, 10 after ~1 month, 25 after ~4 months and
 * 50 after ~1 year. The daily caps keep heavy days from racing ahead.
 */
const LEVEL_BASE = 180;
const LEVEL_STEP = 13;
/** XP of a typical active day, used to explain and test the pacing. */
export const TYPICAL_DAILY_XP = 100;
/** Gaps longer than this are a fresh start without counting each day. */
const MAX_GAP_DAYS = 400;

export interface FeatureUnlock {
  feature: FeatureId;
  level: number;
  title: string;
  text: string;
}

export const FEATURE_UNLOCKS: readonly FeatureUnlock[] = [
  {
    feature: 'advanced_stats',
    level: 5,
    title: 'Erweiterte Statistiken',
    text: 'Deine geschützte Fokuszeit, ruhige Blöcke und kleine Siege im Rückblick.',
  },
  {
    feature: 'focus_timer',
    level: 10,
    title: 'Fokus-Timer',
    text: 'Der Pomodoro-Modus: kurze Blöcke, bewusste Pausen, ganz in deinem Tempo.',
  },
  {
    feature: 'exclusive_themes',
    level: 15,
    title: 'Exklusive Themes',
    text: 'Farbwelten, die man sich verdient: ruhig, tief und nur für dich.',
  },
];

export const taskKey = (taskId: string) => `t:${taskId}`;
export const subtaskKey = (taskId: string, itemId: string) => `s:${taskId}:${itemId}`;

export function emptyStats(): CompanionStats {
  return {
    xp: 0,
    level: 1,
    streak: 0,
    maxStreak: 0,
    lastActiveDate: null,
    streakFreezes: 0,
    unlockedFeatures: [],
    tasksCompleted: 0,
    subtasksCompleted: 0,
  };
}

export function emptyProgression(): CompanionProgression {
  return { stats: emptyStats(), daily: { day: null, taskXp: 0, subtaskXp: 0 }, ledger: {} };
}

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

/** XP needed to go from `level` to `level + 1`. */
export function xpForLevelUp(level: number): number {
  return LEVEL_BASE + LEVEL_STEP * Math.max(1, Math.floor(level));
}

/** Total XP at which `level` begins (level 1 begins at 0). */
export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < Math.min(level, MAX_LEVEL); l++) total += xpForLevelUp(l);
  return total;
}

export function levelForXp(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 1;
  let level = 1;
  let next = xpForLevelUp(1);
  while (level < MAX_LEVEL && xp >= next) {
    level += 1;
    next += xpForLevelUp(level);
  }
  return level;
}

export interface LevelProgress {
  level: number;
  /** XP earned inside the current level. */
  xpIntoLevel: number;
  /** XP the current level spans. */
  xpForNext: number;
  /** 0 … 1, for the XP bar. */
  ratio: number;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelForXp(xp);
  const xpIntoLevel = Math.max(0, Math.floor(xp) - totalXpForLevel(level));
  const xpForNext = xpForLevelUp(level);
  return { level, xpIntoLevel, xpForNext, ratio: Math.min(1, xpIntoLevel / xpForNext) };
}

export function streakMultiplier(streak: number): number {
  return STREAK_MULTIPLIERS.find((m) => streak >= m.fromDay)?.factor ?? 1;
}

// ---------------------------------------------------------------------------
// Feature gates & effect tiers
// ---------------------------------------------------------------------------

export function unlocksForLevel(level: number): FeatureId[] {
  return FEATURE_UNLOCKS.filter((u) => level >= u.level).map((u) => u.feature);
}

/** Canonical, de-duplicated union of stored and level-based unlocks. */
function mergeUnlocks(stored: readonly FeatureId[], level: number): FeatureId[] {
  const have = new Set<FeatureId>([...stored, ...unlocksForLevel(level)]);
  return FEATURE_UNLOCKS.map((u) => u.feature).filter((f) => have.has(f));
}

export function isFeatureUnlocked(stats: Pick<CompanionStats, 'xp' | 'unlockedFeatures'>, feature: FeatureId): boolean {
  return stats.unlockedFeatures.includes(feature) || unlocksForLevel(levelForXp(stats.xp)).includes(feature);
}

export function nextUnlock(level: number): FeatureUnlock | null {
  return FEATURE_UNLOCKS.find((u) => u.level > level) ?? null;
}

export type EffectTier = 'standard' | 'sparkle' | 'aura' | 'shiny';

export interface EffectMilestone {
  tier: Exclude<EffectTier, 'standard'>;
  level: number;
  title: string;
  text: string;
}

/** Looks of the companion, earned along the way (rendered in the companion hub). */
export const EFFECT_TIERS: readonly EffectMilestone[] = [
  { tier: 'sparkle', level: 10, title: 'Glitzern', text: 'Kleine Funken, wenn ihr zusammen etwas schafft.' },
  { tier: 'aura', level: 25, title: 'Aura', text: 'Ein ruhiges Leuchten um deinen Begleiter.' },
  { tier: 'shiny', level: 50, title: 'Holofoil', text: 'Der legendäre Schimmer nach einem Jahr gemeinsamer Wege, mit Sternenstaub bei jeder Berührung.' },
];

/** Visual tier of the companion avatar: sparkle, aura, holofoil. */
export function effectTier(level: number): EffectTier {
  let tier: EffectTier = 'standard';
  for (const m of EFFECT_TIERS) if (level >= m.level) tier = m.tier;
  return tier;
}

export type Reward = ({ kind: 'feature' } & FeatureUnlock) | ({ kind: 'effect' } & EffectMilestone);

export interface PathStep {
  level: number;
  rewards: Reward[];
  status: 'reached' | 'next' | 'later';
  /** XP still needed (0 when reached). */
  xpToGo: number;
}

/** The reward path: every milestone level with what it brings, in order. */
export function rewardPath(stats: Pick<CompanionStats, 'xp' | 'unlockedFeatures'>): PathStep[] {
  const level = levelForXp(stats.xp);
  const byLevel = new Map<number, Reward[]>();
  const add = (l: number, r: Reward) => byLevel.set(l, [...(byLevel.get(l) ?? []), r]);
  for (const u of FEATURE_UNLOCKS) add(u.level, { kind: 'feature', ...u });
  for (const e of EFFECT_TIERS) add(e.level, { kind: 'effect', ...e });
  let nextSeen = false;
  return [...byLevel.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([l, rewards]) => {
      const reached = level >= l || rewards.every((r) => r.kind === 'feature' && stats.unlockedFeatures.includes(r.feature));
      const status: PathStep['status'] = reached ? 'reached' : nextSeen ? 'later' : 'next';
      if (status === 'next') nextSeen = true;
      return { level: l, rewards, status, xpToGo: reached ? 0 : Math.max(0, totalXpForLevel(l) - Math.floor(stats.xp)) };
    });
}

// ---------------------------------------------------------------------------
// Days & streak
// ---------------------------------------------------------------------------

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (v: unknown): v is string => typeof v === 'string' && DAY_RE.test(v) && !Number.isNaN(new Date(`${v}T12:00:00`).getTime());

function weekday(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).getDay();
}

/** Calendar days from `from` to `to` (local, DST-safe). Negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const toUtc = (day: string) => {
    const [y, m, d] = day.split('-').map(Number);
    return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  };
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}

/** Workdays strictly between two days; Infinity for very long gaps. */
export function missedWorkdays(from: string, to: string, restDays: ReadonlySet<number> = REST_DAYS): number {
  const gap = daysBetween(from, to);
  if (gap <= 1) return 0;
  if (gap > MAX_GAP_DAYS) return Number.POSITIVE_INFINITY;
  let missed = 0;
  for (let day = addDays(from, 1); day < to; day = addDays(day, 1)) if (!restDays.has(weekday(day))) missed += 1;
  return missed;
}

export type DayOutcome =
  /** Very first completion ever. */
  | 'first_day'
  /** Already active today. */
  | 'same_day'
  /** Yesterday (or before the weekend) was active. */
  | 'continued'
  /** Missed workdays were covered by streak freezes. */
  | 'bridged'
  /** The streak starts over: welcome back. */
  | 'fresh_start'
  /** The clock is earlier than the last active day: change nothing. */
  | 'clock_skew';

export interface DayResult {
  stats: CompanionStats;
  outcome: DayOutcome;
  freezesUsed: number;
}

/** Marks `day` as active and moves the streak along. */
export function registerActiveDay(stats: CompanionStats, day: string): DayResult {
  const last = stats.lastActiveDate;
  if (last === day) return { stats, outcome: 'same_day', freezesUsed: 0 };
  if (last !== null && day < last) return { stats, outcome: 'clock_skew', freezesUsed: 0 };

  let outcome: DayOutcome;
  let streak: number;
  let freezes = stats.streakFreezes;
  let freezesUsed = 0;
  if (last === null) {
    outcome = 'first_day';
    streak = 1;
  } else {
    const missed = missedWorkdays(last, day);
    if (missed === 0) {
      outcome = 'continued';
      streak = stats.streak + 1;
    } else if (missed <= freezes) {
      // All or nothing: freezes are only spent when they really keep the streak.
      outcome = 'bridged';
      freezesUsed = missed;
      freezes -= missed;
      streak = stats.streak + 1;
    } else {
      outcome = 'fresh_start';
      streak = 1;
    }
  }
  if (streak > 1 && streak % XP_RULES.freezeEvery === 0) freezes = Math.min(XP_RULES.maxFreezes, freezes + 1);

  return {
    stats: { ...stats, streak, maxStreak: Math.max(stats.maxStreak, streak), lastActiveDate: day, streakFreezes: freezes },
    outcome,
    freezesUsed,
  };
}

// ---------------------------------------------------------------------------
// Awarding XP
// ---------------------------------------------------------------------------

function pruneLedger(ledger: Record<string, string>, today: string): Record<string, string> {
  const cutoff = addDays(today, -XP_RULES.ledgerDays);
  const entries = Object.entries(ledger).filter(([, day]) => day >= cutoff);
  if (entries.length > XP_RULES.ledgerMax) entries.sort((a, b) => (a[1] < b[1] ? 1 : -1)).splice(XP_RULES.ledgerMax);
  return Object.fromEntries(entries);
}

/**
 * Pays one completion. Returns the same object when it was paid before
 * (no XP twice for the same task or sub-task).
 */
export function awardCompletion(p: CompanionProgression, completion: Completion): CompanionProgression {
  if (completion.key in p.ledger) return p;
  const today = dayKey(completion.at);

  const day = registerActiveDay(p.stats, today);
  const comeback = day.outcome === 'fresh_start' ? XP_RULES.comebackBonus : 0;

  // A clock turned back keeps today's bucket: the cap can't be reset that way.
  const bucketDay = p.daily.day !== null && today < p.daily.day ? p.daily.day : today;
  const daily: DailyXp = p.daily.day === bucketDay ? { ...p.daily } : { day: bucketDay, taskXp: 0, subtaskXp: 0 };

  let earned: number;
  if (completion.kind === 'task') {
    const raw = Math.round(XP_RULES.taskXp * streakMultiplier(day.stats.streak));
    earned = Math.max(0, Math.min(raw, XP_RULES.dailyTaskCap - daily.taskXp));
    daily.taskXp += earned;
  } else {
    earned = Math.max(0, Math.min(XP_RULES.subtaskXp, XP_RULES.dailySubtaskCap - daily.subtaskXp));
    daily.subtaskXp += earned;
  }

  const xp = day.stats.xp + earned + comeback;
  const level = levelForXp(xp);
  const stats: CompanionStats = {
    ...day.stats,
    xp,
    level,
    unlockedFeatures: mergeUnlocks(day.stats.unlockedFeatures, level),
    tasksCompleted: day.stats.tasksCompleted + (completion.kind === 'task' ? 1 : 0),
    subtasksCompleted: day.stats.subtasksCompleted + (completion.kind === 'subtask' ? 1 : 0),
  };
  const ledger = pruneLedger({ ...p.ledger, [completion.key]: today }, today);
  return { stats, daily, ledger };
}

/**
 * The completion hook: compares a task before and after an update and pays
 * what was newly completed (the task turning done, newly ticked sub-tasks).
 * Returns the same object when nothing was completed.
 */
export function applyTaskTransition(p: CompanionProgression, before: Task, after: Task, at: Millis): CompanionProgression {
  let next = p;
  const wasDone = new Set(before.checklist.filter((i) => i.doneAt !== null).map((i) => i.id));
  for (const item of after.checklist) {
    if (item.doneAt !== null && !wasDone.has(item.id)) next = awardCompletion(next, { kind: 'subtask', key: subtaskKey(after.id, item.id), at });
  }
  if (after.status === 'done' && before.status !== 'done') next = awardCompletion(next, { kind: 'task', key: taskKey(after.id), at });
  return next;
}

// ---------------------------------------------------------------------------
// Persistence (corruption-safe)
// ---------------------------------------------------------------------------

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function int(v: unknown, max: number, fallback = 0): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(0, Math.floor(v)));
}

const FEATURES = new Set<string>(FEATURE_UNLOCKS.map((u) => u.feature));

/**
 * Turns anything stored into a valid progression. Each field is checked on
 * its own: one broken value resets that value, never the whole progress.
 */
export function sanitizeProgression(raw: unknown): CompanionProgression {
  const empty = emptyProgression();
  if (!isRecord(raw)) return empty;
  const s = isRecord(raw.stats) ? raw.stats : {};

  const xp = int(s.xp, 1e9);
  const level = levelForXp(xp);
  const lastActiveDate = isDay(s.lastActiveDate) ? s.lastActiveDate : null;
  const streak = lastActiveDate ? int(s.streak, 100_000) : 0;
  const stored = Array.isArray(s.unlockedFeatures) ? s.unlockedFeatures.filter((f): f is FeatureId => typeof f === 'string' && FEATURES.has(f)) : [];
  const stats: CompanionStats = {
    xp,
    level,
    streak,
    maxStreak: Math.max(streak, int(s.maxStreak, 100_000)),
    lastActiveDate,
    streakFreezes: int(s.streakFreezes, XP_RULES.maxFreezes),
    unlockedFeatures: mergeUnlocks(stored, level),
    tasksCompleted: int(s.tasksCompleted, 1e9),
    subtasksCompleted: int(s.subtasksCompleted, 1e9),
  };

  const d = isRecord(raw.daily) ? raw.daily : {};
  const daily: DailyXp = isDay(d.day)
    ? { day: d.day, taskXp: int(d.taskXp, XP_RULES.dailyTaskCap), subtaskXp: int(d.subtaskXp, XP_RULES.dailySubtaskCap) }
    : empty.daily;

  const ledger: Record<string, string> = {};
  if (isRecord(raw.ledger)) {
    for (const [key, day] of Object.entries(raw.ledger)) if (isDay(day)) ledger[key] = day;
  }

  return { stats, daily, ledger };
}

// ---------------------------------------------------------------------------
// Events for the UI (derived, never stored)
// ---------------------------------------------------------------------------

export type ProgressionEvent =
  | { type: 'xp_gained'; amount: number }
  | { type: 'level_up'; from: number; to: number }
  | { type: 'feature_unlocked'; feature: FeatureId }
  | { type: 'streak_extended'; streak: number }
  | { type: 'freeze_used'; count: number }
  | { type: 'freeze_earned'; total: number }
  | { type: 'welcome_back'; daysAway: number; bonusXp: number }
  /** Today's task XP just hit the cap: a full tank, celebrated once. */
  | { type: 'daily_cap_reached' }
  /** A completion was counted but earned no XP (cap reached). */
  | { type: 'task_counted' };

/**
 * True when `next` grew out of `prev` by awards only: each award adds exactly
 * one ledger key and one completion. A replaced state (backup import) breaks
 * that accounting and must not be celebrated as progress.
 */
export function isAwardStep(prev: CompanionProgression, next: CompanionProgression): boolean {
  if (next.stats.xp < prev.stats.xp) return false;
  const added = Object.keys(next.ledger).filter((k) => !(k in prev.ledger)).length;
  const counted = next.stats.tasksCompleted + next.stats.subtasksCompleted - (prev.stats.tasksCompleted + prev.stats.subtasksCompleted);
  return added > 0 && added === counted;
}

/** What happened between two progression states, in display order. */
export function progressionEvents(prev: CompanionProgression, next: CompanionProgression): ProgressionEvent[] {
  if (prev === next) return [];
  const a = prev.stats;
  const b = next.stats;
  const events: ProgressionEvent[] = [];

  const dayChanged = b.lastActiveDate !== a.lastActiveDate && b.lastActiveDate !== null;
  if (dayChanged && a.lastActiveDate !== null && b.streak <= a.streak) {
    events.push({ type: 'welcome_back', daysAway: daysBetween(a.lastActiveDate, b.lastActiveDate as string), bonusXp: XP_RULES.comebackBonus });
  } else if (dayChanged && b.streak > a.streak) {
    if (b.streakFreezes < a.streakFreezes) events.push({ type: 'freeze_used', count: a.streakFreezes - b.streakFreezes });
    events.push({ type: 'streak_extended', streak: b.streak });
  }
  if (b.streakFreezes > a.streakFreezes) events.push({ type: 'freeze_earned', total: b.streakFreezes });

  const gained = b.xp - a.xp;
  if (gained > 0) events.push({ type: 'xp_gained', amount: gained });
  else if (b.tasksCompleted + b.subtasksCompleted > a.tasksCompleted + a.subtasksCompleted) events.push({ type: 'task_counted' });

  const sameBucket = prev.daily.day === next.daily.day;
  if (next.daily.taskXp >= XP_RULES.dailyTaskCap && (!sameBucket || prev.daily.taskXp < XP_RULES.dailyTaskCap)) events.push({ type: 'daily_cap_reached' });

  if (b.level > a.level) events.push({ type: 'level_up', from: a.level, to: b.level });
  for (const f of b.unlockedFeatures) if (!a.unlockedFeatures.includes(f)) events.push({ type: 'feature_unlocked', feature: f });
  return events;
}

// ---------------------------------------------------------------------------
// Copy (warm, never guilt)
// ---------------------------------------------------------------------------

const WELCOME_BACK = [
  'Schön, dass du wieder da bist! Wir starten ganz entspannt mit einem kleinen Schritt.',
  'Da bist du ja! Pausen gehören dazu. Lass uns gemeinsam wieder reinfinden.',
  'Willkommen zurück! Ich habe mich auf dich gefreut. Heute zählt jeder kleine Schritt.',
  'Hallo again! Ausgeruht geht vieles leichter. Such dir einfach die nächste kleine Sache aus.',
];

/** Deterministic pick so the line stays the same on re-render. Mentions the comeback bonus. */
export function welcomeBackLine(seed: number): string {
  const line = WELCOME_BACK[Math.abs(Math.floor(seed)) % WELCOME_BACK.length] as string;
  return `${line} Als kleines Hallo gibt es ${XP_RULES.comebackBonus} XP obendrauf.`;
}

export const FREEZE_USED_LINE = 'Dein Streak-Freeze hat deine Serie gehalten. Freie Tage sind erlaubt.';
export const DAILY_CAP_LINE = 'Dein XP-Tank für heute ist voll. Alles Weitere zählt trotzdem für deine Statistik, und Pausen sowieso.';

/**
 * The streak as it stands today: still alive while the gap since the last
 * active day can be bridged by freezes, otherwise 0 (it starts again with the
 * next small step; nothing is shown as lost).
 */
export function visibleStreak(stats: Pick<CompanionStats, 'streak' | 'lastActiveDate' | 'streakFreezes'>, today: string): number {
  const last = stats.lastActiveDate;
  if (last === null) return 0;
  if (today <= last) return stats.streak;
  return missedWorkdays(last, today) <= stats.streakFreezes ? stats.streak : 0;
}

export const featureTitle = (feature: FeatureId): string => FEATURE_UNLOCKS.find((u) => u.feature === feature)?.title ?? feature;

/**
 * Short messages for the toast and the screen reader. The XP number itself is
 * shown by the floating badge, so only the moments worth a sentence get one,
 * most important first, at most two per change (no toast storm).
 */
export function progressionAnnouncements(events: readonly ProgressionEvent[], companionName: string, seed = 0): string[] {
  const ranked: Array<{ rank: number; text: string }> = [];
  for (const e of events) {
    if (e.type === 'level_up') ranked.push({ rank: 0, text: `Level ${e.to}! ${companionName} wächst mit dir.` });
    else if (e.type === 'feature_unlocked') ranked.push({ rank: 1, text: `Freigeschaltet: ${featureTitle(e.feature)}.` });
    else if (e.type === 'welcome_back') ranked.push({ rank: 2, text: welcomeBackLine(seed) });
    else if (e.type === 'freeze_used') ranked.push({ rank: 3, text: FREEZE_USED_LINE });
    else if (e.type === 'freeze_earned') ranked.push({ rank: 4, text: `Ein Streak-Freeze mehr im Vorrat (${e.total} von ${XP_RULES.maxFreezes}). Für Tage, an denen das Leben vorgeht.` });
    else if (e.type === 'streak_extended') {
      const boost = STREAK_MULTIPLIERS.find((m) => m.fromDay === e.streak);
      if (boost) ranked.push({ rank: 5, text: `${e.streak} aktive Tage in Folge. Ab jetzt gibt es ${String(boost.factor).replace('.', ',')}× XP.` });
    } else if (e.type === 'daily_cap_reached') ranked.push({ rank: 6, text: DAILY_CAP_LINE });
  }
  return ranked
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 2)
    .map((r) => r.text);
}
