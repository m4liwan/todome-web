import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { isProPalette, openPro, themesUnlocked } from '../app/pro';
import { useServices } from '../app/services';
import { quickShortcut, type QuickShortcut } from '../domain/quickOrb';
import type { AppState } from '../domain/types';
import { IconFlame, IconHome, IconMoon, IconMusic, IconSnowflake, IconSparkle, IconSun } from './icons';

/** A shortcut's small sign: its colour for a light colour, otherwise an icon. */
export function ShortcutGlyph({ shortcut }: { shortcut: QuickShortcut }) {
  if (shortcut.swatch) {
    return <span className="orb-glyph orb-glyph--swatch" aria-hidden="true" style={{ '--a': shortcut.swatch[0], '--b': shortcut.swatch[1] } as CSSProperties} />;
  }
  const icon =
    shortcut.icon === 'light' ? <IconSun size={16} />
    : shortcut.icon === 'theme' ? <IconMoon size={16} />
    : shortcut.icon === 'winter' ? <IconSnowflake size={16} />
    : shortcut.icon === 'sound' ? <IconMusic size={16} />
    : shortcut.icon === 'room' ? <IconHome size={16} />
    : shortcut.id === 'ambience:hearth' ? <IconFlame size={16} />
    : shortcut.id === 'ambience:snow' ? <IconSnowflake size={16} />
    : <IconSparkle size={16} />;
  return (
    <span className="orb-glyph" aria-hidden="true">
      {icon}
    </span>
  );
}

/** Distance of the fanned shortcuts from the point, and the widest fan. */
const FAN_RADIUS = 92;
const FAN_SPREAD = Math.PI * 0.9;

/**
 * Where each shortcut lands when the orb fans out: on an arc around the
 * point, opening towards the middle of the window, so it always has room.
 */
export function fanPositions(count: number, place: { x: number; y: number }): Array<{ x: number; y: number }> {
  const toward = Math.atan2(0.5 - place.y, 0.5 - place.x);
  const step = count > 1 ? Math.min(Math.PI / 4.2, FAN_SPREAD / (count - 1)) : 0;
  return Array.from({ length: count }, (_, i) => {
    const a = toward + (i - (count - 1) / 2) * step;
    return { x: Math.round(Math.cos(a) * FAN_RADIUS), y: Math.round(Math.sin(a) * FAN_RADIUS) };
  });
}

/** Kept inside the window, clear of its edges. */
const clamp = (v: number) => Math.min(0.97, Math.max(0.03, v));
const DRAG_PX = 5;
const KEY_STEP = 0.02;

/**
 * The quick-shortcut orb: a small glowing point that floats on the home
 * screen. A click fans the chosen shortcuts (2–5) out around it on an arc,
 * one after another, like petals opening; a drag moves it anywhere (the
 * place is remembered as a share of the window); the arrow keys move it,
 * Escape folds it. The fan always opens towards the middle of the window.
 */
export function QuickOrb({ state }: { state: AppState }) {
  const services = useServices();
  const orb = state.settings.quickOrb;
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState({ x: orb.x, y: orb.y });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; sx: number; sy: number; moved: boolean } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  // A saved place from elsewhere (settings: "back to its place") wins.
  useEffect(() => setPlace({ x: orb.x, y: orb.y }), [orb.x, orb.y]);

  // A click outside folds it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: globalThis.PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);

  const save = (next: { x: number; y: number }) => {
    const s = services.store.getState().settings.quickOrb;
    services.store.dispatch({ type: 'settings/update', patch: { quickOrb: { ...s, x: next.x, y: next.y } } });
  };

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    // Only the main button (or a touch) moves or opens it.
    if (e.button > 0) return;
    drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < DRAG_PX) return;
    if (!d.moved) {
      d.moved = true;
      setDragging(true);
      setOpen(false);
    }
    setPlace({ x: clamp(e.clientX / window.innerWidth), y: clamp(e.clientY / window.innerHeight) });
  };
  const onPointerUp = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId) return;
    if (d.moved) {
      setDragging(false);
      save({ x: clamp(e.clientX / window.innerWidth), y: clamp(e.clientY / window.innerHeight) });
    } else {
      setOpen((o) => !o);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const move = { ArrowLeft: [-KEY_STEP, 0], ArrowRight: [KEY_STEP, 0], ArrowUp: [0, -KEY_STEP], ArrowDown: [0, KEY_STEP] }[e.key];
    if (move) {
      e.preventDefault();
      const next = { x: clamp(place.x + move[0]!), y: clamp(place.y + move[1]!) };
      setPlace(next);
      save(next);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen((o) => !o);
    }
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(false);
    }
  };

  const run = (q: QuickShortcut) => {
    const s = services.store.getState();
    if (q.id.startsWith('palette:')) {
      const id = q.id.slice('palette:'.length) as Parameters<typeof isProPalette>[0];
      if (isProPalette(id, themesUnlocked(s))) return openPro('palettes');
    }
    services.store.dispatch({ type: 'settings/update', patch: q.patch(s.settings) });
  };

  const items = orb.items.map(quickShortcut).filter((q): q is QuickShortcut => Boolean(q));
  const fan = fanPositions(items.length, place);
  // Labels sit on the outer side of each petal.
  const left = place.x > 0.5;

  return (
    <div
      ref={root}
      className={`quick-orb${open ? ' is-open' : ''}${dragging ? ' is-dragging' : ''}${left ? ' is-left' : ''}`}
      style={{ left: `${place.x * 100}%`, top: `${place.y * 100}%` }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          setOpen(false);
          button.current?.focus();
        }
      }}
    >
      <button
        ref={button}
        type="button"
        className="quick-orb__core"
        aria-expanded={open}
        aria-controls="quick-orb-menu"
        aria-label="Schnellzugriff"
        title="Schnellzugriff (ziehen zum Verschieben)"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drag.current = null;
          setDragging(false);
        }}
        onKeyDown={onKeyDown}
      >
        <span className="quick-orb__dot" aria-hidden="true" />
      </button>
      {/* Folded, the menu stays in place for its motion but is out of reach (inert). */}
      <ul id="quick-orb-menu" className="quick-orb__menu" role="menu" aria-label="Deine Schalter" {...({ inert: open ? undefined : '' } as Record<string, string | undefined>)}>
        {items.map((q, i) => {
          const on = q.isOn(state.settings);
          return (
            <li key={q.id} role="none" className="quick-orb__petal" style={{ '--i': i, '--x': `${fan[i]?.x ?? 0}px`, '--y': `${fan[i]?.y ?? 0}px` } as CSSProperties}>
              <button type="button" role="menuitemcheckbox" aria-checked={on} aria-label={q.label} className={`quick-orb__item${on ? ' is-on' : ''}`} onClick={() => run(q)}>
                <ShortcutGlyph shortcut={q} />
              </button>
              <span className="quick-orb__label" aria-hidden="true">
                {q.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
