import { useEffect, useState } from 'react';
import { useAppState, useNow } from '../../app/hooks';
import { useServices } from '../../app/services';
import type { Modal } from '../../app/modal';
import { PAUSE_REASON_LABELS } from '../../domain/copy';
import { energyCopy, energyMode, energyToday } from '../../domain/energy';
import { projectSession } from '../../domain/session';
import type { PauseReason } from '../../domain/types';
import { annotatePause, saveSnapshot } from '../../state/commands';
import { Dialog } from '../Dialog';

type Props = { modal: Extract<Modal, { kind: 'pause' }> | null; onClose: () => void };

const REASONS: PauseReason[] = ['planned_break', 'client', 'private', 'distraction', 'energy'];
const LENGTHS: Array<number | null> = [5, 10, 15, 30, null];

/**
 * The pause itself already happened (one tap). This sheet is optional:
 * reason, planned length and the "note to your future self".
 */
export function PauseDialog({ modal, onClose }: Props) {
  const services = useServices();
  const state = useAppState();
  const now = useNow();
  const p = modal ? projectSession(state, state.events, modal.sessionId, now) : null;
  const [reason, setReason] = useState<PauseReason>('none');
  const [length, setLength] = useState<number | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!modal) return;
    const current = projectSession(services.store.getState(), services.store.getState().events, modal.sessionId, services.clock.now());
    setReason(current?.currentPause?.reason ?? 'none');
    setLength(current?.currentPause?.plannedMin ?? null);
    setNote('');
  }, [modal, services]);

  const stillPaused = p?.status === 'paused';
  useEffect(() => {
    if (modal && p && !stillPaused) onClose();
  }, [modal, p, stillPaused, onClose]);

  const save = () => {
    if (!modal || !p?.currentPause) return onClose();
    const deps = services.deps();
    const changed = reason !== p.currentPause.reason || length !== p.currentPause.plannedMin;
    if (changed) services.run(annotatePause(state, deps, modal.sessionId, reason, length));
    if (note.trim()) services.run(saveSnapshot(services.store.getState(), services.deps(), modal.sessionId, note));
    onClose();
  };

  return (
    <Dialog
      open={Boolean(modal) && stillPaused}
      title="Pausiert"
      tone="pause"
      onClose={save}
      footer={
        <button type="submit" form="pause-form" className="btn btn--primary">
          Fertig
        </button>
      }
    >
      <form
        id="pause-form"
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <p className="muted">{energyCopy(energyMode(energyToday(state, services.clock.now()))).pauseLine}</p>
        <label className="field">
          <span>Ein Satz für dein zukünftiges Ich</span>
          <input
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            placeholder="z. B. War bei Schritt 2 Zahlungsart, Fehlerzustände fehlen"
          />
        </label>
        <fieldset className="field">
          <legend>Grund</legend>
          <div className="chips">
            {REASONS.map((r) => (
              <button key={r} type="button" className={`chip${reason === r ? ' is-on' : ''}`} aria-pressed={reason === r} onClick={() => setReason(reason === r ? 'none' : r)}>
                {PAUSE_REASON_LABELS[r]}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="field">
          <legend>Wie lange?</legend>
          <div className="chips">
            {LENGTHS.map((l) => (
              <button key={String(l)} type="button" className={`chip${length === l ? ' is-on' : ''}`} aria-pressed={length === l} onClick={() => setLength(l)}>
                {l === null ? 'Offen' : `${l} min`}
              </button>
            ))}
          </div>
          <p className="hint">{length ? `Nach ${length} min frage ich, ob es weitergeht.` : 'Ohne Länge melde ich mich nicht von selbst.'}</p>
        </fieldset>
      </form>
    </Dialog>
  );
}
