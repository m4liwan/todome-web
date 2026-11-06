import { useEffect, useState } from 'react';
import { useAppState } from '../../app/hooks';
import { useServices } from '../../app/services';
import type { Modal } from '../../app/modal';
import { TASK_TYPE_ORDER, TASK_TYPES } from '../../domain/taskTypes';
import type { PauseReason, TaskType } from '../../domain/types';
import { interruptWith } from '../../state/commands';
import { Dialog } from '../Dialog';
import { Select } from '../Select';
import { contextLabels } from '../../domain/userContext';
import { trackEvent } from '../../services/telemetry';

type Props = { modal: Extract<Modal, { kind: 'interrupt' }> | null; onClose: () => void };

/**
 * Other work comes in (e.g. a client call): park the current session on the
 * stack and immediately start a new, separately billed one.
 */
export function InterruptDialog({ modal, onClose }: Props) {
  const services = useServices();
  const state = useAppState();
  const labels = contextLabels(state.settings.userContext);
  const clients = Object.values(state.clients).filter((c) => !c.archived);
  const [clientId, setClientId] = useState('');
  const [title, setTitle] = useState('');
  const [type, setType] = useState<TaskType>('communication');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState<PauseReason>('client');

  useEffect(() => {
    if (!modal) return;
    setClientId('');
    setTitle('Anruf');
    setType('communication');
    setNote('');
    setReason('client');
  }, [modal]);

  const submit = () => {
    if (!modal) return;
    const client = clientId ? state.clients[clientId] : undefined;
    const ok = services.run(
      interruptWith(state, services.deps(), {
        sessionId: modal.sessionId,
        reason,
        title: client && title === 'Anruf' ? `Anruf ${client.name}` : title,
        clientId: clientId || null,
        type,
        parkingNote: note,
      }),
    );
    if (ok) {
      trackEvent('focus_interrupted', { task_type: type, interruption_reason: reason, has_client: Boolean(clientId) });
      onClose();
    }
  };

  return (
    <Dialog
      open={Boolean(modal)}
      title="Unterbrechung"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--quiet" onClick={onClose}>
            Abbrechen
          </button>
          <button type="submit" form="interrupt-form" className="btn btn--primary">
            Wechseln
          </button>
        </>
      }
    >
      <form
        id="interrupt-form"
        className="form form--grid"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <p className="muted field--full">Deine aktuelle Session wartet auf dem Stapel. Die neue läuft sofort und wird separat erfasst.</p>
        <label className="field field--full">
          <span>Ein Satz für später: Wo stehst du gerade?</span>
          <input autoFocus value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="z. B. Step 2 Zahlungsart, Fehlerzustände fehlen" />
        </label>
        <label className="field">
          <span>Was kommt dazwischen?</span>
          <input required value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        </label>
        <label className="field">
          <span>{labels.business ? 'Für wen?' : 'Wofür?'}</span>
          <Select
            value={clientId}
            onChange={(v) => {
              setClientId(v);
              setReason(v ? 'client' : 'private');
            }}
          >
            <option value="">Intern / privat</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="field">
          <span>Art der Arbeit</span>
          <Select value={type} onChange={(v) => setType(v as TaskType)}>
            {TASK_TYPE_ORDER.map((t) => (
              <option key={t} value={t}>
                {TASK_TYPES[t].label}
              </option>
            ))}
          </Select>
        </label>
      </form>
    </Dialog>
  );
}
