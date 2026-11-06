import { useEffect, useState } from 'react';
import { useAppState, useNow } from '../../app/hooks';
import { useServices } from '../../app/services';
import type { Modal } from '../../app/modal';
import { prefersReducedMotion } from '../../app/theme';
import { isAfterWorkday } from '../../domain/coach';
import { energyProfile, suggestTimebox } from '../../domain/energy';
import { estimationFactor } from '../../domain/reports';
import { projectAll } from '../../domain/session';
import { TASK_TYPES, typeLabel } from '../../domain/taskTypes';
import { addDays, dayKey } from '../../lib/time';
import { deferTask, startSession } from '../../state/commands';
import { Dialog } from '../Dialog';
import { contextLabels } from '../../domain/userContext';
import { trackEvent } from '../../services/telemetry';

type Props = { modal: Extract<Modal, { kind: 'start' }> | null; onClose: () => void };
type Phase = 'arrive' | 'gather';

const BREATHS = 3;
const BREATH_MS = 8000;
const CLEAR_LIST = ['Handy aus dem Blickfeld', 'Nur die nötigen Fenster offen', 'Wasser in Reichweite'] as const;

/**
 * Warm-up runway instead of a cold stopwatch start:
 * 1. Ankommen – the tiny first step and how long the block may take.
 * 2. Sammeln (only if chosen) – a few calm breaths, always skippable.
 * Then the block starts, and the dashboard quiets everything else.
 */
