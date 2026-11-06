/**
 * Soft interaction sounds, synthesised with the Web Audio API (no files),
 * tuned to A = 432 Hz:
 * - bloom(): a warm pad that opens up ("Ankommen", "Feierabend")
 * - focusTone(): a deep binaural tone when a block starts (216 / 226 Hz, 10 Hz alpha beat)
 * - breathTone(): a quiet 432 Hz binaural tone that swells with the breath
 * Everything is very quiet, fades in and out, and never clicks.
 */
import { audio, holdAudio } from './soundscape';

const A = 432;

function ready(): AudioContext | null {
  const ac = audio();
  if (!ac) return null;
  if (ac.state === 'suspended') void ac.resume().catch(() => undefined);
  return ac;
}

/** A gain envelope: silence → peak (attack) → silence (release). */
function envelope(ac: AudioContext, at: number, peak: number, attack: number, hold: number, release: number): GainNode {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + attack);
  g.gain.setValueAtTime(peak, at + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
  return g;
}

/** Warm blooming chord (A major in 432 tuning), slightly staggered. */
export function bloom(): void {
  const ac = ready();
  if (!ac) return;
  const at = ac.currentTime + 0.02;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(900, at);
  lp.frequency.exponentialRampToValueAtTime(2600, at + 0.9);
  const out = ac.createGain();
  out.gain.value = 0.16;
  lp.connect(out).connect(ac.destination);
  const notes = [A / 2, (A / 2) * 1.26, (A / 2) * 1.5, A, A * 1.5];
  notes.forEach((f, i) => {
    const start = at + i * 0.045;
    for (const [type, detune, level] of [
      ['sine', 0, 0.5],
      ['triangle', 6, 0.18],
    ] as const) {
      const osc = ac.createOscillator();
      osc.type = type;
      osc.frequency.value = f;
      osc.detune.value = detune;
      const env = envelope(ac, start, level / (1 + i * 0.35), 0.22, 0.25, 2.2);
      osc.connect(env).connect(lp);
      osc.start(start);
      osc.stop(start + 2.8);
    }
  });
  holdAudio(3200);
}

/** Binaural pair: left and right ear get slightly different tones. */
function binaural(ac: AudioContext, left: number, right: number): { out: GainNode; stop: (at: number) => void } {
  const merger = ac.createChannelMerger(2);
  const out = ac.createGain();
  out.gain.value = 0;
  const l = ac.createOscillator();
  const r = ac.createOscillator();
  l.frequency.value = left;
  r.frequency.value = right;
  l.connect(merger, 0, 0);
  r.connect(merger, 0, 1);
  merger.connect(out).connect(ac.destination);
  l.start();
  r.start();
  return {
    out,
    stop: (at) => {
      l.stop(at);
      r.stop(at);
    },
  };
}

/**
 * Deep focus tone for the start of a block: short (about three seconds),
 * a soft swell and a long exponential fade, so it never stops abruptly.
 */
export function focusTone(): void {
  const ac = ready();
  if (!ac) return;
  const at = ac.currentTime + 0.02;
  const { out, stop } = binaural(ac, A / 2, A / 2 + 10);
  out.gain.setValueAtTime(0.0001, at);
  out.gain.exponentialRampToValueAtTime(0.06, at + 0.7);
  out.gain.setValueAtTime(0.06, at + 1.1);
  // setTargetAtTime approaches zero smoothly; after ~5 time constants it is inaudible.
  out.gain.setTargetAtTime(0.0001, at + 1.1, 0.42);
  out.gain.setValueAtTime(0, at + 3.4);
  stop(at + 3.5);
  holdAudio(3800);
}

/**
 * Quiet 432 Hz binaural tone that rises on the in-breath and settles on the
 * out-breath (one breath = `cycle` seconds). Returns a gentle stop.
 */
export function breathTone(cycle = 10): () => void {
  const ac = ready();
  if (!ac) return () => undefined;
  const at = ac.currentTime + 0.02;
  const { out, stop } = binaural(ac, A, A + 6);
  out.gain.setValueAtTime(0, at);
  out.gain.linearRampToValueAtTime(0.03, at + 2);
  // The breath: a slow swell on top of the base level.
  const lfo = ac.createOscillator();
  const depth = ac.createGain();
  lfo.frequency.value = 1 / cycle;
  depth.gain.value = 0.018;
  lfo.connect(depth).connect(out.gain);
  lfo.start(at);
  let alive = true;
  const keep = window.setInterval(() => holdAudio(2000), 1000);
  holdAudio(2000);
  return () => {
    if (!alive) return;
    alive = false;
    window.clearInterval(keep);
    const now = ac.currentTime;
    out.gain.cancelScheduledValues(now);
    out.gain.setValueAtTime(out.gain.value, now);
    out.gain.linearRampToValueAtTime(0, now + 1.5);
    lfo.stop(now + 1.6);
    stop(now + 1.6);
    holdAudio(1800);
  };
}
