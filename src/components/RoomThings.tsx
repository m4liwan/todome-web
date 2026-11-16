import type { CSSProperties, ReactNode } from 'react';
import { ROOM_THINGS } from '../domain/roomObjects';
import type { CompanionObjectId } from '../domain/types';

/** Quiet hairline drawings of his things (viewBox 0 0 64 64, standing on the floor line). */
const DRAWINGS: Record<CompanionObjectId, ReactNode> = {
  tea: (
    <>
      <path className="room-thing__steam" d="M30 10c-3 3 3 6 0 9M36 8c-3 3 3 6 0 9" />
      <path d="M22 30h20v8a10 10 0 0 1-10 10 10 10 0 0 1-10-10z" />
      <path d="M42 33h3a4 4 0 0 1 0 8h-4M22 33l-6-4M28 26h8" />
      <path d="M10 52h44M16 52v10M48 52v10" />
    </>
  ),
  book: (
    <>
      <path d="M14 46c6-3 12-3 18 0 6-3 12-3 18 0V30c-6-3-12-3-18 0-6-3-12-3-18 0z" />
      <path d="M32 30v16" />
      <path d="M12 52h40M14 56h36M16 60h32" />
    </>
  ),
  plant: (
    <>
      <path d="M32 40c0-10-6-17-15-17 0 10 6 17 15 17z" />
      <path d="M32 36c0-11 5-19 15-20 0 12-5 19-15 20z" />
      <path d="M32 40c-2-9 0-18 6-24" />
      <path d="M22 44h20l-3 18H25z" />
    </>
  ),
  hearth: (
    <>
      <path d="M6 62V22h52v40M2 22h60M14 62V34h36v28" />
      <path className="room-thing__fire" d="M32 62c-7 0-9-6-6-11 1 3 3 4 4 3-1-5 2-9 5-11 0 4 5 6 5 12 0 4-3 7-8 7z" />
    </>
  ),
  instrument: (
    <>
      <path d="M38 8l4 4-11 17" />
      <path d="M31 29c-5-2-11 0-13 5-2 4 0 8-3 12-3 5 1 12 8 13 6 1 10-2 12-7 2-4 6-5 7-9 2-6-4-12-11-14z" />
      <circle cx="27" cy="44" r="3.5" />
      <path className="room-thing__note" d="M50 18v8a2 2 0 1 1-2-2M56 12v8a2 2 0 1 1-2-2" />
    </>
  ),
  candle: (
    <>
      <path className="room-thing__flame" d="M32 18c3 4 4 7 0 11-4-4-3-7 0-11z" />
      <path d="M27 32h10v24H27zM32 29v3M20 56h24" />
    </>
  ),
};

/**
 * His things, placed in his room: hairline drawings he walks to and uses.
 * Each is a button: a click sends him there. The one he uses lights up.
 */
export function RoomThings({ items, active, name, onUse }: { items: readonly CompanionObjectId[]; active: CompanionObjectId | null; name: string; onUse: (id: CompanionObjectId) => void }) {
  return (
    <>
      {ROOM_THINGS.filter((t) => items.includes(t.id)).map((t) => (
        <button
          key={t.id}
          type="button"
          className={`room-thing room-thing--${t.id}${active === t.id ? ' is-used' : ''}`}
          style={{ '--x': `${t.x}%` } as CSSProperties}
          aria-label={`${t.label}: ${name} hingehen lassen`}
          title={t.label}
          onClick={() => onUse(t.id)}
        >
          <svg viewBox="0 0 64 64" aria-hidden="true">
            {DRAWINGS[t.id]}
          </svg>
        </button>
      ))}
    </>
  );
}

/** Choosing his furniture: quiet toggles with their drawing. */
export function RoomThingsPicker({ value, onChange }: { value: readonly CompanionObjectId[]; onChange: (ids: CompanionObjectId[]) => void }) {
  return (
    <div className="room-picker-things" role="group" aria-label="Einrichtung">
      {ROOM_THINGS.map((t) => {
        const on = value.includes(t.id);
        return (
          <button
            key={t.id}
            type="button"
            className={`room-picker-things__opt${on ? ' is-on' : ''}`}
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== t.id) : [...value, t.id])}
          >
            <svg viewBox="0 0 64 64" width={20} height={20} aria-hidden="true">
              {DRAWINGS[t.id]}
            </svg>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
