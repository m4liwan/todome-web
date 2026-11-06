import type { OpenModal } from '../app/modal';
import { currentFocusStreakMs, netTodayMs } from '../domain/coach';
import { ENERGY_WORDS, energyProfile, energyToday } from '../domain/energy';
import { isWinterActive } from './Winter';
import { waterToday } from '../domain/companion';
import { toTimeEntries } from '../domain/reports';
import type { SessionProjection } from '../domain/session';
import type { AppState, Millis } from '../domain/types';
import { dayKey, formatDate, HOUR, MIN } from '../lib/time';
import { businessShown, contextLabels } from '../domain/userContext';

interface Props {
  state: AppState;
  projections: SessionProjection[];
  now: Millis;
  onOpen: OpenModal;
  onLogin: () => void;
  onStandby: () => void;
  onBreathe: () => void;
}

export function greetingFor(at: Millis): string {
  const h = new Date(at).getHours();
  if (h < 5) return 'Schön, dass du noch da bist';
  if (h < 11) return 'Guten Morgen';
  if (h < 17) return 'Guten Tag';
  if (h < 22) return 'Guten Abend';
  return 'Einen ruhigen Abend';
}

/** Under an hour minutes read better than "0,1 h". */
function Amount({ ms }: { ms: Millis }) {
  if (ms < HOUR) {
    return (
      <>
        {Math.round(ms / MIN)}
        <small>min</small>
      </>
    );
  }
  return (
    <>
      {(ms / HOUR).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
      <small>h</small>
    </>
  );
}

/** Personal hello plus the day's vital numbers, set large and light. */
export function Greeting({ state, projections, now, onOpen, onLogin, onStandby, onBreathe }: Props) {
  const labels = contextLabels(state.settings.userContext);
  const business = businessShown(state);
  const name = state.settings.userName.trim();
  const today = dayKey(now);
  const net = netTodayMs(projections, now);
  const billable = toTimeEntries(state, projections)
    .filter((e) => e.day === today && e.billable)
    .reduce((a, e) => a + e.netMs, 0);
  const streak = currentFocusStreakMs(projections, now);
  const water = waterToday(state, now);
  const goal = state.settings.companion.waterGoal;
  const open = Object.values(state.tasks).filter((t) => t.plannedDay <= today && (t.status === 'planned' || t.status === 'in_progress')).length;
  const energy = energyToday(state, now);
  const profile = energyProfile(state, now);

  return (
    <section className="hello rise" style={{ '--i': 0 } as React.CSSProperties} aria-label="Überblick">
      <div className="hello__text">
        <h1>
          {greetingFor(now)}
          {name ? `, ${name}` : ''}!
        </h1>
        <p>
          {formatDate(today)}.{' '}
          {isWinterActive(state.settings.appearance.xmas, now) && 'Eine ruhige Adventszeit. '}
          {open === 0 ? 'Heute ist Raum für das, was dir wichtig ist.' : profile?.mode === 'low' ? 'Heute machen wir es dir leicht. Ein kleiner Schritt genügt.' : 'Eins nach dem anderen. Der nächste Schritt reicht völlig.'}
        </p>
        <div className="hello__chips">
          <button type="button" className={`energy-chip${energy !== null ? ` energy-chip--${profile?.mode}` : ''}`} onClick={() => onOpen({ kind: 'energy' })}>
          <span className="energy-chip__meter" aria-hidden="true">
            {Array.from({ length: 5 }, (_, i) => (
              <span key={i} className={energy !== null && energy >= (i + 1) * 2 - 1 ? 'is-on' : undefined} />
            ))}
          </span>
          {energy !== null ? `Energie ${energy}, ${ENERGY_WORDS[energy]}. ${profile?.label}` : 'Wie ist deine Energie heute?'}
        </button>
          <button type="button" className="energy-chip" onClick={onLogin} title="Kurz bewusst ankommen">
            <span className="hello__dot hello__dot--login" aria-hidden="true" />
            Mentaler Login
          </button>
          <button type="button" className="energy-chip" onClick={onStandby} title="Bildschirm zur Ruhe bringen">
            <span className="hello__dot hello__dot--rest" aria-hidden="true" />
            Ruhemodus
          </button>
          <button type="button" className="energy-chip energy-chip--breathe" onClick={onBreathe} title="Alles ausblenden und kurz durchatmen">
            <span className="hello__dot hello__dot--breathe" aria-hidden="true" />
            Durchatmen
          </button>
        </div>
      </div>
      <dl className="vitals">
        <div>
          <dd>
            <Amount ms={net} />
          </dd>
          <dt>Konzentriert heute</dt>
        </div>
        {business && (
          <div>
            <dd>
              <Amount ms={billable} />
            </dd>
            <dt>Für {labels.clients}</dt>
          </div>
        )}
        <div>
          <dd>
            {Math.round(streak / MIN)}
            <small>min</small>
          </dd>
          <dt>Fokus am Stück</dt>
        </div>
        <div className="vitals__water">
          <dd>
            {water}
            <small>/{goal}</small>
          </dd>
          <dt>Gläser Wasser</dt>
        </div>
      </dl>
    </section>
  );
}