export function StartDialog({ modal, onClose }: Props) {
  const services = useServices();
  const state = useAppState();
  const labels = contextLabels(state.settings.userContext);
  const now = useNow();
  const task = modal ? state.tasks[modal.taskId] : undefined;
  const [phase, setPhase] = useState<Phase>('arrive');
  const [intention, setIntention] = useState('');
  const [timebox, setTimebox] = useState(60);
  const [lateOk, setLateOk] = useState(false);
  const [cleared, setCleared] = useState<string[]>([]);

  const profile = energyProfile(state, now);
  const factor = task ? estimationFactor(state, projectAll(state, now), task.type, task.clientId) : null;
  const suggested = task ? suggestTimebox(task, factor, profile) : 60;
  const presets = profile?.mode === 'low' || (profile && profile.timeboxCapMin <= 15) ? [5, 10, 15] : profile?.mode === 'high' ? [45, 60, 90, 120] : [25, 45, 60, 90];

  useEffect(() => {
    if (!task) return;
    setPhase('arrive');
    setIntention(task.intention);
    setTimebox(suggested);
    setLateOk(false);
    setCleared([]);
    // Reset only when a different task is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal?.taskId]);

  if (!task) return <Dialog open={false} title="" onClose={onClose}>{null}</Dialog>;
  const late = isAfterWorkday(state, now) && !lateOk;

  if (late) {
    return (
      <Dialog
        open
        title={labels.dayOver}
        tone="pause"
        onClose={onClose}
        footer={
          <>
            <button type="button" className="btn btn--quiet" onClick={() => setLateOk(true)}>
              Doch noch kurz
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                if (services.run(deferTask(state, services.deps(), task.id, addDays(dayKey(now), 1)))) {
                  services.announce(`„${task.title}“ wartet morgen geduldig auf dich.`);
                  onClose();
                }
              }}
            >
              Auf morgen legen
            </button>
          </>
        }
      >
        <p>„{task.title}“ läuft dir nicht weg. Morgen früh mit frischem Kopf geht es oft leichter.</p>
      </Dialog>
    );
  }

  const start = () => {
    const r = startSession(state, services.deps(), { taskId: task.id, timeboxMin: timebox, intention: intention.trim() || 'Ein Stück weiterkommen' });
    if (services.run(r)) {
      trackEvent('focus_started', { task_type: task.type, timebox_min: timebox });
      services.announce('Los geht’s. Alles andere darf jetzt warten.');
      onClose();
    }
  };

  const micro = profile?.micro ?? false;
  const breathFirst = state.settings.breathBeforeStart;
  const setBreathFirst = (on: boolean) => services.store.dispatch({ type: 'settings/update', patch: { breathBeforeStart: on } });
  return (
    <Dialog
      open
      title={phase === 'arrive' ? 'Kurz ankommen' : 'Sammeln'}
      tone="focus"
      onClose={onClose}
      footer={
        phase === 'arrive' ? (
          <>
            <button type="button" className="btn btn--quiet" onClick={onClose}>
              Abbrechen
            </button>
            <button type="submit" form="start-form" className="btn btn--primary">
              {breathFirst ? 'Weiter zur Atemübung' : 'Block starten'}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn--quiet" onClick={start}>
              Überspringen
            </button>
            <button type="button" className="btn btn--primary" autoFocus onClick={start}>
              Ich bin bereit
            </button>
          </>
        )
      }
    >
      {phase === 'arrive' ? (
        <form
          id="start-form"
          className="form runway"
          onSubmit={(e) => {
            e.preventDefault();
            if (breathFirst) setPhase('gather');
            else start();
          }}
        >
          <div className="runway__thought">
            <p>Du bist gerade dabei, etwas Wichtiges zu tun.</p>
            <p>Etwas, das dich selbst voranbringt.</p>
          </div>
          <p className="runway__task">{task.title}</p>
          <label className="field">
            <span>{micro ? 'Was ist der allererste, winzige Schritt?' : 'Was soll am Ende dieses Blocks fertig sein?'}</span>
            <input
              autoFocus
              value={intention}
              onChange={(e) => setIntention(e.target.value)}
              maxLength={160}
              placeholder={micro ? 'z. B. Datei öffnen und eine Überschrift schreiben' : 'z. B. Entwurf steht, 80 % reichen'}
            />
            <small className="hint">80 % reichen. Ein unperfekter Anfang ist besser als ein perfekter Plan.</small>
          </label>
          <div className="field">
            <span id="timebox-label">Wie lange darf der Block dauern?</span>
            <div className="segmented" role="group" aria-labelledby="timebox-label">
              {presets.map((m) => (
                <button key={m} type="button" className={timebox === m ? 'is-on' : ''} aria-pressed={timebox === m} onClick={() => setTimebox(m)}>
                  {m}
                </button>
              ))}
              <input
                type="number"
                min={5}
                max={480}
                step={5}
                value={timebox}
                onChange={(e) => setTimebox(Number(e.target.value))}
                aria-label="Timebox in Minuten"
              />
            </div>
            <p className="hint">
              {profile?.mode === 'low'
                ? `Sanft-Modus: kurze Blöcke, viel Luft. Vorschlag: ${suggested} min.`
                : factor && Math.abs(factor - 1) >= 0.05
                  ? `Deine ${typeLabel(task)}-Blöcke dauern meist ${Math.round(Math.abs(factor - 1) * 100)} % ${factor > 1 ? 'länger' : 'kürzer'} als geschätzt. Vorschlag: ${suggested} min.`
                  : `${typeLabel(task)}: ${describeRhythm(task.type)}`}
            </p>
          </div>
          <label className="check">
            <input type="checkbox" checked={breathFirst} onChange={(e) => setBreathFirst(e.target.checked)} />
            <span>Atemübung vor dem Start durchführen</span>
          </label>
        </form>
      ) : (
        <div className="runway runway--gather">
          <Breathe />
          <div className="runway__clear">
            <p className="runway__clear-title">Was dich gleich nicht stören soll</p>
            <div className="chips">
              {CLEAR_LIST.map((label) => {
                const on = cleared.includes(label);
                return (
                  <button
                    key={label}
                    type="button"
                    className={`chip${on ? ' is-on' : ''}`}
                    aria-pressed={on}
                    onClick={() => setCleared((c) => (on ? c.filter((x) => x !== label) : [...c, label]))}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <p className="hint">Sobald du startest, wird das Dashboard ruhig: Nur noch dein Block steht im Licht.</p>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/** Three calm breaths, guided by a softly growing circle. */
function Breathe() {
  const [count, setCount] = useState(0);
  const reduced = prefersReducedMotion();
  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => setCount((c) => Math.min(BREATHS, c + 1)), BREATH_MS);
    return () => window.clearInterval(id);
  }, [reduced]);
  const done = count >= BREATHS;
  return (
    <div className={`breathe${done || reduced ? ' is-done' : ''}`} aria-live="polite">
      <div className="breathe__circle" style={{ animationDuration: `${BREATH_MS}ms` }} aria-hidden="true">
        <span />
      </div>
      <p className="breathe__text">
        {done || reduced ? 'Gut. Du bist angekommen.' : (
          <>
            <span className="breathe__in">Einatmen</span>
            <span className="breathe__out">Ausatmen</span>
          </>
        )}
      </p>
      {!done && !reduced && <p className="hint">Atemzug {count + 1} von {BREATHS}. Überspringen geht jederzeit.</p>}
    </div>
  );
}

function describeRhythm(type: keyof typeof TASK_TYPES): string {
  const p = TASK_TYPES[type];
  if (p.overrunTolerance === null) return 'keine Nachfragen, nur ein kurzer Abschluss.';
  if (p.firstStepMin) return `ein sanfter Anstoß nach ${p.firstStepMin} min, dann Ruhe bis zur Halbzeit.`;
  if (p.pulseEveryMin) return `${p.quietMin} min Ruhe, danach ein stilles Lebenszeichen alle ${p.pulseEveryMin} min.`;
  return 'eine Nachfrage kurz vor Ende des Blocks.';
}
