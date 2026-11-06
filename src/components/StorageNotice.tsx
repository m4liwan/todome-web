import { useEffect, useState, useSyncExternalStore } from 'react';
import { downloadBackup } from '../app/backup';
import { useServices } from '../app/services';
import { storageHealth } from '../lib/storage';
import { Dialog } from './Dialog';

const SNOOZE_MS = 20 * 60_000;

const TEXT = {
  full: 'Der Speicher von ToDoMe. auf diesem Gerät ist voll.',
  blocked: 'ToDoMe. kommt gerade nicht an seinen Speicher auf diesem Gerät, zum Beispiel wegen einer Sicherheitsrichtlinie.',
} as const;

/**
 * Calm notice when changes cannot be saved: nothing is lost while the app
 * stays open, and one click puts a complete backup in the downloads.
 * Closes itself as soon as saving works again.
 */
export function StorageNotice() {
  const services = useServices();
  const health = useSyncExternalStore(storageHealth.subscribe, storageHealth.get);
  const [snooze, setSnooze] = useState<{ seq: number; until: number } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [, wake] = useState(0);

  // Ask again after a snooze if the problem is still there.
  useEffect(() => {
    if (!snooze) return;
    const id = window.setTimeout(() => wake((n) => n + 1), Math.max(0, snooze.until - Date.now()) + 50);
    return () => window.clearTimeout(id);
  }, [snooze]);

  // A recovery speaks once, quietly.
  const [wasProblem, setWasProblem] = useState(false);
  useEffect(() => {
    if (health.problem) {
      setWasProblem(true);
      return;
    }
    if (wasProblem) {
      setWasProblem(false);
      setNote(null);
      services.announce('Speichern klappt wieder. Alles ist sicher.');
    }
  }, [health.problem, wasProblem, services]);

  const snoozed = snooze !== null && snooze.seq === health.seq && Date.now() < snooze.until;
  const open = Boolean(health.problem) && !snoozed;

  const retry = () => {
    services.store.flush();
    if (storageHealth.retry()) return;
    setNote('Klappt noch nicht. Mit dem Backup bist du auf der sicheren Seite.');
  };
  const backup = () => {
    downloadBackup(services.store.getState());
    setNote('Das Backup wird heruntergeladen. Du findest es in deinem Download-Ordner.');
  };

  return (
    <Dialog
      open={open}
      title="Speichern klappt gerade nicht"
      tone="alert"
      className="dialog--storage"
      onClose={() => setSnooze({ seq: health.seq, until: Date.now() + SNOOZE_MS })}
      footer={
        <>
          <button type="button" className="btn btn--quiet" onClick={() => setSnooze({ seq: health.seq, until: Date.now() + SNOOZE_MS })}>
            Später erinnern
          </button>
          <button type="button" className="btn" onClick={retry}>
            Erneut versuchen
          </button>
          <button type="button" className="btn btn--primary" onClick={backup}>
            Backup herunterladen
          </button>
        </>
      }
    >
      <div className="storage-note">
        <p>{health.problem ? TEXT[health.problem] : ''}</p>
        <p>Deine Änderungen sind noch da, solange ToDoMe. geöffnet bleibt. Lade jetzt ein Backup herunter, dann geht nichts verloren.</p>
        {note && (
          <p className="storage-note__status" role="status">
            {note}
          </p>
        )}
      </div>
    </Dialog>
  );
}
