/**
 * Ambience sounds, synthesised live with the Web Audio API (no audio files):
 * rain, wind for clouds, a quiet snowy hush and rustling leaves.
 *
 * One AudioContext for the whole app. Changing the ambience crossfades,
 * the volume glides, and nothing is rebuilt on a re-render, so the sound
 * starts at once and never stutters.
 */
export type SoundKind = 'rain' | 'clouds' | 'snow' | 'leaves';

type Layer = { out: GainNode; stop: () => void };

const FADE_IN = 1.4;
const FADE_OUT = 1.1;
/** Overall loudness at volume 1: ambience sits behind everything else. */
const MAX_GAIN = 0.55;

/**
 * Loudness is perceived logarithmically: the slider value is squared, so
 * 5 % is barely there and 100 % is full (0.05² · max ≈ 0.0014).
 */
export const volumeToGain = (volume: number) => Math.pow(Math.max(0, Math.min(1, volume)), 2) * MAX_GAIN;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let layer: Layer | null = null;
let layerKind: SoundKind | null = null;
/** Until when UI sounds (chimes, breathing tone) need the device. */
let uiUntil = 0;
const uiBusy = () => performance.now() < uiUntil;
/** UI sounds announce how long they play, so the device is not put to sleep under them. */
export function holdAudio(ms: number): void {
  uiUntil = Math.max(uiUntil, performance.now() + ms);
}

/** The one AudioContext of the app (ambience and UI sounds share it). */
export function audio(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  return ctx;
}

/** Four seconds of soft (pink-ish) noise, looped by every layer. */
function noiseBuffer(ac: AudioContext): AudioBuffer {
  if (noise) return noise;
  const len = ac.sampleRate * 4;
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      d[i] = (b0 + b1 + b2 + white * 0.1848) * 0.16;
    }
    // Smooth the loop seam.
    const fade = 2048;
    for (let i = 0; i < fade; i++) {
      const t = i / fade;
      d[i] = (d[i] ?? 0) * t + (d[len - fade + i] ?? 0) * (1 - t);
    }
  }
  noise = buf;
  return buf;
}

function noiseSource(ac: AudioContext): AudioBufferSourceNode {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac);
  src.loop = true;
  src.loopStart = Math.random() * 2;
  return src;
}

function filter(ac: AudioContext, type: BiquadFilterType, frequency: number, q = 0.7): BiquadFilterNode {
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = q;
  return f;
}

/** Slow wobble on an AudioParam (wind gusts, swelling rain). */
function lfo(ac: AudioContext, param: AudioParam, rate: number, depth: number): OscillatorNode {
  const osc = ac.createOscillator();
  const amount = ac.createGain();
  osc.frequency.value = rate;
  amount.gain.value = depth;
  osc.connect(amount).connect(param);
  osc.start();
  return osc;
}

/** Random short noise grains (drops, rustling), scheduled slightly ahead. */
function grains(ac: AudioContext, out: AudioNode, opts: { every: [number, number]; band: [number, number]; length: [number, number]; level: [number, number]; burst?: number }): () => void {
  let timer = 0;
  let alive = true;
  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  const shot = (at: number) => {
    const src = noiseSource(ac);
    const bp = filter(ac, 'bandpass', rand(...opts.band), rand(2, 6));
    const env = ac.createGain();
    const pan = ac.createStereoPanner();
    const len = rand(...opts.length);
    pan.pan.value = rand(-0.8, 0.8);
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(rand(...opts.level), at + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, at + len);
    src.connect(bp).connect(env).connect(pan).connect(out);
    src.start(at, Math.random() * 3);
    src.stop(at + len + 0.05);
  };
  const tick = () => {
    if (!alive) return;
    const at = ac.currentTime + 0.05;
    const n = opts.burst ? 1 + Math.floor(Math.random() * opts.burst) : 1;
    for (let i = 0; i < n; i++) shot(at + i * rand(0.015, 0.06));
    timer = window.setTimeout(tick, rand(...opts.every));
  };
  tick();
  return () => {
    alive = false;
    window.clearTimeout(timer);
  };
}

