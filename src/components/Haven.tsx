import type { CSSProperties, ReactNode } from 'react';
import type { CompanionObjectId, HavenId } from '../domain/types';

/**
 * The companion's home: a quiet ambience in the black around him. Moonlight
 * (a cool, still glow), fireflies (a few warm lights drifting), quiet stars,
 * morning dew (a fresh mist, drops rising), a hearth (warmth from below,
 * embers rising), a rainy night (fine rain falling), a sakura evening
 * (petals drifting) or plain. Purely decorative; it holds still when
 * effects are off. In his alcove it is small; in the Begleiter tab it fills
 * the whole room ("room").
 */
export const HAVENS: ReadonlyArray<{ id: HavenId; label: string; text: string }> = [
  { id: 'moon', label: 'Mondschein', text: 'Ein kühler, stiller Schein hinter ihm.' },
  { id: 'fireflies', label: 'Glühwürmchen', text: 'Ein paar warme Lichter tanzen leise um ihn.' },
  { id: 'stardust', label: 'Sternenstille', text: 'Stille Sterne über ihm, die leise funkeln.' },
  { id: 'dew', label: 'Morgentau', text: 'Ein frischer Hauch am Boden, Tropfen steigen auf.' },
  { id: 'hearth', label: 'Kaminfeuer', text: 'Wärme von unten, Funken steigen leise auf.' },
  { id: 'rain', label: 'Regennacht', text: 'Feiner Regen draußen, drinnen ist es still.' },
  { id: 'sakura', label: 'Sakura-Abend', text: 'Kirschblüten treiben langsam durch den Abend.' },
  { id: 'none', label: 'Schlicht', text: 'Nur er und das Schwarz.' },
];

type Mote = readonly [x: number, y: number, delay: number, dur: number];
type Moving = Exclude<HavenId, 'none' | 'moon'>;

/** Where each light sits around him (x, y in % of his alcove) and its rhythm (delay, duration in s). */
const MOTES: Record<Moving, ReadonlyArray<Mote>> = {
  fireflies: [
    [14, 38, 0, 7.5],
    [82, 26, 1.8, 8.5],
    [26, 70, 3.1, 6.8],
    [70, 62, 0.9, 9.2],
    [48, 18, 4.2, 7.9],
    [90, 78, 2.6, 8.1],
  ],
  stardust: [
    [18, 14, 0, 4.2],
    [38, 6, 1.1, 5.1],
    [62, 12, 2.3, 4.6],
    [80, 20, 0.6, 5.6],
    [28, 30, 3.0, 4.9],
    [72, 34, 1.7, 5.3],
    [50, 24, 2.8, 4.4],
  ],
  dew: [
    [24, 86, 0, 6.4],
    [44, 90, 1.6, 7.2],
    [62, 88, 3.2, 6.8],
    [78, 84, 2.1, 7.6],
    [36, 92, 4.4, 6.2],
  ],
  hearth: [
    [34, 88, 0, 4.8],
    [48, 92, 1.2, 5.4],
    [60, 90, 2.5, 4.6],
    [42, 94, 3.4, 5.9],
    [56, 86, 0.7, 5.1],
  ],
  rain: [
    [12, 4, 0, 1.6],
    [30, 0, 0.5, 1.9],
    [52, 6, 1.1, 1.7],
    [68, 2, 0.3, 2.0],
    [86, 8, 0.8, 1.8],
    [42, 10, 1.4, 1.6],
  ],
  sakura: [
    [10, 6, 0, 11],
    [34, 0, 3.5, 13],
    [58, 4, 6.8, 12],
    [80, 2, 1.9, 14],
    [22, 10, 8.4, 12.5],
  ],
};

/** The whole room: more lights, spread across it, in the same moods (stable positions). */
const roomMotes = (id: Moving): Mote[] => {
  const count = id === 'rain' ? 22 : id === 'stardust' ? 18 : 12;
  const base = MOTES[id];
  return Array.from({ length: count }, (_, i) => {
    const [, y, delay, dur] = base[i % base.length]!;
    const x = (i * 37 + 9) % 100;
    // Rising moods start low, falling ones high; the rest anywhere.
    const yy = id === 'dew' || id === 'hearth' ? 70 + ((i * 13) % 28) : id === 'rain' || id === 'sakura' ? (i * 11) % 30 : (i * 53 + y) % 92;
    return [x, yy, (delay + i * 0.7) % (dur + 2), dur + (i % 3)] as const;
  });
};

