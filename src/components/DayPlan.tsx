import { useServices } from '../app/services';
import type { OpenModal } from '../app/modal';
import { PRIORITY_LABELS } from '../domain/companion';
import { energyProfile, theOneThing } from '../domain/energy';
import { estimationFactor } from '../domain/reports';
import type { SessionProjection } from '../domain/session';
import { typeLabel } from '../domain/taskTypes';
import type { AppState, Millis, Task } from '../domain/types';
import { addDays, atTimeOfDay, dayKey, formatDuration, formatTime, MIN } from '../lib/time';
import { deferTask, updateTask } from '../state/commands';
import { IconMoveTomorrow, IconPencil, IconPlay, IconPlus } from './icons';
import { contextLabels } from '../domain/userContext';

interface Props {
  state: AppState;
  projections: SessionProjection[];
  foreground: SessionProjection | null;
  now: Millis;
  onOpen: OpenModal;
  /** Collapsed by default: the home screen shows only the one thing. */
  expanded: boolean;
  onToggle: () => void;
}

/**
 * The rest of the day, deliberately quiet. Collapsed it only hints at what
 * waits after the one thing; expanded it is the full, editable plan.
 */
export function DayPlan({ state, projections, foreground, now, onOpen, expanded, onToggle }: Props) {
  const labels = contextLabels(state.settings.userContext);
  const services = useServices();
  const today = dayKey(now);
  const ordered = state.taskOrder.map((id) => state.tasks[id]).filter((t): t is Task => Boolean(t));
  const rank = { high: 0, normal: 1, low: 2 } as const;
  const open = ordered
    .filter((t) => t.plannedDay === today && (t.status === 'planned' || t.status === 'in_progress'))
    .sort((a, b) => (a.status === 'in_progress' ? -1 : b.status === 'in_progress' ? 1 : rank[a.priority] - rank[b.priority]));
  const waiting = ordered.filter((t) => t.status === 'waiting');
  const done = ordered.filter((t) => t.plannedDay === today && t.status === 'done');
  const carried = ordered.filter((t) => t.plannedDay < today && t.status === 'planned');

  const corrected = (t: Task) => Math.round((t.estimateMin * (estimationFactor(state, projections, t.type, t.clientId) ?? 1)) / 5) * 5;
  const workLeft = Math.max(0, atTimeOfDay(now, state.settings.workdayEnd) - now);
  const planned = open.reduce((acc, t) => acc + corrected(t) * MIN, 0);
  const buffer = energyProfile(state, now)?.bufferRatio ?? 0.2;
  const capacity = workLeft * (1 - buffer);
  const one = foreground ? state.tasks[foreground.taskId] ?? null : theOneThing(state, now);
  const after = [...carried, ...open].filter((t) => t.id !== one?.id);
  const load = capacity > 0 ? planned / capacity : planned > 0 ? 2 : 0;
  const total = open.length + done.length;

  return (
    <section id="plan" className={`card plan rise${expanded ? ' is-expanded' : ''}`} style={{ '--i': 3 } as React.CSSProperties} aria-label="Tagesplan">
      <header className="card__head">
        <div>
          <h2>{expanded ? 'Dein Tag' : 'Danach'}</h2>
          <p className="muted">
            {total === 0 ? 'Noch nichts geplant' : done.length > 0 ? `${done.length} ${done.length === 1 ? 'Sache' : 'Sachen'} schon geschafft` : 'Eins nach dem anderen'}
          </p>
        </div>
        <button type="button" className="round-btn round-btn--dark" aria-label="Aufgabe anlegen" title="Aufgabe anlegen" onClick={() => onOpen({ kind: 'task', taskId: null })}>
          <IconPlus size={18} />
        </button>
      </header>

      {!expanded ? (
        <div className="later">
          {after.length === 0 ? (
            <p className="later__empty">{one ? 'Danach ist erst mal frei. Schön.' : 'Noch nichts geplant. Ganz entspannt.'}</p>
          ) : state.settings.oneStep ? (
            <p className="later__empty">
              {after.length === 1 ? 'Eine Sache wartet' : `${after.length} Sachen warten`} geduldig. Heute zählt nur der nächste Schritt.
            </p>
          ) : (
            <ul className="later__list">
              {after.slice(0, 2).map((t) => (
                <li key={t.id}>
                  <span className={`type-dot type--${t.type}`} aria-hidden="true" />
                  <span className="later__title">{t.title}</span>
                  <span className="later__note">wartet geduldig</span>
                </li>
              ))}
              {after.length > 2 && <li className="later__more">und {after.length - 2} weitere, ganz in Ruhe</li>}
            </ul>
          )}
          <div className="later__actions">
            <button type="button" className="pill pill--sm" onClick={onToggle} aria-expanded={false}>
              Ganzen Plan zeigen
            </button>
          </div>
        </div>
      ) : (
      <>
      {open.length > 0 && (
        <div className={`capacity${load > 1 ? ' is-over' : ''}`}>
          <div className="capacity__bar" aria-hidden="true">
            <span style={{ width: `${Math.min(100, load * 100)}%` }} />
          </div>
          <p>
            {load > 1
              ? `${formatDuration(planned)} geplant, ${formatDuration(workLeft)} ${labels.untilDayEnd}. Magst du etwas auf morgen legen? Das ist klug, nicht schwach.`
              : `${formatDuration(planned)} geplant, passt mit Puffer.`}
          </p>
        </div>
      )}

      {carried.length > 0 && (
        <div className="plan__group">
          <p className="plan__label">Wartet geduldig auf dich</p>
          <ul className="tasks">
            {carried.map((t) => (
              <li key={t.id} className="task task--muted">
                <TaskLine task={t} state={state} minutes={corrected(t)} />
                <button type="button" className="pill pill--sm" onClick={() => services.run(updateTask(state, services.deps(), t.id, { plannedDay: today }))}>
                  Auf heute
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {open.length === 0 && carried.length === 0 ? (
        <div className="empty">
          <p>Was zählt heute wirklich? Eine Sache reicht für den Anfang.</p>
          <button type="button" className="pill pill--dark" onClick={() => onOpen({ kind: 'task', taskId: null })}>
            <IconPlus size={16} /> Ersten Schritt notieren
          </button>
        </div>
      ) : (
        <ul className="tasks">
          {open.map((t, i) => {
            const running = foreground?.taskId === t.id;
            const minutes = corrected(t);
            return (
              <li key={t.id} className={`task${running ? ' is-running' : ''}`} style={{ '--i': i } as React.CSSProperties}>
                <TaskLine task={t} state={state} minutes={minutes} adjusted={minutes !== t.estimateMin} />
                <div className="task__actions">
                  {!running && (
                    <>
                      <button type="button" className="icon-ghost" aria-label={`${t.title} bearbeiten`} title="Bearbeiten" onClick={() => onOpen({ kind: 'task', taskId: t.id })}>
                        <IconPencil size={16} />
                      </button>
                      <button
                        type="button"
                        className="icon-ghost"
                        aria-label={`${t.title} auf morgen schieben`}
                        title="Auf morgen"
                        onClick={() => {
                          if (services.run(deferTask(state, services.deps(), t.id, addDays(today, 1)))) services.announce(`„${t.title}“ liegt jetzt auf morgen.`);
                        }}
                      >
                        <IconMoveTomorrow size={16} />
                      </button>
                    </>
                  )}
                  {running ? (
                    <span className="live-badge">
                      <span /> läuft
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="play-btn"
                      aria-label={`${t.title} starten`}
                      title={foreground ? 'Es läuft bereits eine Session' : 'Starten'}
                      disabled={Boolean(foreground)}
                      onClick={() => onOpen({ kind: 'start', taskId: t.id })}
                    >
                      <IconPlay size={14} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {waiting.length > 0 && (
        <details className="plan__fold">
          <summary>Wartet auf Rückmeldung ({waiting.length})</summary>
          <ul className="tasks">
            {waiting.map((t) => (
              <li key={t.id} className="task task--muted">
                <TaskLine task={t} state={state} minutes={t.estimateMin} />
                <button type="button" className="pill pill--sm" onClick={() => services.run(updateTask(state, services.deps(), t.id, { status: 'planned', plannedDay: today }))}>
                  Aufnehmen
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {done.length > 0 && (
        <details className="plan__fold">
          <summary>Geschafft ({done.length})</summary>
          <ul className="tasks">
            {done.map((t) => (
              <li key={t.id} className="task task--done">
                <TaskLine task={t} state={state} minutes={t.estimateMin} />
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="later__actions">
        <button type="button" className="pill pill--sm pill--ghost" onClick={onToggle} aria-expanded>
          Wieder einklappen
        </button>
      </div>
      </>
      )}
    </section>
  );
}

function TaskLine({ task, state, minutes, adjusted }: { task: Task; state: AppState; minutes: number; adjusted?: boolean }) {
  const client = task.clientId ? state.clients[task.clientId] : undefined;
  return (
    <div className="task__main">
      <span className={`type-dot type--${task.type}`} title={typeLabel(task)} aria-hidden="true" />
      <div className="task__text">
        <p className="task__title">
          {task.title}
          {task.priority === 'high' && <span className="chip chip--lime chip--xs">{PRIORITY_LABELS.high}</span>}
        </p>
        <p className="task__meta">
          {client ? client.name : 'Intern'}
          <span aria-hidden="true"> · </span>
          <span title={adjusted ? `Geschätzt ${task.estimateMin} min, mit deinem Schätzfaktor ${minutes} min` : undefined}>
            {minutes} min{adjusted ? '*' : ''}
          </span>
          {task.plannedStart !== null && (
            <>
              <span aria-hidden="true"> · </span>ab {formatTime(task.plannedStart)}
            </>
          )}
        </p>
      </div>
    </div>
  );
}
