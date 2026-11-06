import { useAppState, useNow } from '../../app/hooks';
import { useServices } from '../../app/services';
import type { Modal } from '../../app/modal';
import { buildBriefing } from '../../domain/reentry';
import { projectSession } from '../../domain/session';
import { formatDuration } from '../../lib/time';
import { resumeSession, returnToSession, type CommandResult } from '../../state/commands';
import { Dialog } from '../Dialog';
import { trackEvent } from '../../services/telemetry';

type Props = { modal: Extract<Modal, { kind: 'reentry' }> | null; onClose: () => void };

/** Re-entry micro-briefing: where you were, what's done, your note, next step, frame. */
export function ReEntryDialog({ modal, onClose }: Props) {
  const services = useServices();
  const state = useAppState();
  const now = useNow();
  const p = modal ? projectSession(state, state.events, modal.sessionId, now) : null;
  const task = p ? state.tasks[p.taskId] : undefined;

  if (!modal || !p || !task) return <Dialog open={false} title="" onClose={onClose}>{null}</Dialog>;
  const client = task.clientId ? state.clients[task.clientId] ?? null : null;
  const snapshot = p.lastSnapshotId ? state.snapshots[p.lastSnapshotId] ?? null : null;
  const b = buildBriefing(p, task, client, snapshot, now);
  const links = b.resources.filter((r) => /^https?:\/\//i.test(r));

  const go = () => {
    const deps = services.deps();
    const r: CommandResult =
      modal.mode === 'resume'
        ? resumeSession(state, deps, p.sessionId)
        : modal.mode === 'return'
          ? returnToSession(state, deps, p.sessionId)
          : { ok: true, actions: [] };
    if (services.run(r)) {
      if (modal.mode === 'resume' || modal.mode === 'return') trackEvent('focus_resumed', { reentry_mode: modal.mode, task_type: task.type });
      onClose();
    }
  };

  return (
    <Dialog
      open
      title="Wiedereinstieg"
      tone="focus"
      onClose={onClose}
      footer={
        <>
          {modal.mode !== 'info' && (
            <button type="button" className="btn btn--quiet" onClick={onClose}>
              Noch nicht
            </button>
          )}
          <button type="button" className="btn btn--primary" autoFocus onClick={go}>
            {modal.mode === 'info' ? 'Weiter geht’s' : 'Weiterarbeiten'}
          </button>
        </>
      }
    >
      <ol className="briefing">
        <li>
          <span>Wo du warst</span>
          <p>{b.where}</p>
        </li>
        {b.done && (
          <li>
            <span>Erledigt</span>
            <p>{b.done}</p>
          </li>
        )}
        {b.note && (
          <li className="briefing__note">
            <span>Deine Notiz</span>
            <p>„{b.note}“</p>
          </li>
        )}
        <li className="briefing__next">
          <span>Nächster Schritt</span>
          <p>{b.nextStep}</p>
        </li>
        <li>
          <span>Rahmen</span>
          <p>{b.frame}</p>
        </li>
      </ol>
      {b.awayMs > 0 && <p className="hint">Weg seit {formatDuration(b.awayMs)}.</p>}
      {b.suggestWarmUp && <p className="hint">Längere Pause: Nimm dir zwei Minuten nur für den nächsten Schritt, der Rest kommt von allein.</p>}
      {links.length > 0 && (
        <ul className="resources">
          {links.map((r) => (
            <li key={r}>
              <a href={r} target="_blank" rel="noreferrer noopener">
                {r}
              </a>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
