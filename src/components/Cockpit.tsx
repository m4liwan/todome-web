import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';

/**
 * Where every home module sits. The stage carries the one thing that matters
 * now; the side column what comes next; the day spans the full width. Below,
 * the areas: one quiet section at a time, reached through a small tab row,
 * so the rest of the day never competes with the next step.
 */
export const COCKPIT = {
  stage: ['greet', 'focus'],
  side: ['hub', 'plan'],
  day: ['tl'],
} as const;

export type AreaId = 'anchors' | 'care' | 'mind' | 'rhythm';

export const AREAS: ReadonlyArray<{ id: AreaId; label: string; panels: readonly string[] }> = [
  { id: 'anchors', label: 'Tages-Anker', panels: ['anchors'] },
  { id: 'care', label: 'Für dich', panels: ['water', 'weather'] },
  { id: 'mind', label: 'Kopf frei', panels: ['impulse', 'thoughts', 'routines'] },
  { id: 'rhythm', label: 'Dein Rhythmus', panels: ['times', 'week'] },
];

/** Entrance stagger: reading order, capped so the last module never waits long. */
const STEP: Record<string, number> = { greet: 0, focus: 1, hub: 1, plan: 2, tl: 3 };

const AREA_KEY = 'todome:area';
const AREA_EVENT = 'todome:area';

/** Points the home to an area (used by the companion tour). */
export function showArea(id: AreaId): void {
  window.dispatchEvent(new CustomEvent<AreaId>(AREA_EVENT, { detail: id }));
}

function storedArea(): AreaId {
  try {
    const saved = window.localStorage.getItem(AREA_KEY);
    return AREAS.find((a) => a.id === saved)?.id ?? 'anchors';
  } catch {
    return 'anchors';
  }
}

/**
 * The areas: a tab row with a gliding underline, and the panes in one stack.
 * The active pane slides in from the side it comes from; the stack keeps the
 * height of the tallest pane, so nothing below jumps when you switch. The
 * last choice is remembered on this device.
 */
function Areas({ panels, meta }: { panels: Record<string, ReactNode>; meta: Partial<Record<AreaId, string>> }) {
  const [active, setActive] = useState<AreaId>(storedArea);
  const at = AREAS.findIndex((a) => a.id === active);
  const nav = useRef<HTMLDivElement>(null);
  const [ink, setInk] = useState<{ x: number; w: number } | null>(null);

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

  // The underline follows the chosen tab (and the tab row's width).
  useLayoutEffect(() => {
    const place = () => {
      const tab = nav.current?.querySelector<HTMLElement>(`#area-tab-${active}`);
      if (tab) setInk({ x: tab.offsetLeft, w: tab.offsetWidth });
    };
    place();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    if (nav.current) ro?.observe(nav.current);
    return () => ro?.disconnect();
  }, [active]);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const go = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: AREAS.length - 1 }[e.key];
    if (go === undefined) return;
    e.preventDefault();
    const next = AREAS[(go + AREAS.length) % AREAS.length]!;
    choose(next.id);
    document.getElementById(`area-tab-${next.id}`)?.focus();
  };

  return (
    <section className="cockpit__areas areas" aria-label="Bereiche">
      <div className="areas__nav" role="tablist" aria-label="Bereiche" ref={nav}>
        {AREAS.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            id={`area-tab-${a.id}`}
            aria-selected={a.id === active}
            aria-controls={`area-${a.id}`}
            tabIndex={a.id === active ? 0 : -1}
            className="areas__tab"
            onClick={() => choose(a.id)}
            onKeyDown={onKey}
          >
            <span className="areas__name">{a.label}</span>
            {meta[a.id] && (
              <span className="areas__meta" aria-hidden="true">
                {meta[a.id]}
              </span>
            )}
          </button>
        ))}
        {ink && <span className="areas__ink" aria-hidden="true" style={{ '--x': `${ink.x}px`, '--w': ink.w } as CSSProperties} />}
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
            // React 18 has no `inert` prop yet: the empty string sets it, undefined drops it.
            {...{ inert: i === at ? undefined : '' }}
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

export function Cockpit({ panels, meta = {} }: { panels: Record<string, ReactNode>; meta?: Partial<Record<AreaId, string>> }) {
  const panel = (id: string) => (
    <div key={id} className={`panel panel--${id} enter`} style={{ '--i': STEP[id] ?? 4 } as CSSProperties}>
      {panels[id]}
    </div>
  );

  return (
    <div className="cockpit">
      <section className="cockpit__stage" aria-label="Jetzt">
        {COCKPIT.stage.map(panel)}
      </section>
      <aside className="cockpit__side" aria-label="Begleiter und Danach">
        {COCKPIT.side.map(panel)}
      </aside>
      <section className="cockpit__day" aria-label="Dein Tag">
        {COCKPIT.day.map(panel)}
      </section>
      <div className="cockpit__more enter" style={{ '--i': 4 } as CSSProperties}>
        <Areas panels={panels} meta={meta} />
      </div>
    </div>
  );
}
