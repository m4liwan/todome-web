import { useEffect, useState } from 'react';
import { useServices } from '../app/services';
import {
  ANCHOR_SUGGESTIONS,
  ANCHOR_TITLE_MAX,
  anchorsToday,
  anchorTitle,
  canAddAnchor,
  CORE_ANCHORS,
  EVERY_DAY,
  isAnchorDone,
  MAX_ANCHORS,
  rhythmLabel,
  weekdayOf,
  WEEKDAYS,
} from '../domain/anchors';
import type { AppState, DailyAnchor, Millis } from '../domain/types';
import { dayKey } from '../lib/time';
import { Dialog } from './Dialog';
import { IconArrowUp, IconCalendar, IconCheck, IconClose, IconPlus } from './icons';
import { relativeDay, upcomingEvents } from '../domain/calendar';

/* ------------------------------------------------------------------------
   The section on the home: a small week calendar and today's anchors
   ------------------------------------------------------------------------ */

const DAY_NAMES = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'] as const;

/** One calm sentence about today; never a count against you. */
function anchorsLead(total: number, due: number, done: number): string {
  if (total === 0) return 'Kleine Dinge, die zu deinem Tag gehören. Täglich oder an bestimmten Tagen.';
  if (due === 0) return 'Heute ist frei. Deine Anker warten ganz entspannt auf ihren Tag.';
  if (done === due) return 'Heute ist alles verankert. Der Rest des Tages gehört dir.';
  return 'Jeden Morgen frisch, ohne Rückstand.';
}

interface SectionProps {
  state: AppState;
  now: Millis;
  /** The pop-up for adding, renaming and the rhythm. */
  onManage: () => void;
  onImpulse: (anchor: DailyAnchor) => void;
  /** Opens the full calendar on a day (dates, exams, reminders). */
  onCalendar?: (day: string) => void;
}

/**
 * Tages-Anker as a section of the home: this week as a small calendar (each
 * day shows its anchors as dots, today's set ones lit), and the chosen day's
 * anchors beside it. Today ticks with one click or starts the five-minute
 * impulse; other days only show what belongs to them. Nothing about earlier
 * days is kept, so nothing can be missed.
 */