function build(ac: AudioContext, kind: SoundKind): Layer {
  const out = ac.createGain();
  out.gain.value = 0;
  out.connect(master as GainNode);
  const sources: AudioScheduledSourceNode[] = [];
  const stops: Array<() => void> = [];
  const bed = (chain: AudioNode[], level: number) => {
    const src = noiseSource(ac);
    const g = ac.createGain();
    g.gain.value = level;
    let node: AudioNode = src;
    for (const c of chain) node = node.connect(c);
    node.connect(g).connect(out);
    src.start();
    sources.push(src);
    return g;
  };

  if (kind === 'rain') {
    // Steady rain on the window: a bright hiss, a soft body and single drops.
    bed([filter(ac, 'highpass', 700), filter(ac, 'lowpass', 7200)], 0.55);
    const body = bed([filter(ac, 'lowpass', 520)], 0.4);
    sources.push(lfo(ac, body.gain, 0.06, 0.12));
    stops.push(grains(ac, out, { every: [35, 140], band: [1800, 5200], length: [0.025, 0.07], level: [0.08, 0.32] }));
  } else if (kind === 'clouds') {
    // Wind passing high above: low, slowly breathing gusts.
    const lp = filter(ac, 'lowpass', 420, 1.2);
    const gust = bed([lp], 0.9);
    sources.push(lfo(ac, lp.frequency, 0.05, 220));
    sources.push(lfo(ac, gust.gain, 0.031, 0.35));
    bed([filter(ac, 'bandpass', 1400, 0.6)], 0.07);
  } else if (kind === 'snow') {
    // Snowy hush: almost silence, a muffled breeze and the softest air.
    const lp = filter(ac, 'lowpass', 300, 0.9);
    const hush = bed([lp], 0.7);
    sources.push(lfo(ac, hush.gain, 0.022, 0.25));
    sources.push(lfo(ac, lp.frequency, 0.04, 90));
    bed([filter(ac, 'highpass', 5000), filter(ac, 'lowpass', 9000)], 0.03);
  } else {
    // Autumn: a mild breeze and leaves rustling in small bursts.
    const lp = filter(ac, 'lowpass', 650, 1);
    const breeze = bed([lp], 0.55);
    sources.push(lfo(ac, lp.frequency, 0.07, 260));
    sources.push(lfo(ac, breeze.gain, 0.045, 0.2));
    stops.push(grains(ac, out, { every: [180, 900], band: [2600, 6800], length: [0.03, 0.09], level: [0.04, 0.14], burst: 6 }));
  }

  return {
    out,
    stop: () => {
      stops.forEach((s) => s());
      for (const s of sources) {
        try {
          s.stop();
        } catch {
          /* already stopped */
        }
      }
      out.disconnect();
    },
  };
}

/** Starts, crossfades or stops the ambience sound. Safe to call often. */
export function setSoundscape(kind: SoundKind | null, volume: number): void {
  if (!kind) {
    fadeOutCurrent();
    return;
  }
  const ac = audio();
  if (!ac || !master) return;
  void ac.resume().catch(() => undefined);
  const now = ac.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setTargetAtTime(volumeToGain(volume), now, 0.25);
  if (kind === layerKind && layer) return;
  fadeOutCurrent();
  const next = build(ac, kind);
  next.out.gain.setValueAtTime(0, now);
  next.out.gain.linearRampToValueAtTime(1, now + FADE_IN);
  layer = next;
  layerKind = kind;
}

/** Only the volume, gliding (no rebuild). */
export function setSoundVolume(volume: number): void {
  if (!ctx || !master) return;
  master.gain.setTargetAtTime(volumeToGain(volume), ctx.currentTime, 0.15);
}

/** Browsers start audio only after a gesture; call this from one. */
export function unlockSound(): void {
  if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
}

function fadeOutCurrent() {
  if (!ctx || !layer) return;
  const old = layer;
  const now = ctx.currentTime;
  old.out.gain.cancelScheduledValues(now);
  old.out.gain.setValueAtTime(old.out.gain.value, now);
  old.out.gain.linearRampToValueAtTime(0, now + FADE_OUT);
  window.setTimeout(() => {
    old.stop();
    // Nothing playing any more: let the audio device rest.
    if (!layer && ctx && ctx.state === 'running' && !uiBusy()) void ctx.suspend().catch(() => undefined);
  }, FADE_OUT * 1000 + 120);
  layer = null;
  layerKind = null;
}

