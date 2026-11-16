import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { IconChevronRight } from './icons';

/**
 * Where every home module sits. The greeting spans the head of the room; the
 * stage carries the one thing that matters now, the side column what keeps
 * you going (companion, water, what comes next); the day and the Tages-Anker
 * span the full width. Below, the areas: one quiet section at a time behind
 * a round switch, so the rest never competes with the next step.
 */
export const COCKPIT = {
  head: ['greet'],
  stage: ['focus'],
  side: ['hub', 'water', 'plan'],
  day: ['tl'],
  anchors: ['anchors'],
} as const;

export type AreaId = 'mind' | 'rhythm' | 'outside';

export const AREAS: ReadonlyArray<{ id: AreaId; label: string; panels: readonly string[] }> = [
  { id: 'mind', label: 'Kopf frei', panels: ['impulse', 'thoughts', 'routines'] },
  { id: 'rhythm', label: 'Dein Rhythmus', panels: ['times', 'week'] },
  { id: 'outside', label: 'Draußen', panels: ['weather'] },
];

/** Entrance stagger: reading order, capped so the last module never waits long. */
const STEP: Record<string, number> = { greet: 0, focus: 1, hub: 1, water: 2, plan: 2, tl: 3, anchors: 4 };

const AREA_KEY = 'todome:area';
const AREA_EVENT = 'todome:area';

/** Points the home to an area (used by the companion tour). */
export function showArea(id: AreaId): void {
  window.dispatchEvent(new CustomEvent<AreaId>(AREA_EVENT, { detail: id }));
}

function storedArea(): AreaId {
  try {
    const saved = window.localStorage.getItem(AREA_KEY);
    return AREAS.find((a) => a.id === saved)?.id ?? 'mind';
  } catch {
    return 'mind';
  }
}

// React 18 has no `inert` prop yet: the empty string sets it, undefined drops it.
const inert = (on: boolean) => ({ inert: on ? '' : undefined }) as Record<string, string | undefined>;

/**
 * The areas: a round pill that names the current one. A click unfolds it into
 * all areas (they grow out of the pill one after another); choosing folds it
 * back and the pane slides in from the side it comes from. Arrow keys move,
 * Escape folds. The last choice is remembered on this device.
 */
function Areas({ panels }: { panels: Record<string, ReactNode> }) {
  const [active, setActive] = useState<AreaId>(storedArea);
  const [open, setOpen] = useState(false);
  const at = AREAS.findIndex((a) => a.id === active);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const choose = (id: AreaId) => {
    setActive(id);
    try {
      window.localStorage.setItem(AREA_KEY, id);
    } catch {
      /* a per-device convenience only */
    }
  };

  useEffect(() => {
    const onArea = (e: Event) => {
      const id = (e as CustomEvent<AreaId>).detail;
      if (AREAS.some((a) => a.id === id)) setActive(id);
    };
    window.addEventListener(AREA_EVENT, onArea);
    return () => window.removeEventListener(AREA_EVENT, onArea);
  }, []);

  // Open: the keyboard lands on the current area; a click elsewhere folds the pill.
  useEffect(() => {
    if (!open) return;
    document.getElementById(`area-tab-${active}`)?.focus({ preventScroll: true });
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
    // Focus moves only when the pill opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const fold = () => {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  };

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      fold();
      return;
    }
    const go = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: AREAS.length - 1 }[e.key];
    if (go === undefined) return;
    e.preventDefault();
    const next = AREAS[(go + AREAS.length) % AREAS.length]!;
    choose(next.id);
    document.getElementById(`area-tab-${next.id}`)?.focus();
  };

  return (
    <section className="cockpit__areas areas" aria-label="Mehr für dich">
      <div className="areas__head">
        <h2 className="cockpit__title">Mehr für dich</h2>
        <div className={`orbit${open ? ' is-open' : ''}`} ref={root}>
          <button
            type="button"
            className="orbit__current"
            ref={trigger}
            aria-expanded={open}
            aria-controls="area-options"
            aria-label={`Bereich: ${AREAS[at]?.label}. Andere Bereiche zeigen`}
            onClick={() => setOpen((o) => !o)}
          >
            <span className="orbit__name" key={active}>
              {AREAS[at]?.label}
            </span>
            <span className="orbit__knob" aria-hidden="true">
              <IconChevronRight size={14} />
            </span>
          </button>
          <div className="orbit__options" id="area-options" role="tablist" aria-label="Bereiche" {...inert(!open)}>
            {AREAS.map((a, i) => (
              <button
                key={a.id}
                type="button"
                role="tab"
                id={`area-tab-${a.id}`}
                aria-selected={a.id === active}
                aria-controls={`area-${a.id}`}
                tabIndex={a.id === active ? 0 : -1}
                className="orbit__option"
                style={{ '--i': i } as CSSProperties}
                onClick={() => {
                  choose(a.id);
                  fold();
                }}
                onKeyDown={onKey}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="areas__stack">
        {AREAS.map((a, i) => (
          <div
            key={a.id}
            role="tabpanel"
            id={`area-${a.id}`}
            aria-labelledby={`area-tab-${a.id}`}
            className={`areas__pane band${i === at ? ' is-on' : i < at ? ' is-before' : ' is-after'}`}
            style={{ '--cols': a.panels.length } as CSSProperties}
            {...inert(i !== at)}
          >
            {a.panels.map((id) => (
              <div key={id} className={`panel panel--${id}`}>
                {panels[id]}
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

export function Cockpit({ panels, meta = {} }: { panels: Record<string, ReactNode>; meta?: { anchors?: string } }) {
  const panel = (id: string) => (
    <div key={id} className={`panel panel--${id} enter`} style={{ '--i': STEP[id] ?? 4 } as CSSProperties}>
      {panels[id]}
    </div>
  );

  return (
    <div className="cockpit">
      <header className="cockpit__head">{COCKPIT.head.map(panel)}</header>
      <section className="cockpit__stage" aria-label="Jetzt">
        {COCKPIT.stage.map(panel)}
      </section>
      <aside className="cockpit__side" aria-label="Begleiter, Wasser und Danach">
        {COCKPIT.side.map(panel)}
      </aside>
      <section className="cockpit__day" aria-label="Dein Tag">
        {COCKPIT.day.map(panel)}
      </section>
      <section className="cockpit__anchors" aria-labelledby="cockpit-anchors">
        <h2 className="cockpit__title" id="cockpit-anchors">
          Tages-Anker
          {meta.anchors && (
            <span className="cockpit__meta" aria-hidden="true">
              {meta.anchors}
            </span>
          )}
        </h2>
        {COCKPIT.anchors.map(panel)}
      </section>
      <div className="cockpit__more enter" style={{ '--i': 5 } as CSSProperties}>
        <Areas panels={panels} />
      </div>
    </div>
  );
}
