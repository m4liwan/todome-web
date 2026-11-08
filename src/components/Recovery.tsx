import { useEffect, useRef, useState } from 'react';
import { backupFileName } from '../app/backup';
import { describeState, listSnapshots, readSnapshot, snapshotLabel, snapshotRaw, vaultSupported } from '../app/vault';
import type { AppState } from '../domain/types';
import { desktop, type VaultEntry } from '../lib/desktop';
import { browserStore } from '../lib/storage';
import { inspectState } from '../state/store';

/**
 * Datensafe, the calm way out:
 *  - 'unreadable' / 'newer': stored data could not be read at start. Nothing
 *    is overwritten; the original stays in place (and in the safe).
 *  - 'crash': the app hit an error it could not render past (ErrorBoundary)
 *    or crashed repeatedly (shell crash guard).
 * Works without the app's store, so it also works when the store is the problem.
 */
export type RecoveryReason = 'unreadable' | 'newer' | 'crash';

const COPY: Record<RecoveryReason, { title: string; text: string }> = {
  unreadable: {
    title: 'Deine Daten konnten nicht gelesen werden',
    text: 'Nichts ist verloren: ToDoMe. hat den gespeicherten Stand nicht angefasst. Hol dir eine frühere Sicherung zurück oder lade die Daten als Datei herunter.',
  },
  newer: {
    title: 'Diese Daten stammen aus einer neueren Version',
    text: 'Sie wurden mit einer neueren ToDoMe.-Version gespeichert. Installiere die aktuelle Version, dann ist alles wieder da. Bis dahin bleiben die Daten unangetastet.',
  },
  crash: {
    title: 'Da ist etwas schiefgelaufen',
    text: 'ToDoMe. ist auf einen Fehler gestoßen. Deine Daten sind gespeichert. Meistens hilft einmal neu laden.',
  },
};

interface Pending {
  state: AppState;
  from: string;
}

export interface RecoveryProps {
  reason: RecoveryReason;
  storageKey: string;
  /** Runs before anything is written (a crashed app's store must stop saving first). */
  onBeforeWrite?: () => void;
  /** Technical detail for support (crash only), shown folded. */
  detail?: string;
  /** Starts the app again (tests replace it). */
  reload?: () => void;
}

const reloadApp = () => window.location.replace(window.location.pathname + window.location.search);

