import { useEffect, useState } from 'react';
import { useAppState, useNow } from '../../app/hooks';
import { useServices } from '../../app/services';
import type { Modal, OpenModal } from '../../app/modal';
import { projectSession } from '../../domain/session';
import type { Task } from '../../domain/types';
import { dayKey } from '../../lib/time';
import { addChecklistItem, extendSession, markWaiting, splitTask, stopSession } from '../../state/commands';
import { Dialog } from '../Dialog';
import { contextLabels } from '../../domain/userContext';

type Props = { modal: Extract<Modal, { kind: 'stuck' }> | null; onClose: () => void; onOpen: OpenModal };
type Cause = 'unclear' | 'info' | 'too_big' | 'energy';

const CAUSES: Array<{ id: Cause; label: string; hint: string }> = [
  { id: 'unclear', label: 'Unklar, was als Nächstes kommt', hint: 'Wir formulieren den kleinsten nächsten Schritt.' },
  { id: 'info', label: 'Info fehlt', hint: 'Rückfrage schicken, Aufgabe parken.' },
  { id: 'too_big', label: 'Zu groß', hint: 'In Teilschritte zerlegen.' },
  { id: 'energy', label: 'Keine Energie', hint: 'Gegen etwas Leichteres tauschen.' },
];

export function StuckDialog({ modal, onClose, onOpen }: Props) {
  const services = useServices();
  const state = useAppState();
  const labels = contextLabels(state.settings.userContext);
  const now = useNow();
  const [cause, setCause] = useState<Cause | null>(null);
  const [step, setStep] = useState('');
  const [question, setQuestion] = useState('');
  const [parts, setParts] = useState(['', '', '']);

  useEffect(() => {
    if (!modal) return;
    setCause(null);
    setStep('');
    setQuestion('');
    setParts(['', '', '']);
  }, [modal]);

  const p = modal ? projectSession(state, state.events, modal.sessionId, now) : null;
  const task = p ? state.tasks[p.taskId] : undefined;
  const client = task?.clientId ? state.clients[task.clientId] : undefined;
  const lighter = Object.values(state.tasks).filter(
    (t): t is Task => t.id !== task?.id && t.status === 'planned' && t.plannedDay === dayKey(now) && (t.type === 'admin' || t.type === 'communication'),
  );

  const draft = `Hallo${client ? ` ${client.name}` : ''},\n\nkurze Rückfrage zu „${task?.title ?? ''}“: ${question || '…'}\n\nSobald ich das habe, geht es direkt weiter.\n\nViele Grüße`;

  const run = (fn: () => boolean) => {
    if (fn()) onClose();
  };

  return (
    <Dialog open={Boolean(modal && p && task)} title="Was blockiert dich?" onClose={onClose} wide={cause === 'info'}>
      {!cause && (
        <div className="choices">
          {CAUSES.map((c) => (
            <button key={c.id} type="button" className="choice" onClick={() => setCause(c.id)}>
              <strong>{c.id === 'info' ? labels.infoMissing : c.label}</strong>
              <span>{c.hint}</span>
            </button>
          ))}
        </div>
      )}

      {cause === 'unclear' && modal && task && (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => {
              const deps = services.deps();
              if (!services.run(addChecklistItem(state, deps, task.id, step, true))) return false;
              services.announce('Notiert. 10 Minuten nur dafür, dann sehen wir weiter.');
              return true;
            });
          }}
        >
          <label className="field">
            <span>Was ist der allerkleinste Schritt, den du in 10 Minuten schaffst?</span>
            <input autoFocus required value={step} onChange={(e) => setStep(e.target.value)} maxLength={140} placeholder="z. B. Fehlertext für abgelehnte Karte formulieren" />
          </label>
          <div className="form__actions">
            <button type="button" className="btn btn--quiet" onClick={() => setCause(null)}>
              Zurück
            </button>
            <button type="submit" className="btn btn--primary">
              Als nächsten Schritt setzen
            </button>
          </div>
        </form>
      )}

      {cause === 'info' && modal && task && (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => services.run(markWaiting(state, services.deps(), modal.sessionId, question || labels.askBack)));
          }}
        >
          <label className="field">
            <span>Was genau fehlt dir?</span>
            <input autoFocus required value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={200} placeholder="z. B. Welche Zahlungsarten sollen angeboten werden?" />
          </label>
          <label className="field">
            <span>Entwurf für deine Rückfrage</span>
            <textarea rows={7} readOnly value={draft} />
          </label>
          <div className="form__actions">
            <button type="button" className="btn btn--quiet" onClick={() => setCause(null)}>
              Zurück
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                navigator.clipboard?.writeText(draft).then(
                  () => services.announce('Entwurf kopiert.'),
                  () => services.announce('Kopieren nicht möglich – markiere den Text manuell.'),
                );
              }}
            >
              Entwurf kopieren
            </button>
            <button type="submit" className="btn btn--primary">
              Aufgabe parken
            </button>
          </div>
        </form>
      )}

      {cause === 'too_big' && modal && task && (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => {
              if (!services.run(stopSession(state, services.deps(), modal.sessionId, 'partial'))) return false;
              return services.run(splitTask(services.store.getState(), services.deps(), task.id, parts));
            });
          }}
        >
          <p className="muted">„{task.title}“ wird durch die Teilschritte ersetzt. Die bisherige Zeit bleibt erfasst.</p>
          {parts.map((v, i) => (
            <label key={i} className="field">
              <span>Teilschritt {i + 1}</span>
              <input
                autoFocus={i === 0}
                value={v}
                required={i < 2}
                maxLength={120}
                onChange={(e) => setParts((ps) => ps.map((x, j) => (j === i ? e.target.value : x)))}
              />
            </label>
          ))}
          <div className="form__actions">
            <button type="button" className="btn btn--quiet" onClick={() => setCause(null)}>
              Zurück
            </button>
            <button type="submit" className="btn btn--primary">
              Zerlegen
            </button>
          </div>
        </form>
      )}

      {cause === 'energy' && modal && task && (
        <div className="form">
          <p>Völlig okay. Tausch gegen etwas Leichtes und komm später mit frischem Kopf zurück.</p>
          {lighter.length > 0 ? (
            <ul className="choices">
              {lighter.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className="choice"
                    onClick={() => {
                      if (services.run(stopSession(state, services.deps(), modal.sessionId, 'partial'))) onOpen({ kind: 'start', taskId: t.id });
                    }}
                  >
                    <strong>{t.title}</strong>
                    <span>{t.estimateMin} min</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Keine leichte Aufgabe im Plan. Wie wäre eine echte Pause?</p>
          )}
          <div className="form__actions">
            <button type="button" className="btn btn--quiet" onClick={() => setCause(null)}>
              Zurück
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => run(() => services.run(extendSession(state, services.deps(), modal.sessionId, 10)))}
              title="Timebox um 10 Minuten verlängern"
            >
              Noch 10 min probieren
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
