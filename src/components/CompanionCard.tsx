import { useId } from 'react';
import { companionHello } from '../app/companion';
import { useServices } from '../app/services';
import type { OpenModal } from '../app/modal';
import { avatarName, planCompanionVisit, waterToday } from '../domain/companion';
import type { SessionProjection } from '../domain/session';
import type { AppState, Millis } from '../domain/types';
import { dayKey, formatTime } from '../lib/time';
import { Avatar } from './Avatar';
import { IconMinus, IconPlus } from './icons';

interface Props {
  state: AppState;
  projections: SessionProjection[];
  now: Millis;
  onOpen: OpenModal;
}

const GLASS_L = 0.25;

const liters = (glasses: number) => (glasses * GLASS_L).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 2 });

/** Words that point at how good the evening will feel, not at a quota. */
function waterLine(water: number, goal: number, hour: number): { title: string; text: string } {
  const goalL = liters(goal);
  const ratio = goal > 0 ? water / goal : 0;
  if (ratio >= 1) return { title: 'Tank ist voll', text: 'Dein Körper hat heute richtig gut mit dir zusammengearbeitet. Das merkst du heute Abend.' };
  if (ratio >= 0.6) return { title: 'Fast geschafft', text: `Stell dir vor, wie gut du dich heute Abend mit ${goalL} Litern im Tank fühlst. Klar im Kopf, kein Nachmittagstief.` };
  if (ratio > 0) return { title: 'Guter Anfang', text: 'Jedes Glas ist ein kleines Geschenk an dein Abend-Ich. Konzentration fühlt sich mit Wasser leichter an.' };
  if (hour < 11) return { title: 'Frisch in den Tag', text: 'Ein Glas Wasser jetzt, und dein Kopf wird in einer Stunde dankbar sein.' };
  return { title: 'Kleine Pause, großes Gefühl', text: 'Ein Glas Wasser ist die einfachste Art, dir heute etwas Gutes zu tun.' };
}

/** Water, made inviting: a glass that fills up, liters instead of counts. */
export function CompanionCard({ state, projections, now, onOpen }: Props) {
  const services = useServices();
  const uid = useId().replace(/:/g, '');
  const c = state.settings.companion;
  const water = waterToday(state, now);
  const visit = c.enabled ? planCompanionVisit(state, projections, now) : null;
  const name = avatarName(c.avatar);
  const drink = (delta: 1 | -1) => services.store.dispatch({ type: 'wellbeing/water', at: now, day: dayKey(now), delta });
  const fill = Math.min(1, c.waterGoal > 0 ? water / c.waterGoal : 0);
  const line = waterLine(water, c.waterGoal, new Date(now).getHours());
  // Level in the glass: y from 112 (empty) to 24 (full).
  const level = 112 - fill * 88;

  return (
    <section className="card hydro rise" style={{ '--i': 5 } as React.CSSProperties} aria-label="Wasser">
      <div className="hydro__main">
        <svg className="hydro__glass" viewBox="0 0 100 124" width="96" height="120" aria-hidden="true">
          <defs>
            <clipPath id={`glass-${uid}`}>
              <path d="M18 12h64l-7 98a8 8 0 01-8 7H33a8 8 0 01-8-7z" />
            </clipPath>
            <linearGradient id={`water-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#8fd3ff" />
              <stop offset="1" stopColor="#3f7dff" />
            </linearGradient>
          </defs>
          <g clipPath={`url(#glass-${uid})`}>
            <rect x="0" y="0" width="100" height="124" fill="var(--glass-fill)" />
            <g className="hydro__water" style={{ transform: `translateY(${level}px)` }}>
              <path className="hydro__wave hydro__wave--back" d="M-100 6 q25 -8 50 0 t50 0 t50 0 t50 0 t50 0 V140 H-100z" fill="#8fd3ff" opacity="0.55" />
              <path className="hydro__wave" d="M-100 8 q25 -7 50 0 t50 0 t50 0 t50 0 t50 0 V140 H-100z" fill={`url(#water-${uid})`} />
            </g>
            <g className="hydro__bubbles" fill="#fff" opacity={fill > 0.05 ? 0.6 : 0}>
              <circle cx="40" cy="104" r="2" />
              <circle cx="58" cy="108" r="1.5" />
              <circle cx="50" cy="100" r="1.2" />
            </g>
          </g>
          <path d="M18 12h64l-7 98a8 8 0 01-8 7H33a8 8 0 01-8-7z" fill="none" stroke="var(--glass-stroke)" strokeWidth="2.5" />
          <path d="M28 22l4 74" stroke="#fff" strokeOpacity="0.55" strokeWidth="3" strokeLinecap="round" />
        </svg>

        <div className="hydro__text">
          <p className="hydro__amount">
            {liters(water)}
            <small> von {liters(c.waterGoal)} l</small>
          </p>
          <h2 className="hydro__title">{line.title}</h2>
          <p className="hydro__line">{line.text}</p>
        </div>
      </div>

      <div className="hydro__actions">
        <button type="button" className="round-btn round-btn--sm" aria-label="Ein Glas weniger" onClick={() => drink(-1)} disabled={water === 0}>
          <IconMinus size={14} />
        </button>
        <button type="button" className="pill pill--sm pill--water" onClick={() => drink(1)}>
          <IconPlus size={14} /> Ein Glas, 250 ml
        </button>
      </div>

      <footer className="hydro__buddy">
        <button type="button" className="hydro__avatar" onClick={() => companionHello(services)} title={`${name} winken lassen`} aria-label={`${name} vorbeischauen lassen`}>
          <Avatar id={c.avatar} mood={fill >= 1 ? 'happy' : 'curious'} size={32} animated={false} crop />
        </button>
        <p className="muted small">
          {!c.enabled
            ? `${name} macht gerade Pause`
            : state.settings.doNotDisturb
              ? `${name} bleibt still, solange „Nicht stören“ an ist`
              : visit
                ? `${name} schaut um ${formatTime(Math.max(visit.dueAt, now))} vorbei${visit.kind === 'hydration' ? ' und erinnert ans Trinken' : ''}`
                : `${name} meldet sich, sobald du arbeitest`}
        </p>
        <button type="button" className="link-btn" onClick={() => onOpen({ kind: 'settings', tab: 'companion' })}>
          Anpassen
        </button>
      </footer>
    </section>
  );
}
