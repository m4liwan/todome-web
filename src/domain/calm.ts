import { toTimeEntries } from './reports';
import type { SessionProjection } from './session';
import type { AppState, Millis } from './types';
import { addDays, dayKey } from '../lib/time';

/**
 * Anti-Hustle statistics: what you protected, not how much you produced.
 * Over the last seven days: focus time in blocks nobody broke into, the
 * longest calm stretch, thoughts set aside, deep breaths and smooth blocks.
 */
export interface CalmStats {
  protectedMs: Millis;
  longestMs: Millis;
  parked: number;
  breaths: number;
  smooth: number;
  feelings: number;
}

export function calmStats(state: AppState, projections: readonly SessionProjection[], now: Millis): CalmStats {
  const today = dayKey(now);
  const days = new Set(Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)));
  const entries = toTimeEntries(state, projections).filter((e) => days.has(e.day));
  // Interruption sessions (stacked ones) are work, but not protected time.
  const own = entries.filter((e) => !state.sessions[e.sessionId]?.parentSessionId);
  const calm = own.filter((e) => e.interruptions === 0);
  const sumDays = (log: Record<string, number>) => [...days].reduce((a, d) => a + (log[d] ?? 0), 0);
  const feels = Object.values(state.wellbeing.feelLog).filter((f) => days.has(dayKey(f.at)));
  return {
    protectedMs: calm.reduce((a, e) => a + e.netMs, 0),
    longestMs: calm.reduce((a, e) => Math.max(a, e.netMs), 0),
    parked: sumDays(state.wellbeing.parkedLog),
    breaths: sumDays(state.wellbeing.breathLog),
    smooth: feels.filter((f) => f.feel === 'smooth').length,
    feelings: feels.length,
  };
}