function downloadText(text: string, name: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Recovery({ reason, storageKey, onBeforeWrite, detail, reload = reloadApp }: RecoveryProps) {
  const copy = COPY[reason];
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [confirmFresh, setConfirmFresh] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => titleRef.current?.focus(), []);
  // The shell waits for "saved" on quit; there is nothing to save here.
  useEffect(() => desktop?.onBeforeQuit(() => undefined), []);

  const restore = (p: Pending) => {
    onBeforeWrite?.();
    const current = browserStore.get(storageKey);
    // The data being replaced goes into the safe first (unless it already is there).
    if (current && reason === 'crash') snapshotRaw('pre-import', current);
    if (!browserStore.set(storageKey, JSON.stringify(p.state))) {
      setNote('Speichern klappt gerade nicht. Lade die Sicherung herunter und versuche es nach einem Neustart.');
      return;
    }
    reload();
  };

  const importFile = async (file: File) => {
    const check = inspectState(await file.text());
    if (check.status === 'ok') setPending({ state: check.state, from: file.name });
    else setNote(check.status === 'newer' ? 'Diese Datei stammt aus einer neueren ToDoMe.-Version.' : 'Die Datei ist kein lesbares ToDoMe.-Backup.');
  };

  const exportCurrent = () => {
    const raw = browserStore.get(storageKey);
    if (!raw) return setNote('Es sind keine gespeicherten Daten vorhanden.');
    downloadText(raw, backupFileName().replace('todome-backup', 'todome-rettung'));
    setNote('Die Datei liegt in deinem Download-Ordner.');
  };

  const startFresh = () => {
    onBeforeWrite?.();
    const raw = browserStore.get(storageKey);
    if (raw) {
      snapshotRaw('unreadable', raw);
      // In the browser there is no safe: keep a copy next to it as long as there is room.
      if (!vaultSupported()) browserStore.set(`${storageKey}:unreadable`, raw);
    }
    browserStore.remove(storageKey);
    reload();
  };

  return (
    <main className="recovery" aria-labelledby="recovery-title">
      <div className="recovery__card">
        <h1 id="recovery-title" className="recovery__title" tabIndex={-1} ref={titleRef}>
          {copy.title}
        </h1>
        <p className="recovery__text">{copy.text}</p>

        {pending ? (
          <div className="recovery__confirm" role="group" aria-label="Wiederherstellen bestätigen">
            <p>
              <strong>{pending.from}</strong>
              <br />
              {describeState(pending.state)}. Dieser Stand ersetzt die aktuellen Daten.
            </p>
            <div className="row">
              <button type="button" className="btn btn--primary" onClick={() => restore(pending)}>
                Wiederherstellen
              </button>
              <button type="button" className="btn btn--quiet" onClick={() => setPending(null)}>
                Abbrechen
              </button>
            </div>
          </div>
        ) : (
          <>
            {reason === 'crash' && (
              <div className="row">
                <button type="button" className="btn btn--primary" onClick={reload}>
                  Neu laden
                </button>
              </div>
            )}
            <VaultPicker
              onPick={(state, from) => setPending({ state, from })}
              onProblem={setNote}
              heading={reason === 'crash' ? 'Hilft das nicht? Frühere Sicherung laden' : 'Frühere Sicherung laden'}
            />
            <div className="row recovery__more">
              <button type="button" className="btn btn--small" onClick={() => fileRef.current?.click()}>
                Backup-Datei einspielen
              </button>
              <button type="button" className="btn btn--small" onClick={exportCurrent}>
                Daten als Datei sichern
              </button>
              {desktop && (
                <button type="button" className="btn btn--small btn--quiet" onClick={() => void desktop?.vaultOpen()}>
                  Sicherungsordner öffnen
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importFile(f);
                  e.target.value = '';
                }}
              />
            </div>
            {reason !== 'crash' &&
              (confirmFresh ? (
                <div className="recovery__confirm" role="group" aria-label="Neu beginnen bestätigen">
                  <p>
                    ToDoMe. startet leer.{' '}
                    {vaultSupported() ? 'Der alte Stand bleibt im Sicherungsordner.' : 'Lade die Daten vorher als Datei herunter, wenn du sie behalten möchtest.'}
                  </p>
                  <div className="row">
                    <button type="button" className="btn btn--danger" onClick={startFresh}>
                      Neu beginnen
                    </button>
                    <button type="button" className="btn btn--quiet" onClick={() => setConfirmFresh(false)}>
                      Abbrechen
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" className="btn btn--small btn--quiet recovery__fresh" onClick={() => setConfirmFresh(true)}>
                  Neu beginnen …
                </button>
              ))}
          </>
        )}

        <p className="recovery__note" role="status" aria-live="polite">
          {note}
        </p>
        {detail && (
          <details className="recovery__detail">
            <summary>Technische Details</summary>
            <pre>{detail}</pre>
          </details>
        )}
      </div>
    </main>
  );
}

/** The safe's copies, newest first; a pick is read and checked before it is offered. */
export function VaultPicker({
  onPick,
  onProblem,
  heading,
  limit = 6,
}: {
  onPick: (state: AppState, label: string) => void;
  onProblem: (message: string) => void;
  heading?: string;
  limit?: number;
}) {
  const [entries, setEntries] = useState<VaultEntry[] | null>(null);
  const [all, setAll] = useState(false);

  useEffect(() => {
    let alive = true;
    void listSnapshots().then((list) => alive && setEntries(list.filter((e) => e.kind !== 'unreadable')));
    return () => {
      alive = false;
    };
  }, []);

  if (!vaultSupported() || !entries || entries.length === 0) return null;
  const shown = all ? entries : entries.slice(0, limit);

  const pick = async (entry: VaultEntry) => {
    const check = await readSnapshot(entry.name);
    if (check.status === 'ok') onPick(check.state, snapshotLabel(entry));
    else onProblem('Diese Sicherung ist nicht lesbar. Probier eine ältere.');
  };

  return (
    <section className="vault-picker" aria-label="Automatische Sicherungen">
      {heading && <h2 className="vault-picker__heading">{heading}</h2>}
      <ul className="vault-picker__list">
        {shown.map((e) => (
          <li key={e.name} className="vault-picker__item">
            <span>{snapshotLabel(e)}</span>
            <button type="button" className="btn btn--small" onClick={() => void pick(e)}>
              Auswählen
            </button>
          </li>
        ))}
      </ul>
      {!all && entries.length > limit && (
        <button type="button" className="btn btn--small btn--quiet" onClick={() => setAll(true)}>
          Alle {entries.length} Sicherungen zeigen
        </button>
      )}
    </section>
  );
}
