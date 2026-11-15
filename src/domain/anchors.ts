import type { DailyAnchor, Millis } from './types';

/**
 * Tages-Anker: small things that give the day some hold, each with a gentle
 * rhythm (every day, or chosen weekdays).
 *
 * No pressure by design: a new day starts fresh by itself (done today is
 * derived from the day of the last tick), nothing about earlier days is kept,
 * and a day off in the rhythm is simply free. Nothing can break, nothing is
 * ever overdue, there is nothing to catch up on.
 */

/** Enough room for small routines, not a second to-do list. */
export const MAX_ANCHORS = 10;
/** The top anchors of the day get a little more presence. */
export const CORE_ANCHORS = 3;
export const ANCHOR_TITLE_MAX = 60;
/** The optional focus impulse: just five minutes, then you may stop. */
export const ANCHOR_IMPULSE_SECONDS = 5 * 60;

/** Weekdays, Monday first (0 = Monday … 6 = Sunday). */
export const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;
export const EVERY_DAY: readonly number[] = [0, 1, 2, 3, 4, 5, 6];

/** Low-threshold starting points for an empty list. */
export const ANCHOR_SUGGESTIONS = ['X-Post absetzen', 'Postfach kurz sichten', '10 Minuten lesen', 'Kurz an die frische Luft'] as const;

/** Trimmed, single-spaced, capped; empty when there is nothing left. */
export function anchorTitle(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, ANCHOR_TITLE_MAX).trimEnd();
}

/** Weekday of a moment in local time, Monday = 0. */
export function weekdayOf(at: Millis): number {
  return (new Date(at).getDay() + 6) % 7;
}

/** Sorted, unique weekdays; nothing usable means every day. */
export function normalizeDays(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [...EVERY_DAY];
  const days = [...new Set((raw as unknown[]).filter((d): d is number => typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
  return days.length ? days : [...EVERY_DAY];
}

/** "Täglich", "Werktags", "Am Wochenende" or the days ("Mo · Mi · Fr"). */
export function rhythmLabel(days: readonly number[]): string {
  const key = normalizeDays(days).join('');
  if (key === '0123456') return 'Täglich';
  if (key === '01234') return 'Werktags';
  if (key === '56') return 'Am Wochenende';
  return normalizeDays(days)
    .map((d) => WEEKDAYS[d])
    .join(' · ');
}

export function isAnchorDue(anchor: DailyAnchor, at: Millis): boolean {
  return anchor.days.includes(weekdayOf(at));
}

export function isAnchorDone(anchor: DailyAnchor, day: string): boolean {
  return anchor.lastDoneDay === day;
}

export function canAddAnchor(anchors: readonly DailyAnchor[]): boolean {
  return anchors.length < MAX_ANCHORS;
}

/** Today's view: what belongs to today (in the user's order) and what is free today. */
export function anchorsToday(anchors: readonly DailyAnchor[], at: Millis, day: string): { due: DailyAnchor[]; free: DailyAnchor[]; done: number } {
  const due = anchors.filter((a) => isAnchorDue(a, at));
  return { due, free: anchors.filter((a) => !isAnchorDue(a, at)), done: due.filter((a) => isAnchorDone(a, day)).length };
}

/** Stored anchors, checked one by one: a broken entry never costs the others. */
export function sanitizeAnchors(raw: unknown): DailyAnchor[] {
  if (!Array.isArray(raw)) return [];
  const out: DailyAnchor[] = [];
  const seen = new Set<string>();
  for (const item of raw as unknown[]) {
    if (out.length >= MAX_ANCHORS) break;
    if (typeof item !== 'object' || item === null) continue;
    const a = item as Record<string, unknown>;
    const title = typeof a.title === 'string' ? anchorTitle(a.title) : '';
    if (typeof a.id !== 'string' || !a.id || seen.has(a.id) || !title) continue;
    seen.add(a.id);
    out.push({
      id: a.id,
      title,
      createdAt: typeof a.createdAt === 'number' && Number.isFinite(a.createdAt) ? a.createdAt : 0,
      lastDoneDay: typeof a.lastDoneDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.lastDoneDay) ? a.lastDoneDay : null,
      // Anchors from before the rhythm were daily.
      days: normalizeDays(a.days),
    });
  }
  return out;
}
