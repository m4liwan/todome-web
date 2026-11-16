import type { CSSProperties } from 'react';
import type { HavenId } from '../domain/types';

/**
 * The companion's home: a quiet ambience in the black around him. Moonlight
 * (a cool, still glow), fireflies (a few warm lights drifting), stardust
 * (fine sparks that come and go), morning dew (a fresh mist, drops rising)
 * or plain. Purely decorative; it holds still when effects are off.
 */
export const HAVENS: ReadonlyArray<{ id: HavenId; label: string; text: string }> = [
  { id: 'moon', label: 'Mondschein', text: 'Ein kühler, stiller Schein hinter ihm.' },
  { id: 'fireflies', label: 'Glühwürmchen', text: 'Ein paar warme Lichter tanzen leise um ihn.' },
  { id: 'stardust', label: 'Sternenstaub', text: 'Feine Funken über ihm, die kommen und gehen.' },
  { id: 'dew', label: 'Morgentau', text: 'Ein frischer Hauch am Boden, Tropfen steigen auf.' },
  { id: 'none', label: 'Schlicht', text: 'Nur er und das Schwarz.' },
];

/** Where each light sits (x, y in % of the home) and its rhythm (delay, duration in s). */
const MOTES: Record<Exclude<HavenId, 'none' | 'moon'>, ReadonlyArray<[number, number, number, number]>> = {
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
};

export function Haven({ id, still = false }: { id: HavenId; still?: boolean }) {
  if (id === 'none') return null;
  return (
    <span className={`haven haven--${id}${still ? ' is-still' : ''}`} aria-hidden="true">
      {id === 'moon' ? (
        <span className="haven__orb" />
      ) : (
        MOTES[id].map(([x, y, delay, dur], i) => (
          <span key={i} className="haven__mote" style={{ '--x': `${x}%`, '--y': `${y}%`, '--delay': `${delay}s`, '--dur': `${dur}s` } as CSSProperties} />
        ))
      )}
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
