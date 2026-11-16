import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { RoomLife, RoomPhase, RoomWeather } from '../domain/companionRoom';
import type { Activity } from '../domain/energy';
import { nextStroll, roomThing } from '../domain/roomObjects';
import type { CompanionObjectId, HavenId } from '../domain/types';
import { Haven } from './Haven';
import { RoomThings } from './RoomThings';

const LAMP_KEY = 'todome:room-lamp';

function storedLamp(): 'on' | 'off' | null {
  try {
    const v = window.localStorage.getItem(LAMP_KEY);
    return v === 'on' || v === 'off' ? v : null;
  } catch {
    return null;
  }
}

/** Raindrops and snowflakes in his window: a few, at fixed places (x %, delay s). */
const DROPS: ReadonlyArray<readonly [number, number]> = [
  [12, 0],
  [28, 0.6],
  [44, 0.25],
  [58, 0.9],
  [72, 0.4],
  [86, 1.1],
  [36, 1.4],
  [64, 1.7],
];
const STARS: ReadonlyArray<readonly [number, number, number]> = [
  [18, 22, 0],
  [62, 14, 1.2],
  [80, 38, 2.1],
  [34, 46, 0.7],
  [52, 30, 1.6],
];

/** Where he stands when your day keeps him in one place (working with you, asleep). */
const HOME_X = 56;
/** How long a walk across the room takes (mirrors the transition in companion-room.css). */
const WALK_MS = 2200;
/** How often he looks for a new place on his own. */
const STROLL_MS = 11_000;

interface Spot {
  x: number;
  activity: Activity;
  line: string;
  thing: CompanionObjectId | null;
}

interface Props {
  phase: RoomPhase;
  weather: RoomWeather;
  home: HavenId;
  still: boolean;
  /** His name, for what the room says about him. */
  name: string;
  /** What your day asks of him (working with you, asleep, free). */
  life: RoomLife;
  /** The furniture of his room. */
  things: readonly CompanionObjectId[];
  /** The figure for an activity (avatar scene with his level effects). */
  figure: (activity: Activity) => ReactNode;
}

/**
 * His room: a quiet, architectural refuge drawn in hairline perspective. A
 * window on the back wall shows the time of day and the weather outside, its
 * light falls onto the floor; a floor lamp gives warm light (a click switches
 * it, remembered on this device; by default it glows from dusk on). He lives
 * in it: while your day leaves him free he strolls about, looks out of the
 * window, sits down, and uses his things; click one and he walks over to it.
 * While you work he works quietly with you, at night he sleeps. With effects
 * off he simply stays where he is.
 */
