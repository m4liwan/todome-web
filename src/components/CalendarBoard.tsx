import { useEffect, useMemo, useState } from 'react';
import { useServices } from '../app/services';
import { avatarName } from '../domain/companion';
import { CALENDAR_KINDS, eventsOn, eventTitle, EVENT_TITLE_MAX, kindLabel, relativeDay, REMINDERS, sortReminders } from '../domain/calendar';
import type { AppState, CalendarEvent, CalendarKind, Millis, ReminderId } from '../domain/types';
import { addDays, dayKey } from '../lib/time';
import { IconChevronLeft, IconChevronRight, IconPlus, IconTrash } from './icons';
import { Select } from './Select';

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const REMINDER_LABEL = Object.fromEntries(REMINDERS.map((r) => [r.id, r.label])) as Record<ReminderId, string>;
const DEFAULT_REMIND: ReminderId[] = ['1d', '3h'];

const monthOf = (day: string) => day.slice(0, 7);
const monthLabel = (month: string) => new Date(`${month}-01T12:00:00`).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
const longDay = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });

/** The 6 × 7 days of a month view, Monday first. */
function monthGrid(month: string): string[] {
  const first = `${month}-01`;
  const weekday = (new Date(`${first}T12:00:00`).getDay() + 6) % 7;
  const start = addDays(first, -weekday);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y ?? 1970, (m ?? 1) - 1 + by, 1, 12);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

interface Props {
  state: AppState;
  now: Millis;
  /** The chosen day (controlled by the page, so the week strip can choose too). */
  picked: string;
  onPick: (day: string) => void;
}

/**
 * The calendar itself: a month drawn in hairlines, the chosen day beside it
 * and a calm form to note a date. For every date you choose when the
 * companion reminds you, gently and in time.
 */
export function CalendarBoard({ state, now, picked, onPick }: Props) {
  const services = useServices();
  const today = dayKey(now);
  const [month, setMonth] = useState(monthOf(picked));
  // A day chosen elsewhere (the week strip, a reminder) brings its month along.
  useEffect(() => setMonth(monthOf(picked)), [picked]);

  const grid = useMemo(() => monthGrid(month), [month]);
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of state.calendar) m.set(e.day, [...(m.get(e.day) ?? []), e]);
    return m;
  }, [state.calendar]);
  const list = eventsOn(state.calendar, picked);
  const name = avatarName(state.settings.companion.avatar);

  // The form for a new date on the chosen day.
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<CalendarKind>('appointment');
  const [time, setTime] = useState('10:00');
  const [allDay, setAllDay] = useState(false);
  const [remind, setRemind] = useState<ReminderId[]>(DEFAULT_REMIND);

  const add = () => {
    const clean = eventTitle(title);
    if (!clean) return services.announce('Gib dem Eintrag noch einen Namen.');
    const { newId, now: at } = services.deps();
    services.store.dispatch({
      type: 'event/upsert',
      event: { id: newId(), title: clean, kind, day: picked, time: allDay ? null : time || null, remind: sortReminders(remind), sent: [], createdAt: at },
    });
    setTitle('');
    services.announce(remind.length ? `„${clean}“ steht im Kalender. ${name} erinnert dich rechtzeitig.` : `„${clean}“ steht im Kalender.`);
  };

  const toggleRemind = (r: ReminderId) => setRemind((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));

  return (
    <div className="cal">
      <section className="cal__month" aria-label={monthLabel(month)}>
        <header className="cal__head">
          <button type="button" className="icon-btn" aria-label="Vorheriger Monat" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
            <IconChevronLeft size={18} />
          </button>
          <h3 className="cal__title">{monthLabel(month)}</h3>
          <button type="button" className="icon-btn" aria-label="Nächster Monat" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
            <IconChevronRight size={18} />
          </button>
          {(month !== monthOf(today) || picked !== today) && (
            <button type="button" className="btn btn--small btn--quiet cal__today" onClick={() => onPick(today)}>
              Heute
            </button>
          )}
        </header>
        <div className="cal__grid" role="grid" aria-label="Tage">
          {WEEKDAYS.map((w) => (
            <span key={w} className="cal__weekday" aria-hidden="true">
              {w}
            </span>
          ))}
          {grid.map((d) => {
            const items = byDay.get(d) ?? [];
            const cls = ['cal__day', monthOf(d) !== month && 'is-outside', d === today && 'is-today', d === picked && 'is-picked', d < today && 'is-past'].filter(Boolean).join(' ');
            return (
              <button
                key={d}
                type="button"
                role="gridcell"
                className={cls}
                aria-selected={d === picked}
                aria-label={`${longDay(d)}${items.length ? `, ${items.length === 1 ? 'ein Eintrag' : `${items.length} Einträge`}` : ''}`}
                onClick={() => onPick(d)}
              >
                <span className="cal__date">{Number(d.slice(8))}</span>
                <span className="cal__dots" aria-hidden="true">
                  {items.slice(0, 3).map((e) => (
                    <i key={e.id} className={`cal__dot kind--${e.kind}`} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="cal__day-pane" aria-labelledby="cal-day-title">
        <p className="label">{relativeDay(picked, now)}</p>
        <h3 id="cal-day-title" className="cal__day-title">
          {longDay(picked)}
        </h3>
        {list.length === 0 ? (
          <p className="muted small">An diesem Tag steht noch nichts. Gut so, oder du trägst unten etwas ein.</p>
        ) : (
          <ul className="cal__events">
            {list.map((e) => (
              <li key={e.id} className={`cal__event kind--${e.kind}`}>
                <span className="cal__event-time num">{e.time ?? 'Ganztägig'}</span>
                <span className="cal__event-body">
                  <strong>{e.title}</strong>
                  <span className="muted small">
                    {kindLabel(e.kind)}
                    {e.remind.length ? ` · ${name} erinnert: ${e.remind.map((r) => REMINDER_LABEL[r]).join(', ')}` : ' · ohne Erinnerung'}
                  </span>
                </span>
                <button type="button" className="icon-ghost" aria-label={`„${e.title}“ löschen`} title="Löschen" onClick={() => services.store.dispatch({ type: 'event/remove', id: e.id })}>
                  <IconTrash size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <form
          className="cal__form"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <p className="label">Eintragen</p>
          <label className="field">
            <span>Was steht an?</span>
            <input value={title} maxLength={EVENT_TITLE_MAX} placeholder="z. B. Team-Meeting, Klausur Statistik, Geburtstag Oma" onChange={(e) => setTitle(e.target.value)} />
          </label>
          <div className="cal__row">
            <div className="field cal__kind">
              <span>Art</span>
              <Select value={kind} onChange={(v) => setKind(v as CalendarKind)} aria-label="Art des Eintrags">
                {CALENDAR_KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </Select>
            </div>
            <label className="field cal__time">
              <span>Uhrzeit</span>
              <input type="time" value={time} disabled={allDay} onChange={(e) => setTime(e.target.value)} />
            </label>
            <label className="check cal__allday">
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
              <span>Ganztägig</span>
            </label>
          </div>
          <div className="cal__remind">
            <span className="label">Wann soll {name} dich erinnern?</span>
            <div className="cal__remind-opts" role="group" aria-label="Erinnerungen">
              {REMINDERS.map((r) => (
                <button key={r.id} type="button" className={`chip${remind.includes(r.id) ? ' is-on' : ''}`} aria-pressed={remind.includes(r.id)} onClick={() => toggleRemind(r.id)}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div className="row">
            <button type="submit" className="btn btn--primary">
              <IconPlus size={14} />
              In den Kalender
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
