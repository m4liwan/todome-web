import { dayKey, HOUR } from '../lib/time';
import type { AppState, Millis, SessionFeel } from './types';

/**
 * Rhythm memory: when do blocks feel smooth? Learned only from the user's own
 * "Wie hat sich das angefühlt?" answers of the last 4 weeks, on this device.
 * The companion uses it gently: it mentions the best window in the morning
 * and visits less often inside it (flow is trusted, not checked).
 *
 * A window is only named with enough evidence, and only when it is clearly
 * better than the rest of the day, so it never invents a pattern.
 */
export interface FocusWindow {
  /** Start hour (local), inclusive. */
  from: number;
  /** End hour (local), exclusive: from + 2. */
  to: number;
  /** Blocks answered inside the window. */
  samples: number;
}

const SCORE: Record<SessionFeel, number> = { smooth: 1, neutral: 0.5, tough: 0 };
const LOOKBACK_DAYS = 28;
const MIN_TOTAL = 10;
const MIN_IN_WINDOW = 4;
const MIN_LEAD = 0.2;
const MIN_SCORE = 0.65;

export function focusRhythm(state: AppState, now: Millis): FocusWindow | null {
  const since = now - LOOKBACK_DAYS * 24 * HOUR;
  const byHour = Array.from({ length: 24 }, () => ({ sum: 0, n: 0 }));
  let total = 0;
  let sum = 0;
  for (const [sessionId, entry] of Object.entries(state.wellbeing.feelLog)) {
    const session = state.sessions[sessionId];
    const score = SCORE[entry.feel];
    if (!session || score === undefined || entry.at < since) continue;
    const hour = new Date(session.createdAt).getHours();
    byHour[hour]!.sum += score;
    byHour[hour]!.n += 1;
    total += 1;
    sum += score;
  }
  if (total < MIN_TOTAL) return null;

  let best: { from: number; avg: number; n: number } | null = null;
  for (let h = 0; h < 23; h++) {
    const n = byHour[h]!.n + byHour[h + 1]!.n;
    if (n < MIN_IN_WINDOW) continue;
    const avg = (byHour[h]!.sum + byHour[h + 1]!.sum) / n;
    if (!best || avg > best.avg || (avg === best.avg && n > best.n)) best = { from: h, avg, n };
  }
  if (!best || best.avg < MIN_SCORE) return null;
  const rest = total - best.n;
  const restAvg = rest > 0 ? (sum - best.avg * best.n) / rest : 0;
  if (rest > 0 && best.avg - restAvg < MIN_LEAD) return null;
  return { from: best.from, to: best.from + 2, samples: best.n };
}

export function inFocusWindow(window: FocusWindow | null, now: Millis): boolean {
  if (!window) return false;
  const h = new Date(now).getHours();
  return h >= window.from && h < window.to;
}

/** "zwischen 9 und 11 Uhr" */
export function windowLabel(window: FocusWindow): string {
  return `zwischen ${window.from} und ${window.to} Uhr`;
}

/** Memoized per state object and hour: the planner runs every few seconds. */
let cache: { state: AppState; hour: string; result: FocusWindow | null } | null = null;
export function focusRhythmCached(state: AppState, now: Millis): FocusWindow | null {
  const hour = `${dayKey(now)}:${new Date(now).getHours()}`;
  if (cache && cache.state === state && cache.hour === hour) return cache.result;
  const result = focusRhythm(state, now);
  cache = { state, hour, result };
  return result;
}
