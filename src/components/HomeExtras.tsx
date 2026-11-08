import { useEffect, useMemo, useRef, useState } from 'react';
import { FEEDBACK_URL } from '../app/feedback';
import { companionHello } from '../app/companion';
import { useServices } from '../app/services';
import { prefersReducedMotion } from '../app/theme';
import { avatarName } from '../domain/companion';
import { ACTIVITY_LABELS, avatarActivity, ENERGY_WORDS, energyMode, energyProfile, energyToday, type EnergyMode } from '../domain/energy';
import { weekSummary } from '../domain/reports';
import type { SessionProjection } from '../domain/session';
import type { AppState, Millis } from '../domain/types';
import { dayKey, formatDuration, formatTime, HOUR } from '../lib/time';
import { createTask } from '../state/commands';
import { dissolveText } from '../lib/dissolve';
import { AvatarScene } from './AvatarScene';
import { AvatarFx, holoFor } from './AvatarFx';
import { IconArrowUpRight, IconCheck, IconClose, IconPlus, IconChat } from './icons';

/* ------------------------------------------------------------------------
   Tagesgedanke
   ------------------------------------------------------------------------ */

const THOUGHTS_ALL = [
  'Heute gibt es nichts zu beweisen. Du darfst einfach anfangen.',
  'Fertig ist besser als perfekt. 80 % sind ein echtes Ergebnis.',
  'Ein kleiner Schritt nach vorn ist immer noch nach vorn.',
  'Pausen sind kein Luxus. Sie sind Teil deiner Arbeit.',
  'Du bist mehr als deine Liste.',
  'Langsam ist auch eine Geschwindigkeit.',
  'Was du heute schaffst, reicht. Wirklich.',
  'Fokus heißt auch, zu vielem freundlich Nein zu sagen.',
  'Dein Wert hängt nicht an deiner Produktivität.',
  'Fang mit dem an, was sich am leichtesten anfühlt.',
  'Du darfst stolz sein, bevor alles erledigt ist.',
  'Ein ruhiger Kopf schafft mehr als ein gehetzter.',
];
const THOUGHTS_LOW = [
  'Heute reicht es, freundlich zu dir zu sein.',
  'Wenig Energie ist kein Versagen. Es ist eine Information.',
  'Ein Glas Wasser, ein Atemzug, ein Schritt. Das genügt.',
];
const THOUGHTS_HIGH = ['Nutze deine Energie für das, was dir wirklich wichtig ist.', 'Ein tiefer Block heute ist ein Geschenk an dein Morgen-Ich.'];

export function thoughtFor(day: string, mode: EnergyMode | null, offset = 0): string {
  const pool = mode === 'low' ? [...THOUGHTS_LOW, ...THOUGHTS_ALL] : mode === 'high' ? [...THOUGHTS_HIGH, ...THOUGHTS_ALL] : THOUGHTS_ALL;
  const seed = day.split('-').reduce((a, n) => a * 31 + Number(n), 7);
  return pool[(seed + offset) % pool.length] ?? THOUGHTS_ALL[0]!;
}

/** A quiet, grounded impulse for the day. */
export function DailyImpulse({ state, now }: { state: AppState; now: Millis }) {
  const [offset, setOffset] = useState(0);
  const mode = energyMode(energyToday(state, now));
  const text = thoughtFor(dayKey(now), mode, offset);
  return (
    <section className="card impulse rise" aria-label="Tagesgedanke">
      <p className="impulse__label">Dein Gedanke für heute</p>
      <blockquote className="impulse__text" key={text}>
        <span className="impulse__q impulse__q--open" aria-hidden="true">
          „
        </span>
        {text}
        <span className="impulse__q" aria-hidden="true">
          “
        </span>
      </blockquote>
      <button type="button" className="link-btn impulse__next" onClick={() => setOffset((o) => o + 1)}>
        Anderer Gedanke
      </button>
    </section>
  );
}

/* ------------------------------------------------------------------------
   Gedanken-Parkplatz
   ------------------------------------------------------------------------ */

/**
 * Gedanken-Parkplatz with the "Gedanken-Killer": park a thought so it waits,
 * tidy, or let it go and watch it dissolve into air.
 */
