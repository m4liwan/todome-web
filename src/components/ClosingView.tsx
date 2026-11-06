import { useMemo, useState } from 'react';
import { useServices } from '../app/services';
import { uiSound } from '../app/uiSound';
import type { OpenModal } from '../app/modal';
import { netTodayMs } from '../domain/coach';
import { avatarName } from '../domain/companion';
import { theOneThing } from '../domain/energy';
import { findGaps, toTimeEntries, totalsByClient } from '../domain/reports';
import type { SessionProjection } from '../domain/session';
import { TASK_TYPE_ORDER, TASK_TYPES } from '../domain/taskTypes';
import type { AppState, Millis, Task, TaskType } from '../domain/types';
import { addDays, atTimeOfDay, dayKey, formatDuration, formatEuro, formatTime, MIN } from '../lib/time';
import { bookGap, deferTask } from '../state/commands';
import { AvatarScene } from './AvatarScene';
import { Select } from './Select';
import { businessShown, contextLabels } from '../domain/userContext';
import { trackEvent } from '../services/telemetry';

interface Props {
  state: AppState;
  projections: SessionProjection[];
  foreground: SessionProjection | null;
  now: Millis;
  onOpen: OpenModal;
  onBack: () => void;
}

/**
 * Feierabend: its own calm screen instead of a cramped dialog. Look at what
 * you did, note what you are proud of, choose tomorrow's first step, done.
 */
