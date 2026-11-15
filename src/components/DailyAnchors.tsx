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
  WEEKDAYS,
} from '../domain/anchors';
import type { AppState, DailyAnchor, Millis } from '../domain/types';
import { dayKey } from '../lib/time';
import { Dialog } from './Dialog';
import { IconAnchor, IconArrowUp, IconCheck, IconClose, IconPlus } from './icons';

/* ------------------------------------------------------------------------
   Trigger: the floating glass pill
   ------------------------------------------------------------------------ */

const NUDGE_KEY = (day: string) => `todome:anchors:nudge:${day}`;

/** Once per day, for allround users: a soft pulse on the first look. Per-device convenience only. */
function useDailyNudge(wanted: boolean, day: string): boolean {
  const [nudge, setNudge] = useState(false);
  useEffect(() => {
    if (!wanted) return;
    try {
      if (window.localStorage.getItem(NUDGE_KEY(day))) return;
      window.localStorage.setItem(NUDGE_KEY(day), '1');
    } catch {
      return;
    }
    setNudge(true);
    const id = window.setTimeout(() => setNudge(false), 9000);
    return () => window.clearTimeout(id);
  }, [wanted, day]);
  return nudge;
}

/**
 * Tages-Anker trigger: a quiet glass pill floating at the bottom left (it
 * never moves anything in the layouts). Shows today's state (2/3) and glows
 * softly in the accent colour while something for today is still open.
 */
export function AnchorsPill({ state, now, onOpen }: { state: AppState; now: Millis; onOpen: () => void }) {
  const day = dayKey(now);
  const { due, done } = anchorsToday(state.anchors, now, day);
  const open = due.length - done;
  // Neither study nor work chosen: the anchors carry a bit more of the day.
  const allround = state.settings.userContext === 'allround';
  const nudge = useDailyNudge(allround && (open > 0 || state.anchors.length === 0), day);
  const label =
    state.anchors.length === 0
      ? 'Tages-Anker setzen'
      : due.length === 0
        ? 'Tages-Anker: heute frei'
        : `Tages-Anker: ${done} von ${due.length} für heute gesetzt`;
  return (
    <div className="anchors-fab">
      <button
        type="button"
        className={`anchors-pill${open > 0 ? ' is-open' : ''}${allround ? ' is-allround' : ''}${nudge ? ' is-nudging' : ''}`}
        onClick={onOpen}
        aria-label={label}
        title={label}
      >
        <IconAnchor size={15} />
        <span>Tages-Anker</span>
        {due.length > 0 ? (
          <span className="anchors-pill__count">
            {done}/{due.length}
          </span>
        ) : (
          state.anchors.length === 0 && <IconPlus size={13} />
        )}
      </button>
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

  const lead =
    state.anchors.length === 0
      ? 'Kleine Dinge, die zu deinem Tag gehören. Täglich oder an bestimmten Tagen.'
      : due.length === 0
        ? 'Heute ist frei. Deine Anker warten ganz entspannt auf ihren Tag.'
        : done === due.length
          ? 'Heute ist alles verankert. Der Rest des Tages gehört dir.'
          : 'Jeden Morgen frisch, ohne Rückstand.';

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