export function ThoughtParking({ state, now }: { state: AppState; now: Millis }) {
  const services = useServices();
  const [text, setText] = useState('');
  const [all, setAll] = useState(false);
  const [releasing, setReleasing] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = all ? state.thoughts : state.thoughts.slice(0, 4);

  const park = () => {
    const t = text.trim();
    if (!t) return;
    services.store.dispatch({ type: 'thought/add', thought: { id: services.deps().newId(), text: t.slice(0, 200), createdAt: services.clock.now() } });
    setText('');
  };

  const glow = () => getComputedStyle(document.documentElement).getPropertyValue('--accent-mesh').trim() || undefined;

  const releaseTyped = async () => {
    const el = input.current;
    const t = text.trim();
    if (!el || !t || releasing) return;
    setReleasing('input');
    await dissolveText(el, t, { glow: glow() });
    setText('');
    el.style.opacity = '';
    el.style.transition = '';
    setReleasing(null);
    services.announce('Losgelassen. Er ist weg, du bist leichter.');
    el.focus();
  };

  const releaseParked = async (id: string, el: HTMLElement | null, t: string) => {
    if (releasing) return;
    setReleasing(id);
    if (el) await dissolveText(el, t, { glow: glow() });
    services.store.dispatch({ type: 'thought/remove', id });
    setReleasing(null);
  };

  return (
    <section className="card parking rise" aria-label="Gedanken-Parkplatz">
      <header className="card__head">
        <div>
          <h2>Gedanken-Parkplatz</h2>
          <p className="muted">
            {state.thoughts.length
              ? `${state.thoughts.length} ${state.thoughts.length === 1 ? 'Gedanke wartet' : 'Gedanken warten'} aufgeräumt auf dich`
              : 'Parken oder loslassen. Beides ist okay.'}
          </p>
        </div>
      </header>
      <form
        className="parking__add"
        onSubmit={(e) => {
          e.preventDefault();
          park();
        }}
      >
        <TickerInput inputRef={input} value={text} onChange={setText} placeholder="Was schwirrt dir gerade im Kopf herum?" />
        <div className="parking__btns">
          <button type="submit" className="pill pill--sm" disabled={!text.trim() || Boolean(releasing)} title="Sicher aufheben, für später">
            <IconPlus size={14} /> Parken
          </button>
          <button type="button" className="pill pill--sm pill--release" disabled={!text.trim() || Boolean(releasing)} onClick={() => void releaseTyped()} title="Der Gedanke löst sich in Luft auf">
            Loslassen
          </button>
        </div>
      </form>
      {state.thoughts.length === 0 ? (
        <p className="parking__empty muted small">Aufdringlicher Gedanke? Tipp ihn ein und lass ihn los. Er löst sich auf, und dein Kopf wird leichter.</p>
      ) : (
        <ul className="parking__list">
          {list.map((t) => (
            <li key={t.id} className={releasing === t.id ? 'is-releasing' : undefined}>
              <p data-thought={t.id}>{t.text}</p>
              <span className="parking__time">{dayKey(t.createdAt) === dayKey(now) ? formatTime(t.createdAt) : new Date(t.createdAt).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}</span>
              <div className="parking__actions">
                <button
                  type="button"
                  className="icon-ghost"
                  title="Als Aufgabe ablegen"
                  aria-label={`${t.text} als Aufgabe ablegen`}
                  onClick={() => {
                    const r = createTask(state, services.deps(), { title: t.text.slice(0, 120), type: 'admin', clientId: null, estimateMin: 15, intention: t.text.slice(0, 160), priority: 'low' });
                    if (services.run(r)) {
                      services.store.dispatch({ type: 'thought/remove', id: t.id });
                      services.announce('Liegt jetzt ruhig in deinem Plan.');
                    }
                  }}
                >
                  <IconArrowUpRight size={15} />
                </button>
                <button
                  type="button"
                  className="icon-ghost parking__release"
                  title="Loslassen und auflösen"
                  aria-label={`${t.text} loslassen`}
                  onClick={(e) => {
                    const p = e.currentTarget.closest('li')?.querySelector<HTMLElement>(`[data-thought="${t.id}"]`) ?? null;
                    void releaseParked(t.id, p, t.text);
                  }}
                >
                  <IconClose size={13} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {state.thoughts.length > 4 && (
        <button type="button" className="link-btn" onClick={() => setAll((a) => !a)}>
          {all ? 'Weniger zeigen' : `Alle ${state.thoughts.length} zeigen`}
        </button>
      )}
    </section>
  );
}

/**
 * A text field that, when its text is longer than the field and it is not
 * being edited, lets the text glide by slowly like a ticker.
 */
function TickerInput({ inputRef, value, onChange, placeholder }: { inputRef: React.RefObject<HTMLInputElement>; value: string; onChange: (v: string) => void; placeholder: string }) {
  const [focused, setFocused] = useState(false);
  const [overflow, setOverflow] = useState(0);
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const measure = () => {
      const extra = el.scrollWidth - el.clientWidth;
      setOverflow(extra > 2 ? extra : 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [value, focused, inputRef]);
  const ticking = !focused && overflow > 0 && value.length > 0;
  return (
    <div className={`ticker-field${ticking ? ' is-ticking' : ''}`} style={{ '--tick': `${overflow + 24}px`, '--tick-s': `${Math.max(6, (overflow + 24) / 22)}s` } as React.CSSProperties}>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        maxLength={200}
        placeholder={placeholder}
        aria-label="Gedanke"
      />
      {ticking && (
        <span className="ticker-field__text" aria-hidden="true">
          <span>{value}</span>
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------
   Wochen-Teaser
   ------------------------------------------------------------------------ */

export function WeekTeaser({ state, projections, now, onOpen }: { state: AppState; projections: SessionProjection[]; now: Millis; onOpen: () => void }) {
  const w = useMemo(() => weekSummary(state, projections, now), [state, projections, now]);
  const max = Math.max(HOUR, ...w.days.map((d) => d.netMs));
  return (
    <section className="card teaser rise" aria-label="Wochen-Teaser">
      <div className="teaser__text">
        <h2>Deine Woche</h2>
        <p className="muted">
          {w.focusMs > 0
            ? `${formatDuration(w.focusMs)} Fokus${w.tasksDone.length ? `, ${w.tasksDone.length} ${w.tasksDone.length === 1 ? 'Sache' : 'Sachen'} geschafft` : ''}. Schau mal, was du bewegt hast.`
            : 'Hier wächst gerade dein Rückblick. Jede Minute zählt.'}
        </p>
      </div>
      <ol className="teaser__bars" aria-hidden="true">
        {w.days.map((d) => (
          <li key={d.day} className={d.day === dayKey(now) ? 'is-today' : undefined} style={{ '--h': d.netMs / max } as React.CSSProperties} />
        ))}
      </ol>
      <button type="button" className="pill pill--sm" onClick={onOpen}>
        Zum Rückblick
      </button>
    </section>
  );
}

/* ------------------------------------------------------------------------
   Micro-Routinen
   ------------------------------------------------------------------------ */

export interface Routine {
  id: string;
  label: string;
  hint: string;
  seconds?: number;
}

export const ROUTINES: Routine[] = [
  { id: 'screen', label: '3 Minuten Bildschirmpause', hint: 'In die Ferne schauen, Augen entspannen', seconds: 180 },
  { id: 'breathe', label: '5 tiefe Atemzüge', hint: 'Ein Moment nur für dich', seconds: 60 },
  { id: 'shoulders', label: 'Schultern lockern', hint: 'Kreisen, sinken lassen, fertig' },
  { id: 'air', label: 'Kurz frische Luft', hint: 'Fenster auf, einmal durchatmen' },
  { id: 'stand', label: 'Aufstehen und strecken', hint: 'Dein Rücken sagt Danke' },
];

/** Untimed moments the last three slots can be swapped with. */
export const MOMENT_POOL: Routine[] = [
  { id: 'shoulders', label: 'Schultern lockern', hint: 'Kreisen, sinken lassen, fertig' },
  { id: 'air', label: 'Kurz frische Luft', hint: 'Fenster auf, einmal durchatmen' },
  { id: 'stand', label: 'Aufstehen und strecken', hint: 'Dein Rücken sagt Danke' },
  { id: 'tea', label: 'Eine Tasse Tee aufsetzen', hint: 'Warm, langsam, nur für dich' },
  { id: 'light', label: 'Ans Fenster, Tageslicht tanken', hint: 'Zwei Minuten Himmel anschauen' },
  { id: 'neck', label: 'Nacken sanft dehnen', hint: 'Ohr zur Schulter, links und rechts' },
  { id: 'hands', label: 'Hände ausschütteln', hint: 'Lockere Finger, lockerer Kopf' },
  { id: 'song', label: 'Ein Lieblingslied hören', hint: 'Drei Minuten gute Laune' },
  { id: 'desk', label: 'Den Schreibtisch kurz freiräumen', hint: 'Freier Tisch, freier Kopf' },
  { id: 'thanks', label: 'An etwas Schönes denken', hint: 'Was lief heute schon gut?' },
  { id: 'walk', label: 'Ein paar Schritte gehen', hint: 'Einmal durch die Wohnung oder ums Haus' },
  { id: 'smile', label: 'Kurz lächeln', hint: 'Auch wenn es albern ist. Es wirkt.' },
];

const SLOT_KEY = (day: string) => `todome:moments:${day}`;

function loadSlots(day: string): string[] {
  try {
    const raw = window.localStorage.getItem(SLOT_KEY(day));
    const ids = raw ? (JSON.parse(raw) as unknown) : null;
    if (Array.isArray(ids) && ids.length === 3 && ids.every((x) => MOMENT_POOL.some((m) => m.id === x))) return ids as string[];
  } catch {
    /* fall back to the defaults */
  }
  return ['shoulders', 'air', 'stand'];
}

/** Optional feel-good habits. No streaks, no counting, just a gentle tick. */
export function MicroRoutines({ state, now, onStart }: { state: AppState; now: Millis; onStart: (r: Routine) => void }) {
  const services = useServices();
  const day = dayKey(now);
  const done = state.wellbeing.routines[day] ?? [];
  const [slots, setSlots] = useState<string[]>(() => loadSlots(day));
  useEffect(() => setSlots(loadSlots(day)), [day]);
  const swap = (index: number) => {
    setSlots((cur) => {
      const used = new Set(cur);
      const start = MOMENT_POOL.findIndex((m) => m.id === cur[index]);
      let next = cur[index] ?? 'shoulders';
      for (let k = 1; k <= MOMENT_POOL.length; k++) {
        const cand = MOMENT_POOL[(start + k) % MOMENT_POOL.length];
        if (cand && !used.has(cand.id)) {
          next = cand.id;
          break;
        }
      }
      const out = cur.map((id, i) => (i === index ? next : id));
      try {
        window.localStorage.setItem(SLOT_KEY(day), JSON.stringify(out));
      } catch {
        /* per-day convenience only */
      }
      return out;
    });
  };
  const list: Array<{ r: Routine; slot: number | null }> = [
    ...ROUTINES.filter((r) => r.seconds).map((r) => ({ r, slot: null })),
    ...slots.map((id, i) => ({ r: MOMENT_POOL.find((m) => m.id === id) ?? MOMENT_POOL[0]!, slot: i })),
  ];
  return (
    <section className="card routines rise" aria-label="Micro-Routinen">
      <header className="card__head">
        <div>
          <h2>Kleine Wohlfühl-Momente</h2>
          <p className="muted">Freiwillig. Ohne Serien, ohne Zählen.</p>
        </div>
      </header>
      <ul className="routines__list">
        {list.map(({ r, slot }) => {
          const on = done.includes(r.id);
          return (
            <li key={`${slot ?? 't'}-${r.id}`} className={on ? 'is-done' : undefined}>
              <button
                type="button"
                className="routines__tick"
                role="checkbox"
                aria-checked={on}
                aria-label={r.label}
                onClick={() => services.store.dispatch({ type: 'routine/toggle', day, id: r.id })}
              >
                <IconCheck size={12} />
              </button>
              <div className="routines__text">
                <p>{r.label}</p>
                <span>{r.hint}</span>
              </div>
              {r.seconds && !on && (
                <button type="button" className="pill pill--sm" onClick={() => onStart(r)}>
                  Starten
                </button>
              )}
              {slot !== null && !on && (
                <button type="button" className="routines__swap" onClick={() => swap(slot)} title="Einen anderen Moment vorschlagen">
                  Anderer Moment
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Full-screen calm timer for a timed micro routine. */
export function RoutineTimer({ routine, onClose }: { routine: Routine; onClose: (completed: boolean) => void }) {
  const total = (routine.seconds ?? 60) * 1000;
  const [left, setLeft] = useState(total);
  const startedAt = useRef(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => {
      const l = Math.max(0, total - (Date.now() - startedAt.current));
      setLeft(l);
      if (l === 0) {
        window.clearInterval(id);
        window.setTimeout(() => onClose(true), 900);
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [total, onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const r = 90;
  const c = 2 * Math.PI * r;
  const sec = Math.ceil(left / 1000);
  const breathe = routine.id === 'breathe';
  return (
    <div className="pause-room" role="dialog" aria-modal="true" aria-label={routine.label}>
      <div className="standby__aura" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="pause-room__center">
        <svg className={`pause-room__ring${breathe && !prefersReducedMotion() ? ' is-breathing' : ''}`} viewBox="0 0 220 220" width="220" height="220" aria-hidden="true">
          <circle cx="110" cy="110" r={r} className="pause-room__track" />
          <circle cx="110" cy="110" r={r} className="pause-room__fill" strokeDasharray={c} strokeDashoffset={c * (left / total)} transform="rotate(-90 110 110)" />
        </svg>
        <p className="pause-room__time" aria-live="off">
          {Math.floor(sec / 60)}:{String(sec % 60).padStart(2, '0')}
        </p>
        <h2>{left === 0 ? 'Schön gemacht.' : routine.label}</h2>
        <p className="muted">{breathe ? 'Ein, und langsam aus. Der Kreis atmet mit dir.' : 'Schau in die Ferne. Lass die Schultern sinken. Hier gibt es gerade nichts zu tun.'}</p>
        <button type="button" className="pill pill--ghost" onClick={() => onClose(false)}>
          {left === 0 ? 'Zurück' : 'Lieber später'}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------
   Companion Hub: the avatar's glass home
   ------------------------------------------------------------------------ */

export function CompanionHome({ state, now, fgTaskId, onCustomize }: { state: AppState; now: Millis; fgTaskId: string | null; onCustomize: () => void }) {
  const services = useServices();
  const avatar = state.settings.companion.avatar;
  const running = fgTaskId ? state.tasks[fgTaskId] ?? null : null;
  const profile = energyProfile(state, now);
  const activity = running ? avatarActivity(state, now, running) : profile?.mode === 'low' ? 'tea' : 'writing';
  const energy = energyToday(state, now);
  return (
    <section className="card home-hub rise" aria-label="Dein Begleiter">
      <a className="home-hub__feedback" href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer" aria-label="Feedback zu ToDoMe. geben" title="Feedback geben">
        <IconChat size={16} />
      </a>
      <div className="home-hub__space" aria-hidden="true" />
      <div className="home-hub__house">
        <div className="home-hub__glow" aria-hidden="true" />
        <AvatarFx level={state.progression.stats.level} enabled={state.settings.appearance.companionFx}>
          <AvatarScene avatar={avatar} activity={activity} size={190} holo={holoFor(state.progression.stats.level, state.settings.appearance.companionFx)} />
        </AvatarFx>
        <div className="home-hub__floor" aria-hidden="true" />
      </div>
      <div className="home-hub__info">
        <h2 className="home-hub__name">{avatarName(avatar)}</h2>
        <p className="home-hub__doing">{ACTIVITY_LABELS[activity]}</p>
        <p className="muted small">{energy !== null ? `Heute bei ${energy} von 10, ${ENERGY_WORDS[energy]?.toLowerCase()}. ${profile?.label}.` : 'Erzähl mir, wie viel Energie du heute hast.'}</p>
        <div className="home-hub__actions">
          <button type="button" className="pill pill--sm" onClick={() => companionHello(services)}>
            Hallo sagen
          </button>
          <button type="button" className="pill pill--sm" onClick={() => services.store.dispatch({ type: 'wellbeing/water', at: now, day: dayKey(now), delta: 1 })}>
            Glas Wasser
          </button>
        </div>
        <button type="button" className="link-btn home-hub__customize" onClick={onCustomize}>
          Avatar anpassen
        </button>
        <p className="home-hub__since muted small">{running ? `Ihr arbeitet zusammen an „${running.title}“.` : 'Immer hier, wenn du mich brauchst.'}</p>
      </div>
    </section>
  );
}
