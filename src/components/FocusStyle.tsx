import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePresence } from '../lib/presence';
import { createPortal } from 'react-dom';
import type { FocusStyle } from '../domain/types';
import { IconLock } from './icons';

export const FOCUS_STYLES: Array<{ id: FocusStyle; label: string; level: string; text: string }> = [
  { id: 'breathe', label: 'Atmender Fokus', level: 'Sanft', text: 'Nebenkarten werden weich und leise, deine Aufgabe strahlt.' },
  { id: 'tunnel', label: 'Schwebender Tunnel', level: 'Mittel', text: 'Alles andere gleitet hinaus, dein Block schwebt mittig im Glas.' },
  { id: 'cocoon', label: 'Deep-Work-Kokon', level: 'Stark', text: 'Nur Zeit, Aufgabe und ein kleiner Begleiter-Punkt. Sonst nichts.' },
  { id: 'micro', label: 'Mikro-Schritt-Modus', level: 'ADHS / Blockade', text: 'Deine Aufgabe in drei kleinen Häppchen. Immer nur eins sichtbar.' },
  { id: 'pomodoro', label: 'Fokus-Timer', level: 'Rhythmus', text: 'Feste Runden mit echten Pausen, nach vier Runden eine lange. Dein Begleiter hält dir dabei den Rücken frei.' },
];

/** Said when someone below level 10 reaches for the timer. */
export const FOCUS_TIMER_LOCKED = 'Der Fokus-Timer wird mit Level 10 deines Begleiters frei, oder sofort mit Pro. Jeder erledigte Schritt bringt euch näher.';

/** Small lock chip for the timer below level 10. */
export function TimerLock() {
  return (
    <span className="pro-lock">
      <IconLock size={12} />
      Ab Level 10
    </span>
  );
}

export const focusStyleLabel = (id: FocusStyle) => FOCUS_STYLES.find((f) => f.id === id)?.label ?? 'Fokus';

/** Compact switch inside the running focus card. */
export function FocusStyleMenu({
  value,
  onChange,
  timerUnlocked,
  onLocked,
}: {
  value: FocusStyle;
  onChange: (style: FocusStyle) => void;
  /** The focus timer opens at companion level 10 (canUseFeature 'focus_timer'). */
  timerUnlocked: boolean;
  onLocked: () => void;
}) {
  const [open, setOpen] = useState(false);
  const presence = usePresence(open);
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  // The menu lives on <body> (the card clips its rounded corners), placed above the button.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = root.current?.getBoundingClientRect();
      if (r) setPos({ left: Math.max(12, Math.min(r.left, window.innerWidth - 352)), bottom: window.innerHeight - r.top + 10 });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  // Keyboard: focus the chosen style on open, arrows move, focus returns to the button.
  useEffect(() => {
    if (!open || !pos) return;
    const node = menu.current;
    const items = () => [...(node?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])];
    const start = items().find((b) => b.getAttribute('aria-checked') === 'true') ?? items()[0];
    start?.focus({ preventScroll: true });
    const btn = root.current?.querySelector<HTMLButtonElement>('.fstyle__btn');
    const onKey = (e: KeyboardEvent) => {
      const list = items();
      const i = list.indexOf(document.activeElement as HTMLButtonElement);
      const go = (n: number) => {
        e.preventDefault();
        list[(n + list.length) % list.length]?.focus();
      };
      if (e.key === 'ArrowDown') go(i + 1);
      else if (e.key === 'ArrowUp') go(i - 1);
      else if (e.key === 'Home') go(0);
      else if (e.key === 'End') go(list.length - 1);
      else if (e.key === 'Tab') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (node?.contains(document.activeElement) || document.activeElement === document.body) btn?.focus({ preventScroll: true });
    };
  }, [open, pos]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!root.current?.contains(t) && !menu.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="fstyle" ref={root}>
      <button type="button" className="pill pill--glass fstyle__btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {focusStyleLabel(value)}
      </button>
      {presence.mounted &&
        pos &&
        createPortal(
        <div
          ref={menu}
          className={`fstyle__menu${presence.closing ? ' is-closing' : ''}`}
          role="menu"
          aria-label="Fokus-Stil"
          aria-hidden={presence.closing || undefined}
          style={{ left: pos.left, bottom: pos.bottom }}
        >
          {FOCUS_STYLES.map((f) => {
            const locked = f.id === 'pomodoro' && !timerUnlocked;
            return (
              <button
                key={f.id}
                type="button"
                role="menuitemradio"
                aria-checked={value === f.id}
                aria-disabled={locked || undefined}
                tabIndex={-1}
                className={value === f.id ? 'is-on' : locked ? 'is-locked' : undefined}
                onClick={() => {
                  if (locked) onLocked();
                  else onChange(f.id);
                  setOpen(false);
                }}
              >
                <strong>
                  {f.label} {locked && <TimerLock />}
                </strong>
                <span>
                  {f.level}: {f.text}
                </span>
              </button>
            );
          })}
        </div>,
          document.body,
        )}
    </div>
  );
}
