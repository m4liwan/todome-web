import { useEffect, useState } from 'react';
import { useAppState, useNow } from '../../app/hooks';
import { useServices } from '../../app/services';
import { askHowItFelt, celebrate } from '../../app/companion';
import type { Modal, OpenModal } from '../../app/modal';
import { energyCopy, energyMode, energyToday } from '../../domain/energy';
import { projectSession } from '../../domain/session';
import type { SessionOutcome } from '../../domain/types';
import { formatDuration, MIN } from '../../lib/time';
import { correctSession, extendSession, stopSession, updateTask } from '../../state/commands';
import { Dialog } from '../Dialog';
import { contextLabels } from '../../domain/userContext';
import { trackEvent } from '../../services/telemetry';

type SessionModal<K extends Modal['kind']> = Extract<Modal, { kind: K }> | null;

function useSession(sessionId: string | undefined) {
  const state = useAppState();
  const now = useNow();
  const p = sessionId ? projectSession(state, state.events, sessionId, now) : null;
  const task = p ? state.tasks[p.taskId] : undefined;
  return { state, now, p, task };
}

/** End-Check: "Ziel erreicht?" – yes / partially (rest becomes a note) / no. */
export function EndCheckDialog({ modal, onClose, onOpen }: { modal: SessionModal<'end_check'>; onClose: () => void; onOpen: OpenModal }) {
  const services = useServices();
  const { state, p, task } = useSession(modal?.sessionId);
  const [outcome, setOutcome] = useState<SessionOutcome | null>(null);
  const [rest, setRest] = useState('');

  useEffect(() => {
    setOutcome(null);
    setRest('');
  }, [modal]);

  if (!modal || !p || !task || p.status === 'stopped') return <Dialog open={false} title="" onClose={onClose}>{null}</Dialog>;

  const finish = (o: SessionOutcome) => {
    const stopped = services.run(stopSession(state, services.deps(), p.sessionId, o, { restNote: rest }));
    if (!stopped) return;
    trackEvent('focus_finished', { outcome: o, task_type: task.type, duration_min: Math.round(p.netMs / MIN) });
    services.announce(`Session beendet: ${formatDuration(p.netMs)} netto erfasst.`);
    // The companion asks how it felt; without companion a short celebration stays.
    if (!askHowItFelt(services, p.sessionId, task.title, o === 'achieved') && o === 'achieved') celebrate(services, task.title);
    // Back to the interrupted session, if this one was an interruption.
    const parent = p.parentSessionId;
    const after = parent ? projectSession(services.store.getState(), services.store.getState().events, parent, services.clock.now()) : null;
    if (parent && after?.status === 'interrupted') onOpen({ kind: 'reentry', sessionId: parent, mode: 'return' });
    else onClose();
  };

  return (
    <Dialog open title="Wie ist es gelaufen?" tone="focus" onClose={onClose}>
      <p className="lead">„{task.intention || p.intention}“</p>
      <p className="muted">
        {formatDuration(p.netMs)} konzentrierte Arbeit. {energyCopy(energyMode(energyToday(state, services.clock.now()))).endLine}
      </p>
      {outcome === null ? (
        <div className="choices choices--row">
          <button type="button" className="choice choice--good" autoFocus onClick={() => finish('achieved')}>
            <strong>Geschafft</strong>
            <span>80 % reichen völlig</span>
          </button>
          <button type="button" className="choice" onClick={() => setOutcome('partial')}>
            <strong>Ein gutes Stück</strong>
            <span>Der Rest darf warten</span>
          </button>
          <button type="button" className="choice" onClick={() => setOutcome('not_achieved')}>
            <strong>Noch nicht</strong>
            <span>Und das ist okay</span>
          </button>
        </div>
      ) : (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            finish(outcome);
          }}
        >
          <label className="field">
            <span>{outcome === 'partial' ? 'Was darf beim nächsten Mal weitergehen?' : 'Magst du kurz notieren, was dazwischenkam? (optional)'}</span>
            <input autoFocus value={rest} onChange={(e) => setRest(e.target.value)} maxLength={200} />
          </label>
          <div className="form__actions">
            <button type="button" className="btn btn--quiet" onClick={() => setOutcome(null)}>
              Zurück
            </button>
            <button type="submit" className="btn btn--primary">
              Abschließen
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

/** Overrun cause "größer als gedacht": re-estimate the rest and extend. */
export function ReEstimateDialog({ modal, onClose }: { modal: SessionModal<'re_estimate'>; onClose: () => void }) {
  const services = useServices();
  const { state, p } = useSession(modal?.sessionId);
  const [minutes, setMinutes] = useState(30);
  useEffect(() => setMinutes(30), [modal]);
  if (!modal || !p) return <Dialog open={false} title="" onClose={onClose}>{null}</Dialog>;
  const overMin = Math.max(0, Math.round((p.netMs - p.effectiveTimeboxMin * MIN) / MIN));
  return (
    <Dialog open title="Neu schätzen" onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (services.run(extendSession(state, services.deps(), p.sessionId, overMin + minutes))) {
            services.announce('Timebox angepasst. Der Rest des Tages rückt nach.');
            onClose();
          }
        }}
      >
        <label className="field">
          <span>Wie viele Minuten brauchst du realistisch noch?</span>
          <input type="number" autoFocus min={5} max={240} step={5} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
        </label>
        <p className="hint">Das fließt in deinen persönlichen Schätzfaktor ein, damit der nächste Plan besser passt.</p>
        <div className="form__actions">
          <button type="submit" className="btn btn--primary">
            Timebox anpassen
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** Overrun cause "wurde unterbrochen": deduct the untracked interruption. */
export function CorrectTimeDialog({ modal, onClose }: { modal: SessionModal<'correct_time'>; onClose: () => void }) {
  const services = useServices();
  const { state, p } = useSession(modal?.sessionId);
  const [minutes, setMinutes] = useState(15);
  const [note, setNote] = useState('');
  useEffect(() => {
    setMinutes(15);
    setNote('');
  }, [modal]);
  if (!modal || !p) return <Dialog open={false} title="" onClose={onClose}>{null}</Dialog>;
  return (
    <Dialog open title="Zeit korrigieren" onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (services.run(correctSession(state, services.deps(), p.sessionId, minutes, note))) {
            services.announce(`${minutes} min abgezogen. Die Korrektur bleibt im Verlauf nachvollziehbar.`);
            onClose();
          }
        }}
      >
        <label className="field">
          <span>Wie lange warst du nicht bei dieser Aufgabe?</span>
          <input type="number" autoFocus min={1} max={Math.floor(p.netMs / MIN)} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
        </label>
        <label className="field">
          <span>Wodurch? (optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="z. B. Paketbote, Telefonat" />
        </label>
        <div className="form__actions">
          <button type="submit" className="btn btn--primary">
            Abziehen
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** Overrun cause "will es perfekt machen": sharpen the definition of done. */
export function SharpenDodDialog({ modal, onClose, onOpen }: { modal: SessionModal<'sharpen_dod'>; onClose: () => void; onOpen: OpenModal }) {
  const services = useServices();
  const { state, p, task } = useSession(modal?.sessionId);
  const [dod, setDod] = useState('');
  useEffect(() => setDod(''), [modal]);
  const labels = contextLabels(state.settings.userContext);
  if (!modal || !p || !task) return <Dialog open={false} title="" onClose={onClose}>{null}</Dialog>;
  return (
    <Dialog open title="Wann ist es gut genug?" onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (services.run(updateTask(state, services.deps(), task.id, { intention: dod }))) onOpen({ kind: 'end_check', sessionId: p.sessionId });
        }}
      >
        <p className="muted">Bisher: „{p.intention}“</p>
        <label className="field">
          <span>{labels.roundUp}</span>
          <input autoFocus required value={dod} onChange={(e) => setDod(e.target.value)} maxLength={160} />
        </label>
        <div className="form__actions">
          <button type="button" className="btn btn--quiet" onClick={() => services.run(extendSession(state, services.deps(), p.sessionId, 10)) && onClose()}>
            Noch 10 min, dann Schluss
          </button>
          <button type="submit" className="btn btn--primary">
            Festhalten und abschließen
          </button>
        </div>
      </form>
    </Dialog>
  );
}
