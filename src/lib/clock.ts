import type { Millis } from '../domain/types';

/**
 * Injectable clock. In live mode it is wall time. In demo mode it runs as a
 * time-lapse (e.g. 30× → a 90-minute block passes in 3 minutes) so the
 * check-in rhythm can be experienced without waiting.
 */
export interface Clock {
  now(): Millis;
  readonly speed: number;
  setSpeed(speed: number): void;
  /** Jump forward (demo only), e.g. to simulate an idle period. */
  advance(ms: Millis): void;
  serialize(): ClockState;
}

export interface ClockState {
  anchorReal: Millis;
  anchorVirtual: Millis;
  speed: number;
}

export function createClock(initial?: ClockState, realNow: () => Millis = Date.now): Clock {
  let state: ClockState = initial ?? { anchorReal: realNow(), anchorVirtual: realNow(), speed: 1 };
  const now = () => state.anchorVirtual + (realNow() - state.anchorReal) * state.speed;
  return {
    now,
    get speed() {
      return state.speed;
    },
    setSpeed(speed: number) {
      state = { anchorReal: realNow(), anchorVirtual: now(), speed: Math.max(1, speed) };
    },
    advance(ms: Millis) {
      state = { anchorReal: realNow(), anchorVirtual: now() + Math.max(0, ms), speed: state.speed };
    },
    serialize: () => {
      // Re-anchor so a persisted clock resumes exactly where it was.
      state = { anchorReal: realNow(), anchorVirtual: now(), speed: state.speed };
      return { ...state };
    },
  };
}

export const systemClock: Clock = {
  now: () => Date.now(),
  speed: 1,
  setSpeed: () => undefined,
  advance: () => undefined,
  serialize: () => ({ anchorReal: Date.now(), anchorVirtual: Date.now(), speed: 1 }),
};
