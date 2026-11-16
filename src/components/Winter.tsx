import type { CSSProperties } from 'react';
import type { AppearanceSettings, Millis } from '../domain/types';

/** Winter magic runs 1–26 December (or always / never, as chosen). */
export function isWinterActive(setting: AppearanceSettings['xmas'], now: Millis): boolean {
  if (setting === 'off') return false;
  if (setting === 'always') return true;
  const d = new Date(now);
  return d.getMonth() === 11 && d.getDate() <= 26;
}

/** Waiting for December: the setting is on, the season has not begun yet. */
export function winterWaiting(setting: AppearanceSettings['xmas'], now: Millis): boolean {
  return setting === 'december' && !isWinterActive(setting, now);
}

const BULBS = 22;

/**
 * The winter atmosphere (besides the falling snow, see Ambience): a fine
 * hairline garland along the top edge with small warm lights that glow
 * one after another, and a cool frost light breathing along the floor of
 * the window. Purely decorative, behind and above nothing that matters.
 */
export function WinterMagic() {
  return (
    <div className="winter" aria-hidden="true">
      <div className="winter__garland">
        <svg className="winter__wire" viewBox="0 0 1000 24" preserveAspectRatio="none">
          <path d="M0 4 Q 45.45 18 90.9 4 T 181.8 4 T 272.7 4 T 363.6 4 T 454.5 4 T 545.4 4 T 636.3 4 T 727.2 4 T 818.1 4 T 909 4 T 1000 4" />
        </svg>
        {Array.from({ length: BULBS }, (_, i) => {
          const x = (i + 0.5) / BULBS;
          // The lights hang where the wire sags.
          const y = 9 + Math.sin(x * Math.PI * 22 - Math.PI / 2) * 5;
          return <span key={i} className="winter__bulb" style={{ left: `${x * 100}%`, top: `${y}px`, '--d': `${(i % 6) * 0.7}s` } as CSSProperties} />;
        })}
      </div>
      <span className="winter__frost" />
    </div>
  );
}