export function ClosingView({ state, projections, foreground, now, onOpen, onBack }: Props) {
  const labels = contextLabels(state.settings.userContext);
  const services = useServices();
  const today = dayKey(now);
  const closed = state.coach.closedDay === today;
  const [proud, setProud] = useState(() => state.wellbeing.proud[today] ?? '');
  const [next, setNext] = useState<string | null>(null);
  const [gapForm, setGapForm] = useState<{ from: Millis; to: Millis; title: string; clientId: string; type: TaskType } | null>(null);

  const entries = useMemo(() => toTimeEntries(state, projections).filter((e) => e.day === today), [state, projections, today]);
  const totals = totalsByClient(entries, state.clients);
  const net = netTodayMs(projections, now);
  const amount = totals.reduce((a, t) => a + t.amount, 0);
  const done = useMemo(() => {
    const ids = new Set(entries.filter((e) => e.outcome === 'achieved').map((e) => state.sessions[e.sessionId]?.taskId));
    return Object.values(state.tasks).filter((t) => t.status === 'done' && (ids.has(t.id) || t.plannedDay === today));
  }, [entries, state.sessions, state.tasks, today]);
  const openTasks = state.taskOrder
    .map((id) => state.tasks[id])
    .filter((t): t is Task => Boolean(t) && (t as Task).status === 'planned' && (t as Task).plannedDay <= addDays(today, 1));
  const suggestion = theOneThing(state, now);
  const chosen = next ?? suggestion?.id ?? null;
  const avatar = state.settings.companion.avatar;

  const firstStart = Math.min(...entries.map((e) => e.start), now);
  const gaps = findGaps(
    projections.filter((p) => dayKey(p.startedAt) === today),
    atTimeOfDay(now, state.settings.workdayStart),
    Math.min(now, atTimeOfDay(now, state.settings.workdayEnd)),
    10 * MIN,
    [[atTimeOfDay(now, state.settings.lunchStart), atTimeOfDay(now, state.settings.lunchEnd)]],
  ).filter(([s]) => s >= firstStart);

  const closeDay = () => {
    trackEvent('day_closed');
    const deps = services.deps();
    const tomorrow = addDays(today, 1);
    if (proud.trim()) services.store.dispatch({ type: 'wellbeing/mark', patch: { proud: { ...state.wellbeing.proud, [today]: proud.trim().slice(0, 280) } } });
    if (chosen) {
      services.run(deferTask(services.store.getState(), services.deps(), chosen, tomorrow));
      // Tomorrow's first step leads the plan.
      services.store.dispatch({ type: 'task/reorder', order: [chosen] });
    }
    services.store.dispatch({ type: 'coach/closeDay', day: today });
    const w = services.store.getState().wellbeing;
    services.store.dispatch({ type: 'wellbeing/mark', patch: { closedLog: { ...w.closedLog, [today]: true } } });
    for (const c of Object.values(services.store.getState().checkIns)) {
      if (c.kind === 'shutdown' && c.answeredAt === null && c.expiredAt === null) {
        services.store.dispatch({ type: 'checkin/answer', id: c.id, answer: 'system:closed', at: deps.now });
      }
    }
  };

  if (closed) {
    const first = state.taskOrder.map((id) => state.tasks[id]).find((t) => t && t.plannedDay > today && t.status === 'planned');
    return (
      <section className="closing closing--done" aria-label={labels.dayEnd}>
        <div className="closing__sky" aria-hidden="true" />
        <div className="closing__done">
          <AvatarScene avatar={avatar} activity="sleeping" size={150} />
          <h1>{labels.dayEndDone}</h1>
          <p className="closing__lead">
            {labels.doneLead(formatDuration(net))}
          </p>
          {first && <p className="muted">Morgen wartet „{first.title}“ geduldig auf dich. Mehr gibt es heute Abend nicht zu merken.</p>}
          <button type="button" className="pill pill--glass" onClick={onBack}>
            Zurück zur Übersicht
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="closing" aria-label={labels.dayEnd}>
      <div className="closing__sky" aria-hidden="true" />
      <div className="closing__inner">
        <header className="closing__head">
          <div>
            <p className="closing__kicker">{labels.dayEnd}</p>
            <h1>
              Schön, dass du heute da warst{state.settings.userName.trim() ? `, ${state.settings.userName.trim()}` : ''}.
            </h1>
            <p className="closing__lead">
              {net > 0
                ? `${formatDuration(net)} konzentriert gearbeitet${done.length ? `, ${done.length === 1 ? 'eine Sache' : `${done.length} Sachen`} abgeschlossen` : ''}. Ein Tag darf unperfekt sein und trotzdem richtig gut.`
                : 'Auch ein ruhiger Tag ist ein Tag, an dem du für dich gesorgt hast.'}
            </p>
          </div>
          <AvatarScene avatar={avatar} activity="tea" size={128} />
        </header>

        {foreground && (
          <p className="closing__note">
            „{state.tasks[foreground.taskId]?.title}“ läuft noch.
            <button type="button" className="pill pill--sm" onClick={() => onOpen({ kind: 'end_check', sessionId: foreground.sessionId })}>
              In Ruhe abschließen
            </button>
          </p>
        )}

        {done.length > 0 && (
          <div className="closing__block">
            <h2>Das hast du heute geschafft</h2>
            <ul className="closing__wins">
              {done.map((t, i) => (
                <li key={t.id} style={{ '--i': i } as React.CSSProperties}>
                  {t.title}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="closing__block">
          <label className="field">
            <h2>Worauf bist du heute stolz?</h2>
            <textarea
              rows={2}
              value={proud}
              maxLength={280}
              onChange={(e) => setProud(e.target.value)}
              placeholder="Darf auch klein sein. Ein Anruf, den du geführt hast. Ein Anfang, den du gewagt hast."
            />
          </label>
        </div>

        <div className="closing__block">
          <h2>Was ist morgen dein erster Schritt?</h2>
          {openTasks.length === 0 ? (
            <p className="muted">Nichts mehr offen. Morgen darfst du ganz frei starten.</p>
          ) : (
            <div className="closing__pick" role="radiogroup" aria-label="Erster Schritt für morgen">
              {openTasks.slice(0, 6).map((t) => (
                <button key={t.id} type="button" role="radio" aria-checked={chosen === t.id} className={`closing__option${chosen === t.id ? ' is-on' : ''}`} onClick={() => setNext(t.id)}>
                  <span className={`type-dot type--${t.type}`} aria-hidden="true" />
                  {t.title}
                </button>
              ))}
            </div>
          )}
          <p className="hint">Nur dieser eine Schritt steht morgen früh im Licht. Alles andere wartet geduldig.</p>
        </div>

        <details className="closing__block closing__times">
          <summary>
            Zeiten prüfen <span className="muted">{formatDuration(net)}{amount > 0 && businessShown(state) ? `, ${formatEuro(amount)} abrechenbar` : ''}</span>
          </summary>
          {totals.length > 0 && (
            <ul className="totals">
              {totals.map((t) => (
                <li key={t.clientId ?? 'internal'}>
                  <span>{t.clientName}</span>
                  <span className="num">{formatDuration(t.netMs)}</span>
                  <span className="num muted">{t.amount > 0 ? formatEuro(t.amount) : 'intern'}</span>
                </li>
              ))}
            </ul>
          )}
          {gaps.length === 0 ? (
            <p className="muted small">Keine Lücke über 10 Minuten. Sauber erfasst.</p>
          ) : (
            <ul className="gaps">
              {gaps.map(([s, e]) => (
                <li key={s}>
                  <span>
                    {formatTime(s)} bis {formatTime(e)} ({formatDuration(e - s)}) ohne Eintrag
                  </span>
                  <button type="button" className="pill pill--sm" onClick={() => setGapForm({ from: s, to: e, title: '', clientId: '', type: 'communication' })}>
                    Nachtragen
                  </button>
                </li>
              ))}
            </ul>
          )}
          {gapForm && (
            <form
              className="form form--grid gapform"
              onSubmit={(e) => {
                e.preventDefault();
                if (services.run(bookGap(state, services.deps(), { ...gapForm, clientId: gapForm.clientId || null }))) {
                  trackEvent('time_gap_booked', { task_type: gapForm.type, duration_min: Math.round((gapForm.to - gapForm.from) / MIN), has_client: Boolean(gapForm.clientId) });
                  setGapForm(null);
                }
              }}
            >
              <label className="field">
                <span>
                  Was war von {formatTime(gapForm.from)} bis {formatTime(gapForm.to)}?
                </span>
                <input autoFocus required value={gapForm.title} onChange={(e) => setGapForm({ ...gapForm, title: e.target.value })} placeholder="z. B. Mails Kunde B" />
              </label>
              <label className="field">
                <span>{labels.client}</span>
                <Select value={gapForm.clientId} onChange={(v) => setGapForm({ ...gapForm, clientId: v })}>
                  <option value="">Intern</option>
                  {Object.values(state.clients).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="field">
                <span>Art</span>
                <Select value={gapForm.type} onChange={(v) => setGapForm({ ...gapForm, type: v as TaskType })}>
                  {TASK_TYPE_ORDER.map((t) => (
                    <option key={t} value={t}>
                      {TASK_TYPES[t].label}
                    </option>
                  ))}
                </Select>
              </label>
              <div className="form__actions field--full">
                <button type="button" className="btn btn--quiet" onClick={() => setGapForm(null)}>
                  Abbrechen
                </button>
                <button type="submit" className="btn btn--primary">
                  Eintrag anlegen
                </button>
              </div>
            </form>
          )}
        </details>

        <div className="closing__actions">
          <button type="button" className="pill pill--ghost" onClick={onBack}>
            Doch noch nicht
          </button>
          <button
            type="button"
            className="pill pill--dark pill--lg"
            disabled={Boolean(foreground)}
            title={foreground ? 'Schließe zuerst den laufenden Block ab' : undefined}
            onClick={() => {
              uiSound(state, 'bloom');
              closeDay();
            }}
          >
            {labels.dayEndAction}
          </button>
        </div>
        <p className="closing__sign muted small">{avatarName(avatar)} sagt: Bis morgen. Du warst heute gut zu dir.</p>
      </div>
    </section>
  );
}
