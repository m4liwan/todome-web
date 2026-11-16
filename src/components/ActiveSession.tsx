import { useEffect, useRef, useState } from 'react';
import { speak, timerAnnouncement, type TimerSnapshot } from '../lib/a11y';
import { useServices } from '../app/services';
import type { OpenModal } from '../app/modal';
import { avatarName, PRIORITY_LABELS } from '../domain/companion';
import { ACTIVITY_LABELS, avatarActivity, energyProfile, theOneThing } from '../domain/energy';
import { PAUSE_REASON_LABELS } from '../domain/copy';
import { MAX_STACK_DEPTH, sessionStack, type SessionProjection } from '../domain/session';
import { typeLabel } from '../domain/taskTypes';
import type { AppState, Millis, Task } from '../domain/types';
import { dayKey, formatClock, formatDuration, formatTime, MIN } from '../lib/time';
import { AvatarScene } from './AvatarScene';
import { FocusProgress } from './FocusProgress';
import { addChecklistItem, pauseSession, toggleChecklistItem } from '../state/commands';
import { Avatar } from './Avatar';
import { FOCUS_TIMER_LOCKED, FocusStyleMenu } from './FocusStyle';
import { PomodoroClock } from './PomodoroClock';
import { effectiveFocusStyle, focusTimerUnlocked } from '../app/focusTimer';
import { pomodoroPhase } from '../domain/pomodoro';
import { IconCheck, IconHelp, IconPause, IconPlay, IconPlus, IconStop, IconSwap } from './icons';
import { contextLabels } from '../domain/userContext';
import { trackEvent } from '../services/telemetry';

interface Props {
  state: AppState;
  projections: SessionProjection[];
  foreground: SessionProjection | null;
  now: Millis;
  onOpen: OpenModal;
  /** Show the whole plan (the "something else" escape hatch). */
  onShowPlan: () => void;
  /** "Durchatmen": everything fades, only the breathing companion stays. */
  onBreathe: () => void;
}


