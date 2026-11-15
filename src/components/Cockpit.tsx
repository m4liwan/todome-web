import type { CSSProperties, ReactNode } from 'react';

/**
 * Where every home module sits. The stage carries the one thing that matters
 * now; the side column what comes next; the day spans the full width; two
 * quiet bands hold the rest, divided only by hairlines.
 */
export const COCKPIT = {
  stage: ['greet', 'focus'],
  side: ['hub', 'plan'],
  day: ['tl'],
  care: ['water', 'weather', 'times', 'week'],
  mind: ['impulse', 'thoughts', 'routines'],
} as const;

/** Entrance stagger: reading order, capped so the last module never waits long. */
const STEP: Record<string, number> = { greet: 0, focus: 1, hub: 1, plan: 2, tl: 3, water: 4, weather: 4, times: 4, week: 4, impulse: 5, thoughts: 5, routines: 5 };

export function Cockpit({ panels }: { panels: Record<string, ReactNode> }) {
  const panel = (id: string) => (
    <div key={id} className={`panel panel--${id} enter`} style={{ '--i': STEP[id] ?? 5 } as CSSProperties}>
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
      <section className="cockpit__band cockpit__care" aria-labelledby="cockpit-care">
        <h2 className="label cockpit__label" id="cockpit-care">
          Für dich
        </h2>
        <div className="band">{COCKPIT.care.map(panel)}</div>
      </section>
      <section className="cockpit__band cockpit__mind" aria-labelledby="cockpit-mind">
        <h2 className="label cockpit__label" id="cockpit-mind">
          Kopf frei
        </h2>
        <div className="band" style={{ '--cols': 3 } as CSSProperties}>
          {COCKPIT.mind.map(panel)}
        </div>
      </section>
    </div>
  );
}
