import { useMemo } from 'react';
import { hasPro, openPro } from '../app/pro';
import { calmStats } from '../domain/calm';
import type { SessionProjection } from '../domain/session';
import type { AppState, Millis } from '../domain/types';
import { formatDuration } from '../lib/time';
import { IconLock } from './icons';

/**
 * Anti-Hustle statistics (Pro): what you protected this week instead of how
 * many tasks you ticked off. Free users see a soft, frosted preview.
 */
export function CalmStats({ state, projections, now }: { state: AppState; projections: SessionProjection[]; now: Millis }) {
  const s = useMemo(() => calmStats(state, projections, now), [state, projections, now]);
  const pro = hasPro();
  const tiles = [
    { label: 'Geschützte Fokuszeit', value: formatDuration(s.protectedMs), note: 'in Blöcken, in die nichts hineingeplatzt ist' },
    { label: 'Längster ruhiger Block', value: formatDuration(s.longestMs), note: 'am Stück, ohne Unterbrechung' },
    { label: 'Gedanken geparkt', value: String(s.parked), note: 'aus dem Kopf, nicht verloren' },
    { label: 'Bewusst durchgeatmet', value: String(s.breaths), note: s.feelings ? `${s.smooth} von ${s.feelings} Blöcken fühlten sich flüssig an` : 'jedes Mal zählt' },
  ];
  return (
    <section className="card calm-stats rise" aria-label="Anti-Hustle-Statistiken">
      <header className="card__head">
        <div>
          <h2>Was du diese Woche geschützt hast</h2>
          <p className="muted">Keine Aufgaben-Zählerei. Du bist kein Output.</p>
        </div>
        {!pro && (
          <span className="pro-lock">
            <IconLock size={12} />
            Pro
          </span>
        )}
      </header>
      <ul className={`calm-stats__grid${pro ? '' : ' pro-veil'}`} aria-hidden={pro ? undefined : true}>
        {tiles.map((t) => (
          <li key={t.label}>
            <span className="calm-stats__label">{t.label}</span>
            <strong className="calm-stats__value">{t.value}</strong>
            <span className="calm-stats__note">{t.note}</span>
          </li>
        ))}
      </ul>
      {!pro && (
        <div className="pro-veil__note">
          <span className="pro-lock">
            <IconLock size={12} />
            Pro
          </span>
          <p>Geschützte Fokuszeit, ruhige Blöcke, geparkte Gedanken und Atempausen auf einen Blick.</p>
          <button type="button" className="pill pill--sm" onClick={() => openPro('stats')}>
            Vorschau ansehen
          </button>
        </div>
      )}
    </section>
  );
}
