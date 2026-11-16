import { useEffect, useState, type CSSProperties } from 'react';
import { avatarName } from '../domain/companion';
import { eventsOn, horizonLine, kindLabel } from '../domain/calendar';
import type { AppState, Millis } from '../domain/types';
import { addDays, dayKey } from '../lib/time';
import { AvatarScene } from './AvatarScene';
import { CalendarBoard } from './CalendarBoard';

interface Props {
  state: AppState;
  now: Millis;
  /** A day to open on (a companion reminder, the mini calendar). */
  day?: string | null;
}

/**
 * "Horizont": the calendar as a calm place, not a business grid. The
 * companion stands at the head and says in one breath what the coming days
 * hold; the next seven days lie open like a horizon (free days are simply
 * free); below, the month and a calm form to note a date with reminders.
 */
export function HorizonView({ state, now, day }: Props) {
  const today = dayKey(now);
  const [picked, setPicked] = useState(day ?? today);
  useEffect(() => {
    if (day) setPicked(day);
  }, [day]);
  const name = avatarName(state.settings.companion.avatar);
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i));

  return (
    <section className="horizon" aria-labelledby="horizon-title">
      <span className="horizon__glow" aria-hidden="true" />
      <header className="horizon__head">
        <div className="horizon__words">
          <p className="horizon__kicker">Horizont</p>
          <h1 id="horizon-title" className="horizon__title">
            Die nächsten Tage, ganz in Ruhe.
          </h1>
          <p className="horizon__line">{horizonLine(state.calendar, now, name)}</p>
        </div>
        <div className="horizon__buddy" aria-hidden="true">
          <AvatarScene avatar={state.settings.companion.avatar} activity="reading" size={120} />
        </div>
      </header>

      <ol className="horizon__week" aria-label="Die nächsten sieben Tage">
        {week.map((d, i) => {
          const items = eventsOn(state.calendar, d);
          const date = new Date(`${d}T12:00:00`);
          return (
            <li key={d} style={{ '--i': i } as CSSProperties}>
              <button
                type="button"
                className={`horizon__day${d === picked ? ' is-picked' : ''}${d === today ? ' is-today' : ''}${items.length ? '' : ' is-free'}`}
                aria-pressed={d === picked}
                onClick={() => setPicked(d)}
              >
                <span className="horizon__weekday">{i === 0 ? 'Heute' : i === 1 ? 'Morgen' : date.toLocaleDateString('de-DE', { weekday: 'short' })}</span>
                <span className="horizon__date">{date.getDate()}</span>
                {items.length === 0 ? (
                  <span className="horizon__free">frei</span>
                ) : (
                  <span className="horizon__items">
                    {items.slice(0, 3).map((e) => (
                      <span key={e.id} className={`horizon__item kind--${e.kind}`} title={kindLabel(e.kind)}>
                        {e.time && <em>{e.time}</em>}
                        {e.title}
                      </span>
                    ))}
                    {items.length > 3 && <span className="horizon__more">+{items.length - 3}</span>}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>

      <CalendarBoard state={state} now={now} picked={picked} onPick={setPicked} />
    </section>
  );
}
