import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { useProgressionEvents } from '../app/progression';
import { effectTier, type EffectTier } from '../domain/companionProgression';
import { useEffectsMode } from '../lib/effects';

/**
 * The companion's earned looks, wrapped around any avatar:
 *  - sparkle (level 10+): a small burst of sparks on a click and on each XP gain
 *  - aura (level 25+): three layers of light: a wide wash that falls on the
 *    card, a soft halo and a bright core; near the pointer they part a little
 *  - shiny (level 50+): the aura turns iridescent; the holofoil on the figure
 *    itself comes from <Avatar holo> (pass `holoFor(level)`) and follows the
 *    pointer like a foil card catching the light; each click and each XP
 *    gain lets star dust rise slowly from the companion
 *
 * Performance: only opacity and the individual transform properties
 * (scale, rotate, translate) animate, all compositor work. In calm mode
 * (reduced motion, low battery) nothing loops, bursts or rises. Off-screen
 * and during a focus block the loops pause and nothing new starts. Every
 * timer is cleared on unmount; each dust wave removes itself when it lands.
 *
 * `enabled` is the user's switch (appearance.companionFx): off, the plain
 * companion is shown, whatever the level.
 */

const BURST_MS = 900;
/** Ignore triggers closer together than this (no spark storm). */
const BURST_GAP_MS = 350;

/** Eight sparks around the companion: angle, distance (% of size), delay, size. */
const SPARKS: ReadonlyArray<readonly [number, number, number, number]> = [
  [-80, 46, 0, 1],
  [-35, 50, 60, 0.7],
  [10, 44, 20, 0.9],
  [55, 52, 90, 0.6],
  [100, 46, 40, 0.8],
  [145, 50, 110, 0.65],
  [190, 44, 30, 0.85],
  [235, 50, 80, 0.7],
];

/** Star dust (level 50+): motes per wave, waves in the air at once, life of a wave. */
export const DUST_COUNT = 9;
export const DUST_WAVES = 3;
/** Longer than the latest mote's delay plus flight (450 + 2500 ms). */
export const DUST_MS = 3000;
const DUST_COLORS = ['#ffcf3d', '#ff7ad1', '#6cbcff', '#5ee6b0', '#b48cff'] as const;

/** One mote: start (% of the box), drift and rise (% of the smaller side), timing, size, colour. */
export interface Mote {
  x: number;
  y: number;
  dx: number;
  rise: number;
  delay: number;
  dur: number;
  size: number;
  color: string;
}

/** A wave of motes from a seed: the same seed always gives the same wave (pure render). */
export function dustWave(seed: number): Mote[] {
  // mulberry32: tiny, fast and good enough for decoration.
  let a = Math.imul(seed, 0x9e3779b9) >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const between = (lo: number, hi: number) => Math.round(lo + rnd() * (hi - lo));
  return Array.from({ length: DUST_COUNT }, () => ({
    x: between(22, 78),
    y: between(45, 78),
    dx: between(-14, 14),
    rise: between(55, 95),
    delay: between(0, 450),
    dur: between(1700, 2500),
    size: between(5, 10),
    color: DUST_COLORS[between(0, DUST_COLORS.length - 1)]!,
  }));
}

/**
 * The app-wide touch at level 50: classes for the shell. ' is-legendary'
 * lets the level badge shimmer and lays a holo hairline under the header;
 * ' is-fx-calm' keeps it still (reduced motion, low battery). Nothing when
 * the user switched the effects off or below level 50. A focus block pauses
 * it through `.shell.is-focusing` in CSS.
 */
export function useLegendaryShell(level: number, enabled: boolean): string {
  const legendary = enabled && effectTier(level) === 'shiny';
  const mode = useEffectsMode(legendary);
  if (mode === 'off') return '';
  return mode === 'calm' ? ' is-legendary is-fx-calm' : ' is-legendary';
}

/** The holofoil on the figure: earned at level 50, shown only with effects on. */
export const holoFor = (level: number, enabled = true) => enabled && effectTier(level) === 'shiny';

/** Pointer offsets beyond this share of the companion's size count as the edge (±1). */
const REACH = 0.9;
const clampUnit = (v: number) => Math.max(-1, Math.min(1, v));

/**
 * The light follows the pointer: while it moves over the companion's card,
 * `--fx-x` / `--fx-y` (-1 … 1, from the companion's centre) and `data-lit`
 * are written straight onto the element, at most once a frame and without a
 * React render. Mouse and pen only (a finger has no hover). Not during a
 * focus block. Everything is removed again when `active` ends or on unmount.
 */