export function CompanionRoom({ phase, weather, home, still, name, life, things, figure }: Props) {
  // Your day keeps him in place while you work or while he sleeps.
  const held = life.activity === 'writing' || life.activity === 'sleeping';
  const [spot, setSpot] = useState<Spot>({ x: HOME_X, activity: life.activity, line: life.line, thing: null });
  const at = useRef(spot.x);
  const [walking, setWalking] = useState(false);
  const walkTimer = useRef(0);
  const seed = useRef(1);
  const [lastUse, setLastUse] = useState(0);

  /** Sends him to a place; a real distance makes him walk there first. */
  const goTo = useCallback(
    (next: Spot) => {
      if (Math.abs(at.current - next.x) > 1 && !still) {
        setWalking(true);
        window.clearTimeout(walkTimer.current);
        walkTimer.current = window.setTimeout(() => setWalking(false), WALK_MS);
      }
      at.current = next.x;
      setSpot(next);
    },
    [still],
  );
  useEffect(() => () => window.clearTimeout(walkTimer.current), []);

  // Back home whenever your day holds him; free again, he starts where he is.
  useEffect(() => {
    if (held) goTo({ x: HOME_X, activity: life.activity, line: life.line, thing: null });
  }, [held, life.activity, life.line, goTo]);

  // A stroll now and then, on his own (a click on one of his things starts the wait anew).
  useEffect(() => {
    if (held || still) return;
    const id = window.setInterval(() => {
      seed.current = (seed.current * 7 + 3) % 97;
      const n = nextStroll(at.current, things, seed.current);
      goTo({ x: n.x, activity: n.activity, line: `${name} ${n.doing}`, thing: n.thing ?? null });
    }, STROLL_MS);
    return () => window.clearInterval(id);
  }, [held, still, things, name, lastUse, goTo]);

  const use = (id: CompanionObjectId) => {
    const t = roomThing(id);
    if (!t || held) return;
    setLastUse(Date.now());
    goTo({ x: t.x, activity: t.activity, line: `${name} ${t.doing}`, thing: t.id });
  };

  const shown: Spot = held ? { x: HOME_X, activity: life.activity, line: life.line, thing: null } : spot;
  const facingLeft = shown.x < HOME_X - 4;
  const [lamp, setLamp] = useState<'on' | 'off' | null>(storedLamp);
  const lampOn = lamp ? lamp === 'on' : phase === 'dusk' || phase === 'night';
  const toggleLamp = () => {
    const next = lampOn ? 'off' : 'on';
    setLamp(next);
    try {
      window.localStorage.setItem(LAMP_KEY, next);
    } catch {
      /* a per-device convenience only */
    }
  };

  return (
    <div
      className={`companion-hub__home mark-room mark-room--${phase} mark-room--${weather}${lampOn ? ' is-lamp' : ''}${still ? ' is-still' : ''}`}
      style={{ '--mark-x': `${shown.x}%` } as CSSProperties}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        if (!r.width || !r.height) return;
        e.currentTarget.style.setProperty('--mx', `${Math.round(((e.clientX - r.left) / r.width) * 100)}%`);
        e.currentTarget.style.setProperty('--my', `${Math.round(((e.clientY - r.top) / r.height) * 100)}%`);
      }}
    >
      {/* The room in one-point perspective: back wall, its edges running out
          to the corners of the frame, floor boards towards the vanishing point. */}
      <svg className="mark-room__lines" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">
        <rect className="mark-room__wall" x="270" y="72" width="460" height="318" />
        <path className="mark-room__edge" d="M270 72 L0 0 M730 72 L1000 0 M270 390 L0 600 M730 390 L1000 600" />
        <path className="mark-room__boards" d="M360 390 L210 600 M450 390 L400 600 M550 390 L600 600 M640 390 L790 600" />
        <path className="mark-room__skirting" d="M270 382 L730 382" />
      </svg>

      <div className="mark-room__window" aria-hidden="true">
        <span className="mark-room__sky" />
        {weather === 'clear' && (phase === 'night' ? <span className="mark-room__moon" /> : <span className="mark-room__sun" />)}
        {phase === 'night' && weather !== 'cloudy' && STARS.map(([x, y, d]) => <i key={`${x}-${y}`} className="mark-room__star" style={{ left: `${x}%`, top: `${y}%`, '--d': `${d}s` } as CSSProperties} />)}
        {weather === 'cloudy' && (
          <>
            <span className="mark-room__cloud" />
            <span className="mark-room__cloud mark-room__cloud--b" />
          </>
        )}
        {(weather === 'rain' || weather === 'snow') &&
          DROPS.map(([x, d]) => <i key={x} className={weather === 'rain' ? 'mark-room__drop' : 'mark-room__flake'} style={{ left: `${x}%`, '--d': `${d}s` } as CSSProperties} />)}
        <span className="mark-room__frame" />
      </div>
      <span className="mark-room__beam" aria-hidden="true" />

      <span className="companion-hub__lantern" aria-hidden="true" />
      <span className="companion-hub__horizon" aria-hidden="true" />
      <span className="companion-hub__floor" aria-hidden="true" />

      <button type="button" className="mark-room__lamp" aria-pressed={lampOn} aria-label={lampOn ? 'Lampe ausschalten' : 'Lampe einschalten'} title={lampOn ? 'Lampe aus' : 'Lampe an'} onClick={toggleLamp}>
        <span className="mark-room__shade" />
        <span className="mark-room__pole" />
        <span className="mark-room__glow" />
      </button>

      <RoomThings items={things} active={shown.thing} name={name} onUse={use} />

      <div className={`companion-hub__stage${walking ? ' is-walking' : ''}${facingLeft ? ' is-facing-left' : ''}`} aria-hidden="true">
        <Haven id={home} still={still} />
        {figure(walking ? 'waiting' : shown.activity)}
      </div>

      <p className="mark-room__caption" aria-live="polite">
        {shown.line}
      </p>
    </div>
  );
}
