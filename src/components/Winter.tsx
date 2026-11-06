import type { AppearanceSettings, Millis } from '../domain/types';

/** Winter magic runs 1–26 December (or always / never, as chosen). */
export function isWinterActive(setting: AppearanceSettings['xmas'], now: Millis): boolean {
  if (setting === 'off') return false;
  if (setting === 'always') return true;
  const d = new Date(now);
  return d.getMonth() === 11 && d.getDate() <= 26;
}

const BULBS = 28;
const COLORS = ['#ffcf7a', '#ff8a8a', '#9fe3b0', '#a9c8ff', '#ffe2a8'];

/** A thin garland of warm lights along the top edge. Purely decorative. */
export function Garland() {
  return (
    <div className="garland" aria-hidden="true">
      <svg className="garland__wire" viewBox="0 0 1000 30" preserveAspectRatio="none">
        <path d="M0 6 Q 35.7 22 71.4 6 T 142.8 6 T 214.2 6 T 285.6 6 T 357 6 T 428.4 6 T 499.8 6 T 571.2 6 T 642.6 6 T 714 6 T 785.4 6 T 856.8 6 T 928.2 6 T 1000 6" />
      </svg>
      {Array.from({ length: BULBS }, (_, i) => {
        const x = (i + 0.5) / BULBS;
        // Bulbs hang on the low points of the wire.
        const y = 12 + Math.sin(x * Math.PI * 14 - Math.PI / 2) * 6;
        return (
          <span
            key={i}
            className="garland__bulb"
            style={{ left: `${x * 100}%`, top: `${y}px`, '--c': COLORS[i % COLORS.length], '--d': `${(i % 7) * 0.6}s` } as React.CSSProperties}
          />
        );
      })}
    </div>
  );
}
