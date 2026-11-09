import { useEffect } from 'react';
import { momentFromIdle, type Moment } from '../domain/companion';
import { desktop, isCompanionView } from '../lib/desktop';

/**
 * The input rhythm, from the system's idle timer (desktop only): typing,
 * micro-pause or away. Sampled every 2 seconds; only the number of seconds
 * since the last input is read, never what was typed or where.
 */
const SAMPLE_MS = 2000;
/** An old sample says nothing about now. */
const STALE_MS = 6000;

let sample: { idleSeconds: number; at: number } | null = null;
let users = 0;
let timer = 0;

/** The current moment, or null without a fresh signal (browser, bridge error). */
export function currentMoment(now = Date.now()): Moment | null {
  if (!sample || now - sample.at > STALE_MS) return null;
  return momentFromIdle(sample.idleSeconds);
}

async function poll() {
  try {
    const { idleSeconds } = await desktop!.getIdleState(60);
    if (Number.isFinite(idleSeconds)) sample = { idleSeconds, at: Date.now() };
  } catch {
    sample = null;
  }
}

/** Keeps the sampler running while the app window is mounted. */
export function useAttention(): void {
  useEffect(() => {
    if (!desktop || isCompanionView) return;
    if (users++ === 0) {
      void poll();
      timer = window.setInterval(() => void poll(), SAMPLE_MS);
    }
    return () => {
      if (--users === 0) {
        window.clearInterval(timer);
        sample = null;
      }
    };
  }, []);
}

/** For tests. */
export function setAttentionSample(idleSeconds: number | null, at = Date.now()): void {
  sample = idleSeconds === null ? null : { idleSeconds, at };
}