function usePointerLight(root: RefObject<HTMLSpanElement | null>, active: boolean) {
  useEffect(() => {
    const el = root.current;
    if (!el || !active) return;
    let frame = 0;
    let last: PointerEvent | null = null;

    const dim = () => {
      el.removeAttribute('data-lit');
      el.style.removeProperty('--fx-x');
      el.style.removeProperty('--fx-y');
    };
    const apply = () => {
      frame = 0;
      const e = last;
      if (!e) return;
      const area = el.closest<HTMLElement>('.card') ?? el;
      const a = area.getBoundingClientRect();
      const inside = e.clientX >= a.left && e.clientX <= a.right && e.clientY >= a.top && e.clientY <= a.bottom;
      if (!inside || el.closest('.shell.is-focusing')) return dim();
      const r = el.getBoundingClientRect();
      const reach = Math.max(r.width, r.height) * REACH || 1;
      el.style.setProperty('--fx-x', clampUnit((e.clientX - (r.left + r.width / 2)) / reach).toFixed(3));
      el.style.setProperty('--fx-y', clampUnit((e.clientY - (r.top + r.height / 2)) / reach).toFixed(3));
      el.setAttribute('data-lit', '');
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      last = e;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    // The pointer left the window (no element to go to) or the window lost focus.
    const onOut = (e: PointerEvent) => {
      if (e.relatedTarget) return;
      last = null;
      dim();
    };
    const onBlur = () => {
      last = null;
      dim();
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerout', onOut, { passive: true });
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerout', onOut);
      window.removeEventListener('blur', onBlur);
      cancelAnimationFrame(frame);
      dim();
    };
  }, [root, active]);
}

export function AvatarFx({ level, enabled = true, children, className = '' }: { level: number; enabled?: boolean; children: ReactNode; className?: string }) {
  const mode = useEffectsMode(enabled);
  const tier: EffectTier = mode === 'off' ? 'standard' : effectTier(level);
  const { seq, events } = useProgressionEvents();
  const [burst, setBurst] = useState(0);
  const [offscreen, setOffscreen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const mountedSeq = useRef(seq);
  const lastBurst = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dust, setDust] = useState<number[]>([]);
  const dustSeq = useRef(0);
  const dustTimers = useRef(new Set<ReturnType<typeof setTimeout>>());

  const canBurst = tier !== 'standard' && mode === 'full';
  usePointerLight(root, mode === 'full' && !offscreen && (tier === 'aura' || tier === 'shiny'));

  /** A wave of star dust; it removes itself when its last mote has landed. */
  const raiseDust = () => {
    // Full sky: let the waves in the air finish rather than cutting one off.
    if (dust.length >= DUST_WAVES) return;
    const id = ++dustSeq.current;
    setDust((waves) => [...waves, id]);
    const t = setTimeout(() => {
      dustTimers.current.delete(t);
      setDust((waves) => waves.filter((w) => w !== id));
    }, DUST_MS);
    dustTimers.current.add(t);
  };

  const fire = () => {
    if (!canBurst || offscreen || root.current?.closest('.shell.is-focusing')) return;
    const now = Date.now();
    if (now - lastBurst.current < BURST_GAP_MS) return;
    lastBurst.current = now;
    setBurst((b) => b + 1);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      setBurst(0);
    }, BURST_MS);
    if (tier === 'shiny') raiseDust();
  };

  // Clear every pending timer on unmount: no state updates on a gone component.
  useEffect(() => {
    const waves = dustTimers.current;
    return () => {
      if (timer.current) clearTimeout(timer.current);
      waves.forEach(clearTimeout);
      waves.clear();
    };
  }, []);

  // Each XP gain while visible makes the companion sparkle.
  useEffect(() => {
    if (seq <= mountedSeq.current) return;
    mountedSeq.current = seq;
    if (events.some((e) => e.type === 'xp_gained')) fire();
    // fire reads the latest tier/mode through the render it belongs to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq, events]);

  // Pause the loops while the companion is scrolled out of view.
  useEffect(() => {
    const el = root.current;
    if (!el || tier === 'standard' || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setOffscreen(!entry?.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [tier]);

  if (tier === 'standard') return <>{children}</>;

  return (
    <span
      ref={root}
      className={`avatar-fx is-${tier} is-${mode}${offscreen ? ' is-offscreen' : ''} ${className}`.trim()}
      onPointerDown={fire}
    >
      {tier !== 'sparkle' && (
        <span className="avatar-fx__aura" aria-hidden="true">
          <i className="avatar-fx__wash" />
          <i className="avatar-fx__halo" />
          <i className="avatar-fx__core" />
        </span>
      )}
      {children}
      {burst > 0 && (
        <span key={burst} className="avatar-fx__burst" aria-hidden="true">
          {SPARKS.map(([angle, dist, delay, scale], i) => (
            <i key={i} style={{ '--a': `${angle}deg`, '--d': dist, '--delay': `${delay}ms`, '--s': scale } as CSSProperties} />
          ))}
        </span>
      )}
      {dust.map((id) => (
        <span key={id} className="avatar-fx__dust" aria-hidden="true">
          {dustWave(id).map((m, i) => (
            <i
              key={i}
              style={
                {
                  '--x': `${m.x}%`,
                  '--y': `${m.y}%`,
                  '--dx': m.dx,
                  '--rise': m.rise,
                  '--delay': `${m.delay}ms`,
                  '--dur': `${m.dur}ms`,
                  '--size': `${m.size}px`,
                  '--c': m.color,
                } as CSSProperties
              }
            />
          ))}
        </span>
      ))}
    </span>
  );
}