export function Haven({ id, still = false, room = false }: { id: HavenId; still?: boolean; room?: boolean }) {
  if (id === 'none') return null;
  const motes = id === 'moon' ? [] : room ? roomMotes(id) : MOTES[id];
  return (
    <span className={`haven haven--${id}${room ? ' haven--room' : ''}${still ? ' is-still' : ''}`} aria-hidden="true">
      {room && <span className="haven__veil" />}
      {id === 'moon' && <span className="haven__orb" />}
      {motes.map(([x, y, delay, dur], i) => (
        <span key={i} className="haven__mote" style={{ '--x': `${x}%`, '--y': `${y}%`, '--delay': `${delay}s`, '--dur': `${dur}s` } as CSSProperties} />
      ))}
    </span>
  );
}

/**
 * Choosing his home: a row of small swatches (at the companion) or cards
 * with a preview (in the settings).
 */
export function HavenPicker({ value, onChange, name, cards = false }: { value: HavenId; onChange: (id: HavenId) => void; name: string; cards?: boolean }) {
  return (
    <div className={cards ? 'haven-picker haven-picker--cards' : 'haven-picker'} role="radiogroup" aria-label={`Zuhause für ${name}`}>
      {HAVENS.map((h) => (
        <button
          key={h.id}
          type="button"
          role="radio"
          aria-checked={value === h.id}
          aria-label={cards ? undefined : h.label}
          title={cards ? undefined : `${h.label}: ${h.text}`}
          className={`haven-picker__opt haven-picker__opt--${h.id}${cards ? ' option' : ''}${value === h.id ? ' is-on' : ''}`}
          onClick={() => onChange(h.id)}
        >
          <span className="haven-picker__swatch" aria-hidden="true">
            {cards && <Haven id={h.id} />}
          </span>
          {cards && (
            <>
              <strong>{h.label}</strong>
              <span>{h.text}</span>
            </>
          )}
        </button>
      ))}
    </div>
  );
}

/* ---------- his things: quiet line drawings on his horizon ---------- */

export const OBJECTS: ReadonlyArray<{ id: CompanionObjectId; label: string }> = [
  { id: 'tea', label: 'Teetasse' },
  { id: 'plant', label: 'Pflanze' },
  { id: 'book', label: 'Buch' },
  { id: 'candle', label: 'Kerze' },
];

const DRAWINGS: Record<CompanionObjectId, ReactNode> = {
  tea: (
    <>
      <path className="belonging__steam" d="M13 4c-2 2 2 4 0 6M18 3c-2 2 2 4 0 6" />
      <path d="M7 14h17v6a7 7 0 0 1-7 7h-3a7 7 0 0 1-7-7z" />
      <path d="M24 16h2a3 3 0 0 1 0 6h-2" />
      <path d="M5 31h22" />
    </>
  ),
  plant: (
    <>
      <path d="M16 20c0-6-4-10-9-10 0 6 4 10 9 10z" />
      <path d="M16 18c0-6 3-11 9-12 0 7-3 11-9 12z" />
      <path d="M16 20v4" />
      <path d="M10 24h12l-2 7h-8z" />
    </>
  ),
  book: (
    <>
      <path d="M4 27c4-2 8-2 12 0 4-2 8-2 12 0V12c-4-2-8-2-12 0-4-2-8-2-12 0z" />
      <path d="M16 12v15" />
      <path d="M3 31h26" />
    </>
  ),
  candle: (
    <>
      <path className="belonging__flame" d="M16 4c2 3 3 5 0 8-3-3-2-5 0-8z" />
      <path d="M12 14h8v15h-8z" />
      <path d="M16 12v2" />
      <path d="M8 31h16" />
    </>
  ),
};

/** The chosen things, standing on his horizon at his side (left and right in turn). */
export function Belongings({ items, still = false }: { items: readonly CompanionObjectId[]; still?: boolean }) {
  return (
    <>
      {items.map((id, i) => (
        <svg
          key={id}
          className={`belonging belonging--${i % 2 === 0 ? 'right' : 'left'} belonging--${id}${still ? ' is-still' : ''}`}
          data-id={id}
          style={{ '--slot': Math.floor(i / 2) } as CSSProperties}
          viewBox="0 0 32 32"
          width={32}
          height={32}
          aria-hidden="true"
        >
          {DRAWINGS[id]}
        </svg>
      ))}
    </>
  );
}

/** Placing things at his side: quiet toggles. */
export function BelongingsPicker({ value, onChange }: { value: readonly CompanionObjectId[]; onChange: (ids: CompanionObjectId[]) => void }) {
  return (
    <div className="belongings-picker" role="group" aria-label="An seiner Seite">
      {OBJECTS.map((o) => {
        const on = value.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            className={`belongings-picker__opt${on ? ' is-on' : ''}`}
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== o.id) : [...value, o.id])}
          >
            <svg viewBox="0 0 32 32" width={18} height={18} aria-hidden="true">
              {DRAWINGS[o.id]}
            </svg>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
