import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import type { LayoutId } from '../domain/types';
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
const STEP: Record<string, number> = { greet: 0, focus: 1, hub: 1, water: 2, plan: 2, times: 2, tl: 3, anchors: 4 };

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
function Areas({ panels, areas = AREAS }: { panels: Record<string, ReactNode>; areas?: typeof AREAS }) {
  const [active, setActive] = useState<AreaId>(storedArea);
  const [open, setOpen] = useState(false);
  const at = areas.findIndex((a) => a.id === active);
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
      // The ids are the same in every room (only Hub moves a panel out).
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
    const go = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: areas.length - 1 }[e.key];
    if (go === undefined) return;
    e.preventDefault();
    const next = areas[(go + areas.length) % areas.length]!;
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
            aria-label={`Bereich: ${areas[at]?.label}. Andere Bereiche zeigen`}
            onClick={() => setOpen((o) => !o)}
          >
            <span className="orbit__name" key={active}>
              {areas[at]?.label}
            </span>
            <span className="orbit__knob" aria-hidden="true">
              <IconChevronRight size={14} />
            </span>
          </button>
          <div className="orbit__options" id="area-options" role="tablist" aria-label="Bereiche" {...inert(!open)}>
            {areas.map((a, i) => (
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
        {areas.map((a, i) => (
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

/** The rooms of "Heute": the same modules, four arrangements, four feelings. All free. */
export const ROOMS: ReadonlyArray<{ id: LayoutId; label: string; mood: string; text: string }> = [
  { id: 'classic', label: 'Classic', mood: 'Monolith', text: 'Klar und geerdet. Die Hauptkarte thront, der Begleiter wacht ruhig am Rand.' },
  { id: 'sanctuary', label: 'Sanctuary', mood: 'Zen', text: 'Nur der eine Schritt. Alles andere wartet, bis du es rufst.' },
  { id: 'hub', label: 'Hub', mood: 'Command', text: 'Der ganze Tag im Blick, der Begleiter im Kommandoraum.' },
  { id: 'flow', label: 'Flow', mood: 'Stream', text: 'Eine Bahn nach vorn: Schritt, Danach, Begleiter.' },
];

/** A tiny floor plan of each room (for the settings). */
export function RoomGlyph({ id }: { id: LayoutId }) {
  const r = (x: number, y: number, w: number, h: number, strong = false) => <rect x={x} y={y} width={w} height={h} rx={0.8} opacity={strong ? 1 : 0.45} />;
  return (
    <svg className="room-glyph" viewBox="0 0 20 14" width={20} height={14} aria-hidden="true" fill="currentColor">
      {id === 'classic' && (
        <>
          {r(0, 0, 13, 9, true)}
          {r(14.5, 0, 5.5, 9)}
          {r(0, 10.5, 20, 3.5)}
        </>
      )}
      {id === 'sanctuary' && (
        <>
          {r(5, 2, 10, 7, true)}
          {r(7.5, 10.5, 5, 1.5)}
        </>
      )}
      {id === 'hub' && (
        <>
          {r(0, 0, 20, 2.5)}
          {r(0, 4, 11, 10, true)}
          {r(12.5, 4, 7.5, 4.5)}
          {r(12.5, 9.5, 7.5, 4.5)}
        </>
      )}
      {id === 'flow' && (
        <>
          {r(0, 0, 20, 2.5)}
          {r(0, 4, 10, 10, true)}
          {r(11.5, 4, 4.5, 10)}
          {r(17.5, 4, 2.5, 10)}
        </>
      )}
    </svg>
  );
}

/**
 * Sanctuary keeps everything but the main card and the companion behind one
 * quiet line. It unfolds on demand (and for the companion tour).
 */
function Hush({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const unfold = () => setOpen(true);
    window.addEventListener(AREA_EVENT, unfold);
    return () => window.removeEventListener(AREA_EVENT, unfold);
  }, []);
  return (
    <section className="cockpit__hush hush" aria-label="Wenn du magst">
      <button type="button" className="hush__toggle" aria-expanded={open} aria-controls="cockpit-hush" onClick={() => setOpen((o) => !o)}>
        <span className="hush__name">Wenn du magst</span>
        <span className="hush__hint">Wasser, Danach, dein Tag, Tages-Anker und mehr</span>
        <span className="hush__knob" aria-hidden="true">
          <IconChevronRight size={14} />
        </span>
      </button>
      <div id="cockpit-hush" className={`hush__body${open ? ' is-open' : ''}`} {...inert(!open)}>
        <div className="hush__inner">{children}</div>
      </div>
    </section>
  );
}

/** Hub moves the times of today into its command room. */
const areasFor = (layout: LayoutId) => (layout === 'hub' ? AREAS.map((a) => ({ ...a, panels: a.panels.filter((p) => p !== 'times') })) : AREAS);

interface CockpitProps {
  panels: Record<string, ReactNode>;
  meta?: { anchors?: string };
  /** The room (Classic by default; chosen in the settings). */
  layout?: LayoutId;
}

export function Cockpit({ panels, meta = {}, layout = 'classic' }: CockpitProps) {
  const panel = (id: string) => (
    <div key={id} className={`panel panel--${id} enter`} style={{ '--i': STEP[id] ?? 4 } as CSSProperties}>
      {panels[id]}
    </div>
  );
  const region = (cls: string, label: string, ids: readonly string[], Tag: 'section' | 'aside' = 'section') => (
    <Tag key={cls} className={cls} aria-label={label}>
      {ids.map(panel)}
    </Tag>
  );

  const head = (
    <header key="head" className="cockpit__head">
      {COCKPIT.head.map(panel)}
    </header>
  );
  const day = region('cockpit__day', 'Dein Tag', COCKPIT.day);
  const anchors = (
    <section key="anchors" className="cockpit__anchors" aria-labelledby="cockpit-anchors">
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
  );
  const more = (
    <div key="more" className="cockpit__more enter" style={{ '--i': 5 } as CSSProperties}>
      <Areas panels={panels} areas={areasFor(layout)} />
    </div>
  );

  // The first screen: what belongs above the fold fills exactly the window
  // height (desktop), so nothing after it is ever cut in half by the edge.
  const fold = (children: ReactNode[]) => (
    <div key="fold" className="cockpit__fold">
      {children}
    </div>
  );

  const rooms: Record<LayoutId, ReactNode[]> = {
    // Monolith: the main card thrones, the companion keeps watch at the right edge, the day closes the room.
    classic: [fold([head, region('cockpit__stage', 'Jetzt', COCKPIT.stage), region('cockpit__side', 'Begleiter, Wasser und Danach', COCKPIT.side, 'aside')]), day, anchors, more],
    // Zen: the main card alone in the middle, the companion whispers right below it; the rest waits.
    sanctuary: [
      fold([head, region('cockpit__stage', 'Jetzt', ['focus', 'hub'])]),
      <Hush key="hush">{[region('cockpit__side', 'Wasser und Danach', ['water', 'plan'], 'aside'), day, anchors, more]}</Hush>,
    ],
    // Command: the day, the main card and the command room (companion, water, the times of today)
    // in one view; what comes next and the Tages-Anker below.
    hub: [
      fold([head, day, region('cockpit__stage', 'Jetzt', COCKPIT.stage), region('cockpit__side cockpit__command', 'Kommandoraum: Begleiter, Wasser und Zeiten', ['hub', 'water', 'times'], 'aside')]),
      region('cockpit__next cockpit__side', 'Danach', ['plan'], 'aside'),
      anchors,
      more,
    ],
    // Stream: one lane forward that fills the first screen: the step, what comes next (and water),
    // the companion floating alongside; the day runs beneath the lane.
    flow: [
      fold([
        head,
        region('cockpit__stage', 'Jetzt', COCKPIT.stage),
        region('cockpit__next cockpit__side', 'Danach und Wasser', ['plan', 'water'], 'aside'),
        region('cockpit__stream cockpit__side', 'Dein Begleiter', ['hub'], 'aside'),
      ]),
      day,
      anchors,
      more,
    ],
  };

  // The key rebuilds the room on every switch: the modules enter anew.
  return (
    <div key={layout} className={`cockpit cockpit--${layout}`}>
      {rooms[layout]}
    </div>
  );
}