export function AnchorsSection({ state, now, onManage, onImpulse, onCalendar }: SectionProps) {
  const services = useServices();
  const day = dayKey(now);
  const today = weekdayOf(now);
  const [picked, setPicked] = useState(today);
  const { due, done } = anchorsToday(state.anchors, now, day);
  const base = new Date(now);
  const week = WEEKDAYS.map((name, i) => {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - today + i, 12);
    return { i, name, date: d.getDate(), key: dayKey(d.getTime()) };
  });
  const upcoming = upcomingEvents(state.calendar, now, 3);
  const pickedKey = week[picked]?.key ?? day;
  const datesOn = (key: string) => state.calendar.filter((e) => e.day === key);
  const dueOn = (weekday: number) => state.anchors.filter((a) => a.days.includes(weekday));
  const list = dueOn(picked);
  const isToday = picked === today;

  const mark = (anchor: DailyAnchor, isDone: boolean) => {
    services.store.dispatch({ type: 'anchor/mark', id: anchor.id, day, done: isDone });
    if (isDone) services.announce(`„${anchor.title}“ ist für heute verankert.`);
  };

  return (
    <div className="anchors-sec">
      <div className="anchors-sec__week">
        <p className="anchors-sec__lead">{anchorsLead(state.anchors.length, due.length, done)}</p>
        <div className="week-cal" role="group" aria-label="Diese Woche">
          {week.map((d) => {
            const items = dueOn(d.i);
            const dates = datesOn(d.key);
            return (
              <button
                key={d.name}
                type="button"
                className={`week-cal__day${d.i === today ? ' is-today' : ''}${d.i === picked ? ' is-picked' : ''}${dates.length ? ' has-date' : ''}`}
                aria-pressed={d.i === picked}
                aria-label={`${DAY_NAMES[d.i]}, ${d.date}.: ${items.length === 1 ? 'ein Anker' : `${items.length} Anker`}${dates.length ? `, ${dates.length === 1 ? 'ein Termin' : `${dates.length} Termine`}` : ''}`}
                onClick={() => setPicked(d.i)}
              >
                <span className="week-cal__name">{d.name}</span>
                <span className="week-cal__date">{d.date}</span>
                <span className="week-cal__dots" aria-hidden="true">
                  {items.slice(0, 5).map((a) => (
                    <i key={a.id} className={d.i === today && isAnchorDone(a, day) ? 'is-done' : undefined} />
                  ))}
                  {items.length > 5 && <em>+{items.length - 5}</em>}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="anchors-sec__day">
        <p className="label">{isToday ? (due.length ? `Heute · ${done} von ${due.length}` : 'Heute') : DAY_NAMES[picked]}</p>
        {list.length > 0 ? (
          <ul className="anchors__list">
            {list.map((a) => {
              const isDone = isToday && isAnchorDone(a, day);
              return isToday ? (
                <li key={a.id} className={`anchor${isDone ? ' is-done' : ''}`}>
                  <button type="button" className="anchor__main" role="checkbox" aria-checked={isDone} onClick={() => mark(a, !isDone)}>
                    <span className="anchor__dot" aria-hidden="true">
                      <IconCheck size={12} />
                    </span>
                    <span className="anchor__text">
                      <span className="anchor__title">{a.title}</span>
                    </span>
                  </button>
                  {!isDone && (
                    <button type="button" className="btn btn--small anchor__impulse" onClick={() => onImpulse(a)} title="Nur fünf Minuten. Danach darfst du aufhören.">
                      5 Min.
                    </button>
                  )}
                </li>
              ) : (
                <li key={a.id} className="anchor is-free">
                  <div className="anchor__main">
                    <span className="anchor__text">
                      <span className="anchor__title">{a.title}</span>
                      <span className="anchor__rhythm">{rhythmLabel(a.days)}</span>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          state.anchors.length > 0 && <p className="anchors-sec__free">An diesem Tag ist frei.</p>
        )}
        {onCalendar && (
          <div className="cal-peek">
            {upcoming.length > 0 && (
              <ul className="cal-peek__list" aria-label="Demnächst im Kalender">
                {upcoming.map((e) => (
                  <li key={e.id} className="cal-peek__item">
                    <span className={`cal__dot kind--${e.kind}`} aria-hidden="true" />
                    <span>{e.title}</span>
                    <span>
                      {relativeDay(e.day, now)}
                      {e.time ? `, ${e.time}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="anchors-sec__actions">
          {onCalendar && (
            <button type="button" className="btn btn--small" onClick={() => onCalendar(pickedKey)}>
              <IconCalendar size={14} />
              Zum Horizont
            </button>
          )}
          <button type="button" className={`btn btn--small${state.anchors.length ? '' : ' btn--primary'}`} onClick={onManage}>
            {state.anchors.length ? (
              'Anker anpassen'
            ) : (
              <>
                <IconPlus size={13} />
                Ersten Anker setzen
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------
   Rhythm picker: daily, or chosen weekdays
   ------------------------------------------------------------------------ */

function DayPicker({ value, onChange, label }: { value: readonly number[]; onChange: (days: number[]) => void; label: string }) {
  const daily = value.length === 7;
  return (
    <div className="day-picker" role="group" aria-label={label}>
      <button type="button" className={`day-picker__all${daily ? ' is-on' : ''}`} aria-pressed={daily} onClick={() => onChange([...EVERY_DAY])}>
        Täglich
      </button>
      {WEEKDAYS.map((name, d) => {
        const on = value.includes(d);
        return (
          <button
            key={name}
            type="button"
            className={`day-picker__day${on ? ' is-on' : ''}`}
            aria-pressed={on}
            onClick={() => {
              const next = on ? value.filter((x) => x !== d) : [...value, d];
              // At least one day stays: an anchor without days would simply vanish.
              if (next.length) onChange([...next].sort((a, b) => a - b));
            }}
          >
            {name}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------------
   The pop-up
   ------------------------------------------------------------------------ */

interface DialogProps {
  open: boolean;
  state: AppState;
  now: Millis;
  onClose: () => void;
  /** Optional five-minute focus impulse (the calm pause-room timer). */
  onImpulse: (anchor: DailyAnchor) => void;
}

/**
 * Tages-Anker as a calm glass pop-up: today's anchors to tick with one click
 * (or a five-minute impulse), the ones that are free today, and a light
 * rhythm per anchor. Open ones glow warm, set ones rest. Nothing is ever red,
 * overdue or counted against you: every morning it is simply fresh again.
 */
export function AnchorsDialog({ open, state, now, onClose, onImpulse }: DialogProps) {
  const services = useServices();
  const day = dayKey(now);
  const { due, free, done } = anchorsToday(state.anchors, now, day);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftDays, setDraftDays] = useState<number[]>([...EVERY_DAY]);
  const room = canAddAnchor(state.anchors);
  // More than a few for today: the top ones (your order) get a little more presence.
  const core = due.length > CORE_ANCHORS ? new Set(due.slice(0, CORE_ANCHORS).map((a) => a.id)) : new Set<string>();

  useEffect(() => {
    if (!open) setEditing(false);
  }, [open]);

  const mark = (anchor: DailyAnchor, isDone: boolean) => {
    services.store.dispatch({ type: 'anchor/mark', id: anchor.id, day, done: isDone });
    if (isDone) services.announce(`„${anchor.title}“ ist für heute verankert.`);
  };

  const add = (raw: string, days: readonly number[]) => {
    const title = anchorTitle(raw);
    if (!title || !room) return;
    services.store.dispatch({ type: 'anchor/add', anchor: { id: services.deps().newId(), title, createdAt: services.clock.now(), lastDoneDay: null, days: [...days] } });
    setDraft('');
    setDraftDays([...EVERY_DAY]);
  };

  const lead = anchorsLead(state.anchors.length, due.length, done);

  const row = (a: DailyAnchor, today: boolean) => {
    const isDone = today && isAnchorDone(a, day);
    const index = state.anchors.findIndex((x) => x.id === a.id);
    if (editing) {
      return (
        <li key={a.id} className="anchor anchor--edit">
          <div className="anchor__edit-row">
            <input
              className="anchor__edit"
              defaultValue={a.title}
              maxLength={ANCHOR_TITLE_MAX}
              aria-label={`Anker „${a.title}“ umbenennen`}
              onBlur={(e) => {
                if (anchorTitle(e.target.value) && anchorTitle(e.target.value) !== a.title) services.store.dispatch({ type: 'anchor/update', id: a.id, title: e.target.value });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
            />
            <button
              type="button"
              className="anchor__icon-btn"
              aria-label={`„${a.title}“ nach oben`}
              title="Nach oben"
              disabled={index <= 0}
              onClick={() => services.store.dispatch({ type: 'anchor/move', id: a.id, by: -1 })}
            >
              <IconArrowUp size={14} />
            </button>
            <button
              type="button"
              className="anchor__icon-btn"
              aria-label={`Anker „${a.title}“ lösen`}
              title="Lösen"
              onClick={() => services.store.dispatch({ type: 'anchor/remove', id: a.id })}
            >
              <IconClose size={14} />
            </button>
          </div>
          <DayPicker value={a.days} label={`Rhythmus von „${a.title}“`} onChange={(days) => services.store.dispatch({ type: 'anchor/update', id: a.id, days })} />
        </li>
      );
    }
    return (
      <li key={a.id} className={`anchor${isDone ? ' is-done' : ''}${today ? '' : ' is-free'}${core.has(a.id) ? ' is-core' : ''}`}>
        {today ? (
          <button type="button" className="anchor__main" role="checkbox" aria-checked={isDone} onClick={() => mark(a, !isDone)}>
            <span className="anchor__dot" aria-hidden="true">
              <IconCheck size={12} />
            </span>
            <span className="anchor__text">
              <span className="anchor__title">{a.title}</span>
              {a.days.length < 7 && <span className="anchor__rhythm">{rhythmLabel(a.days)}</span>}
            </span>
          </button>
        ) : (
          <div className="anchor__main">
            <span className="anchor__text">
              <span className="anchor__title">{a.title}</span>
              <span className="anchor__rhythm">{rhythmLabel(a.days)}</span>
            </span>
          </div>
        )}
        {today && !isDone && (
          <button type="button" className="btn btn--small anchor__impulse" onClick={() => onImpulse(a)} title="Nur fünf Minuten. Danach darfst du aufhören.">
            5 Min.
          </button>
        )}
      </li>
    );
  };

  return (
    <Dialog open={open} title="Tages-Anker" onClose={onClose} className="dialog--anchors">
      <div className="anchors">
        <div className="anchors__head">
          <p className="muted">{lead}</p>
          {state.anchors.length > 0 && (
            <button type="button" className="link-btn" onClick={() => setEditing((e) => !e)}>
              {editing ? 'Fertig' : 'Anpassen'}
            </button>
          )}
        </div>

        {editing ? (
          <ul className="anchors__list">{state.anchors.map((a) => row(a, false))}</ul>
        ) : (
          <>
            {due.length > 0 && (
              <ul className="anchors__list" aria-label="Heute">
                {due.map((a) => row(a, true))}
              </ul>
            )}
            {free.length > 0 && (
              <section className="anchors__free" aria-label="Heute frei">
                <h3>Heute frei</h3>
                <ul className="anchors__list">{free.map((a) => row(a, false))}</ul>
              </section>
            )}
          </>
        )}

        {state.anchors.length === 0 && (
          <div className="anchors__ideas" aria-label="Vorschläge">
            {ANCHOR_SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="anchors__idea" onClick={() => add(s, EVERY_DAY)}>
                <IconPlus size={12} />
                {s}
              </button>
            ))}
          </div>
        )}

        {room ? (
          <form
            className="anchors__add"
            onSubmit={(e) => {
              e.preventDefault();
              add(draft, draftDays);
            }}
          >
            <div className="anchors__add-row">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={ANCHOR_TITLE_MAX}
                placeholder={state.anchors.length === 0 ? 'Oder ein eigener, z. B. Tagebuch schreiben' : 'Neuer Anker'}
                aria-label="Neuer Tages-Anker"
              />
              <button type="submit" className="btn btn--small" disabled={!anchorTitle(draft)}>
                Setzen
              </button>
            </div>
            {anchorTitle(draft) && <DayPicker value={draftDays} label="Rhythmus des neuen Ankers" onChange={setDraftDays} />}
          </form>
        ) : (
          <p className="muted small anchors__full">{MAX_ANCHORS} Anker geben genug Halt. Löse einen, wenn ein neuer dazukommen soll.</p>
        )}
      </div>
    </Dialog>
  );
}