/** The hero of the dashboard: the running session on a living colour field. */
export function ActiveSession({ state, projections, foreground, now, onOpen, onShowPlan, onBreathe }: Props) {
  const stack = sessionStack(projections);
  useTimerAnnouncements(state, foreground);
  return (
    <section aria-label="Aktuelle Session">
      {foreground ? (
        <FocusCard state={state} p={foreground} now={now} onOpen={onOpen} stackDepth={stack.length} onBreathe={onBreathe} />
      ) : (
        <OneThing state={state} now={now} onOpen={onOpen} onShowPlan={onShowPlan} returnTo={stack[stack.length - 1] ?? null} />
      )}
      {(foreground ? stack.length > 0 : stack.length > 1) && (
        <div className="stack card">
          <p className="stack__title">
            Wartet auf deine Rückkehr <span className="muted">{stack.length}/{MAX_STACK_DEPTH}</span>
          </p>
          <ul>
            {stack.map((p) => {
              const task = state.tasks[p.taskId];
              const client = task?.clientId ? state.clients[task.clientId] : undefined;
              return (
                <li key={p.sessionId}>
                  <div className="stack__text">
                    <strong>{task?.title}</strong>
                    <span className="muted small">
                      {client ? `${client.name}, ` : ''}wartet geduldig seit {formatTime(p.currentInterruption?.since ?? now)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn--small"
                    disabled={Boolean(foreground)}
                    title={foreground ? 'Beende zuerst die aktuelle Session' : undefined}
                    onClick={() => onOpen({ kind: 'reentry', sessionId: p.sessionId, mode: 'return' })}
                  >
                    Zurückkehren
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}


/**
 * Radical micro-commitment: when nothing runs, the home screen shows only
 * THE one doable thing, never the full list.
 */
/** Tells screen readers about the running block at calm moments only (see lib/a11y). */
function useTimerAnnouncements(state: AppState, p: SessionProjection | null) {
  const last = useRef<TimerSnapshot | null>(null);
  const snap: TimerSnapshot | null = p
    ? { sessionId: p.sessionId, status: p.status, remainingMs: p.effectiveTimeboxMin * MIN - p.netMs, task: state.tasks[p.taskId]?.title ?? 'Aufgabe' }
    : null;
  const key = snap ? `${snap.sessionId}|${snap.status}|${Math.ceil(snap.remainingMs / 60_000)}` : 'none';
  useEffect(() => {
    const message = timerAnnouncement(last.current, snap);
    last.current = snap;
    if (message) speak(message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

function OneThing({ state, now, onOpen, onShowPlan, returnTo }: { state: AppState; now: Millis; onOpen: OpenModal; onShowPlan: () => void; returnTo: SessionProjection | null }) {
  const back = returnTo ? state.tasks[returnTo.taskId] ?? null : null;
  const one = back ?? theOneThing(state, now);
  const hasStack = Boolean(back);
  const profile = energyProfile(state, now);
  const avatar = state.settings.companion.avatar;
  const client = one?.clientId ? state.clients[one.clientId] : undefined;
  const carried = one ? one.plannedDay < dayKey(now) : false;
  // Low energy: a calming tea. Otherwise a focused notepad, ready to start.
  const activity = profile?.mode === 'low' ? 'tea' : 'writing';
  return (
    <article className="focus focus--one" data-state="idle">
      <div className="focus__inner">
        <div className="one">
          <div className="one__text">
            <p className="one__label">{hasStack ? 'Kurz durchatmen' : one ? 'Dein nächster Schritt' : 'Ein freier Moment'}</p>
            <h2 className="one__title">{one ? one.title : 'Was wäre heute ein guter erster Schritt?'}</h2>
            <p className="one__lead">
              {back
                ? 'Wartet geduldig, genau da, wo du aufgehört hast.'
                : one
                ? carried
                  ? 'Wartet geduldig auf dich. Ganz ohne Druck.'
                  : profile?.micro
                    ? 'Nur ein kleiner Anfang. Fünf Minuten zählen schon.'
                    : 'Mehr braucht es gerade nicht in deinem Kopf.'
                : 'Eine Sache reicht. Der Rest findet sich.'}
            </p>
            {one && (
              <p className="one__meta">
                {typeLabel(one)}
                {client ? `, für ${client.name}` : ''}
                {one.priority === 'high' && <span className="chip chip--xs">{PRIORITY_LABELS.high}</span>}
                {state.settings.brain === 'procrastination' && (
                  <span className="chip chip--xs" title="Gut genug ist fertig. Ein unperfekter Anfang zählt.">
                    80 % reichen
                  </span>
                )}
              </p>
            )}
            <div className="focus__actions">
              {returnTo && back ? (
                <button type="button" className="btn btn--primary btn--large" onClick={() => onOpen({ kind: 'reentry', sessionId: returnTo.sessionId, mode: 'return' })}>
                  <IconPlay size={16} /> Sanft zurückkehren
                </button>
              ) : one ? (
                <button type="button" className="btn btn--primary btn--large" onClick={() => onOpen({ kind: 'start', taskId: one.id })}>
                  <IconPlay size={16} /> Ankommen und starten
                </button>
              ) : (
                <button type="button" className="btn btn--primary btn--large" onClick={() => onOpen({ kind: 'task', taskId: null })}>
                  <IconPlus size={16} /> Ersten Schritt notieren
                </button>
              )}
              {one && (
                <button type="button" className="btn" onClick={onShowPlan}>
                  Lieber etwas anderes
                </button>
              )}
            </div>
          </div>
          <figure className="one__buddy">
            <AvatarScene avatar={avatar} activity={activity} size={132} />
            <figcaption>
              {avatarName(avatar)} {ACTIVITY_LABELS[activity]}
            </figcaption>
          </figure>
        </div>
      </div>
    </article>
  );
}

function FocusCard({ state, p, now, onOpen, stackDepth, onBreathe }: { state: AppState; p: SessionProjection; now: Millis; onOpen: OpenModal; stackDepth: number; onBreathe: () => void }) {
  const labels = contextLabels(state.settings.userContext);
  const services = useServices();
  // A stored "pomodoro" below level 10 behaves like the breathing focus.
  const style = effectiveFocusStyle(state);
  const timerUnlocked = focusTimerUnlocked(state);
  const timer = style === 'pomodoro' ? pomodoroPhase(state, p, now) : null;
  const [newStep, setNewStep] = useState('');
  const task = state.tasks[p.taskId];
  if (!task) return null;
  const client = task.clientId ? state.clients[task.clientId] : undefined;
  const paused = p.status === 'paused';
  const timeboxMs = p.effectiveTimeboxMin * MIN;
  const remaining = timeboxMs - p.netMs;
  const over = remaining < 0;
  const progress = Math.min(1, p.netMs / Math.max(1, timeboxMs));
  const parent = p.parentSessionId ? state.tasks[state.sessions[p.parentSessionId]?.taskId ?? ''] : undefined;
  const stateName = paused ? 'paused' : over ? 'over' : 'running';
  const doneCount = task.checklist.filter((i) => i.doneAt !== null).length;
  const activity = paused ? 'tea' : avatarActivity(state, now, task);

  const pause = () => {
    if (services.run(pauseSession(state, services.deps(), p.sessionId))) {
      trackEvent('focus_paused', { task_type: task.type });
      onOpen({ kind: 'pause', sessionId: p.sessionId });
    }
  };

  return (
    <article className="focus" data-state={stateName}>
      <div className="focus__inner">
        <div className="focus__top">
          <div className="chips">
            <span className="chip">
              {typeLabel(task)}
            </span>
            {client && <span className="chip">{client.name}</span>}
            {task.priority === 'high' && <span className="chip chip--accent">{PRIORITY_LABELS.high}</span>}
            {task.billable && client && <span className="chip">abrechenbar</span>}
          </div>
          <span className={`status-pill status-pill--${stateName}`}>
            {timer?.kind === 'break' ? PAUSE_REASON_LABELS.pomodoro : paused ? labels.breakShort : over ? 'Länger als geplant' : 'Im Fluss'}
          </span>
        </div>

        <h2 className="focus__title">{task.title}</h2>
        {parent && <p className="focus__sub">Unterbricht: {parent.title}</p>}

        <div className="focus__row">
        <div className="focus__clock">
          {timer ? (
            <PomodoroClock phase={timer} />
          ) : (
          <>
          <span className="focus__time" role="timer" aria-live="off" aria-label={over ? `${formatDuration(-remaining)} über Plan` : `${formatDuration(remaining)} übrig`}>
            {formatClock(remaining)}
          </span>
          <span className="focus__clock-label">
            {paused
              ? `Pause seit ${formatDuration(now - (p.currentPause?.since ?? now))}${p.currentPause && p.currentPause.reason !== 'none' ? `, ${PAUSE_REASON_LABELS[p.currentPause.reason]}` : ''}`
              : over
                ? 'länger als geplant, ganz okay'
                : `übrig von ${p.effectiveTimeboxMin} min`}
          </span>
          </>
          )}
        </div>

        <span className="focus__dot" aria-hidden="true" title={`${avatarName(state.settings.companion.avatar)} ist bei dir`}>
          <Avatar id={state.settings.companion.avatar} mood="calm" size={30} animated={false} crop />
        </span>
        <figure className="focus__buddy">
          <AvatarScene avatar={state.settings.companion.avatar} activity={activity} size={104} />
          <figcaption>
            {avatarName(state.settings.companion.avatar)} {ACTIVITY_LABELS[activity]}
          </figcaption>
        </figure>
        </div>

        <FocusProgress
          style={state.settings.appearance.timeline}
          progress={progress}
          paused={paused}
          plannedMin={p.effectiveTimeboxMin}
          doneMin={Math.round(p.netMs / MIN)}
        />

        <div className="focus__grid">
          <dl className="facts">
            <div>
              <dt>Konzentriert</dt>
              <dd>{formatDuration(p.netMs)}</dd>
            </div>
            <div>
              <dt>Pausen</dt>
              <dd>{formatDuration(p.pauseMs)}</dd>
            </div>
            {p.extendedMin > 0 && (
              <div>
                <dt>Verlängert</dt>
                <dd>+{p.extendedMin} min</dd>
              </div>
            )}
            <div className="facts__goal">
              <dt>Dein Ziel, 80 % reichen</dt>
              <dd>{p.intention}</dd>
            </div>
          </dl>

          {style === 'micro' ? (
            <NextHandle task={task} state={state} />
          ) : (
          <div className="steps">
            <p className="steps__title">
              Schritte <span className="muted">{task.checklist.length ? `${doneCount}/${task.checklist.length}` : ''}</span>
            </p>
            <ul>
              {task.checklist.map((item) => (
                <li key={item.id}>
                  <label className={`step${item.doneAt !== null ? ' is-done' : ''}`}>
                    <input
                      type="checkbox"
                      checked={item.doneAt !== null}
                      onChange={() => services.run(toggleChecklistItem(state, services.deps(), task.id, item.id))}
                    />
                    <span className="step__label">{item.label}</span>
                  </label>
                </li>
              ))}
            </ul>
            <form
              className="steps__add"
              onSubmit={(e) => {
                e.preventDefault();
                if (services.run(addChecklistItem(state, services.deps(), task.id, newStep))) setNewStep('');
              }}
            >
              <IconPlus size={14} />
              <input value={newStep} onChange={(e) => setNewStep(e.target.value)} placeholder="Nächsten Schritt notieren" aria-label="Schritt hinzufügen" />
            </form>
          </div>
          )}
        </div>

        <div className="focus__actions">
          {paused ? (
            <button type="button" className="btn btn--primary btn--large" onClick={() => onOpen({ kind: 'reentry', sessionId: p.sessionId, mode: 'resume' })}>
              <IconPlay size={16} /> Weiterarbeiten
            </button>
          ) : (
            <button type="button" className="btn btn--primary btn--large" onClick={pause}>
              <IconPause size={16} /> {labels.breakName}
            </button>
          )}
          <button
            type="button"
            className="btn"
            onClick={() => onOpen({ kind: 'interrupt', sessionId: p.sessionId })}
            disabled={stackDepth >= MAX_STACK_DEPTH}
            title={stackDepth >= MAX_STACK_DEPTH ? `Maximal ${MAX_STACK_DEPTH} Unterbrechungen` : 'Andere Arbeit dazwischen, z. B. ein Kundenanruf'}
          >
            <IconSwap size={16} /> Unterbrechung
          </button>
          {!paused && (
            <button type="button" className="btn" onClick={() => onOpen({ kind: 'stuck', sessionId: p.sessionId })}>
              <IconHelp size={16} /> Hänge fest
            </button>
          )}
          <button type="button" className="btn" onClick={() => onOpen({ kind: 'end_check', sessionId: p.sessionId })}>
            <IconStop size={14} /> Beenden
          </button>
          <FocusStyleMenu
            value={style}
            timerUnlocked={timerUnlocked}
            onLocked={() => services.announce(FOCUS_TIMER_LOCKED)}
            onChange={(focusStyle) => services.store.dispatch({ type: 'settings/update', patch: { appearance: { ...state.settings.appearance, focusStyle } } })}
          />
          <button type="button" className="btn focus__breathe" onClick={onBreathe} title="Alles ausblenden und kurz durchatmen">
            Durchatmen
          </button>
        </div>
      </div>
    </article>
  );
}

/** Mikro-Schritt-Modus: only the current bite is visible, one tap moves on. */
/**
 * Mikro-Schritt: one handhold at a time, always your own. The next open step
 * of the task stands large with a check; when there is none, one quiet field
 * asks for your real next handhold (it becomes a step of the task). No
 * generic suggestions: only what you wrote yourself.
 */
function NextHandle({ task, state }: { task: Task; state: AppState }) {
  const services = useServices();
  const [next, setNext] = useState('');
  const items = task.checklist;
  const current = items.find((i) => i.doneAt === null) ?? null;
  const done = items.filter((i) => i.doneAt !== null).length;
  return (
    <div className="bites" aria-live="polite">
      <p className="steps__title">
        Dein nächster Handgriff {items.length > 0 && <span className="muted">{`${done}/${items.length}`}</span>}
      </p>
      {current ? (
        <>
          <p className="bites__now">{current.label}</p>
          <button type="button" className="btn btn--primary bites__done" onClick={() => services.run(toggleChecklistItem(state, services.deps(), task.id, current.id))}>
            <IconCheck size={14} /> Geschafft
          </button>
        </>
      ) : (
        <form
          className="bites__anchor"
          onSubmit={(e) => {
            e.preventDefault();
            if (services.run(addChecklistItem(state, services.deps(), task.id, next))) setNext('');
          }}
        >
          {items.length > 0 && <p className="bites__now">Alles geschafft, was du dir vorgenommen hast. Schön.</p>}
          <input value={next} onChange={(e) => setNext(e.target.value)} placeholder="Was tust du als Nächstes, ganz konkret?" aria-label="Dein nächster Handgriff" />
        </form>
      )}
    </div>
  );
}
