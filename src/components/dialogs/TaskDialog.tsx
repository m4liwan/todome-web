import { useEffect, useState } from 'react';
import { useAppState, useNow } from '../../app/hooks';
import { useServices } from '../../app/services';
import type { Modal } from '../../app/modal';
import { TASK_TYPE_ORDER, TASK_TYPES } from '../../domain/taskTypes';
import type { TaskPriority, TaskType } from '../../domain/types';
import { PRIORITY_LABELS } from '../../domain/companion';
import { energyCopy, energyMode, energyToday } from '../../domain/energy';
import { atTimeOfDay, dayKey, formatTime } from '../../lib/time';
import { createTask, updateTask } from '../../state/commands';
import { Dialog } from '../Dialog';
import { Select } from '../Select';
import { hasPro, openPro } from '../../app/pro';
import { IconLock } from '../icons';
import { businessShown, contextLabels } from '../../domain/userContext';
import { trackEvent } from '../../services/telemetry';

type Props = { modal: Extract<Modal, { kind: 'task' }> | null; onClose: () => void };

interface FormState {
  title: string;
  type: TaskType;
  /** Own kind of work for "Sonstiges…". */
  typeLabel: string;
  clientId: string;
  estimateMin: number;
  intention: string;
  billable: boolean;
  priority: TaskPriority;
  plannedTime: string;
  checklist: string;
}

const blank: FormState = { title: '', type: 'deep_work', typeLabel: '', clientId: '', estimateMin: 60, intention: '', billable: true, priority: 'normal', plannedTime: '', checklist: '' };

export function TaskDialog({ modal, onClose }: Props) {
  const services = useServices();
  const state = useAppState();
  const labels = contextLabels(state.settings.userContext);
  const business = businessShown(state);
  const now = useNow();
  const [form, setForm] = useState<FormState>(blank);
  const editing = modal?.taskId ? state.tasks[modal.taskId] : undefined;
  const clients = Object.values(state.clients).filter((c) => !c.archived);
  const mode = energyMode(energyToday(state, now));
  const copy = energyCopy(mode);
  // Free: "abrechenbar" simply follows the client's default.
  const pro = hasPro();

  useEffect(() => {
    if (!modal) return;
    if (editing) {
      setForm({
        title: editing.title,
        type: editing.type,
        typeLabel: editing.typeLabel ?? '',
        clientId: editing.clientId ?? '',
        estimateMin: editing.estimateMin,
        intention: editing.intention,
        billable: editing.billable,
        priority: editing.priority,
        plannedTime: editing.plannedStart ? formatTime(editing.plannedStart) : '',
        checklist: editing.checklist.filter((i) => i.doneAt === null).map((i) => i.label).join('\n'),
      });
    } else {
      setForm({ ...blank, estimateMin: copy.defaultEstimate });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = () => {
    const plannedStart = form.plannedTime ? atTimeOfDay(now, form.plannedTime) : null;
    const lines = form.checklist.split('\n').map((l) => l.trim()).filter(Boolean);
    const deps = services.deps();
    if (editing) {
      const doneItems = editing.checklist.filter((i) => i.doneAt !== null);
      const kept = lines.map((label) => editing.checklist.find((i) => i.label === label && i.doneAt === null) ?? { id: deps.newId(), label, doneAt: null });
      const ok = services.run(
        updateTask(state, deps, editing.id, {
          title: form.title.trim(),
          type: form.type,
          typeLabel: form.type === 'other' ? form.typeLabel.trim().slice(0, 40) : undefined,
          clientId: form.clientId || null,
          estimateMin: form.estimateMin,
          intention: form.intention.trim() || form.title.trim(),
          billable: form.billable && Boolean(form.clientId),
          priority: form.priority,
          plannedStart,
          checklist: [...doneItems, ...kept],
        }),
      );
      if (ok) {
        trackEvent('task_updated', { task_type: form.type, priority: form.priority, has_checklist: lines.length > 0 });
        onClose();
      }
      return;
    }
    const ok = services.run(
      createTask(state, deps, {
        title: form.title,
        type: form.type,
        typeLabel: form.typeLabel,
        clientId: form.clientId || null,
        estimateMin: form.estimateMin,
        intention: form.intention,
        billable: form.billable && Boolean(form.clientId),
        priority: form.priority,
        plannedStart,
        plannedDay: dayKey(now),
        checklist: lines,
      }),
    );
    if (ok) {
      trackEvent('task_created', { task_type: form.type, priority: form.priority, has_checklist: lines.length > 0 });
      onClose();
    }
  };

  return (
    <Dialog
      open={Boolean(modal)}
      title={editing ? 'Aufgabe bearbeiten' : mode === 'low' ? 'Ein kleiner Schritt' : 'Neue Aufgabe'}
      onClose={onClose}
      footer={
        <>
          {editing && editing.status !== 'done' && (
            <button
              type="button"
              className="btn btn--quiet btn--danger"
              onClick={() => {
                if (services.run(updateTask(state, services.deps(), editing.id, { status: 'dropped' }))) {
                  trackEvent('task_dropped', { task_type: editing.type });
                  onClose();
                }
              }}
            >
              Streichen
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn btn--quiet" onClick={onClose}>
            Abbrechen
          </button>
          <button type="submit" form="task-form" className="btn btn--primary">
            {editing ? 'Speichern' : 'Ablegen'}
          </button>
        </>
      }
    >
      {!editing && <p className={`energy-note energy-note--${mode ?? 'mid'}`}>{copy.taskHint}</p>}
      <form
        id="task-form"
        className="form form--grid"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="field field--full">
          <span>Titel</span>
          <input autoFocus required maxLength={120} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="z. B. Checkout-Screens gestalten" />
        </label>
        <label className="field">
          <span>Art der Arbeit</span>
          <Select value={form.type} onChange={(v) => set('type', v as TaskType)}>
            {TASK_TYPE_ORDER.map((t) => (
              <option key={t} value={t}>
                {t === 'other' ? 'Sonstiges…' : TASK_TYPES[t].label}
              </option>
            ))}
          </Select>
        </label>
        {form.type === 'other' && (
          <label className="field field--full">
            <span>Was für eine Art Arbeit?</span>
            <input autoFocus maxLength={40} value={form.typeLabel} onChange={(e) => set('typeLabel', e.target.value)} placeholder="z. B. Rechnungen sortieren, Fotos bearbeiten" />
          </label>
        )}
        {(business || clients.length > 0) && (
        <label className="field">
          <span>{labels.client}</span>
          <Select
            value={form.clientId}
            onChange={(v) => {
              const c = state.clients[v];
              setForm((f) => ({ ...f, clientId: v, billable: c ? c.billableDefault : false }));
            }}
          >
            <option value="">{labels.noClient}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </label>
        )}
        <div className="field field--full">
          <span id="prio-label">Priorität</span>
          <div className="segmented" role="radiogroup" aria-labelledby="prio-label">
            {(['high', 'normal', 'low'] as const).map((p) => (
              <button key={p} type="button" role="radio" aria-checked={form.priority === p} className={form.priority === p ? 'is-on' : ''} onClick={() => set('priority', p)}>
                {PRIORITY_LABELS[p]}
              </button>
            ))}
          </div>
          <small className="hint">Bei wichtigen Aufgaben schaut dein Begleiter öfter vorbei, damit du nicht abdriftest.</small>
        </div>
        <div className="field field--full">
          <span id="estimate-label">Wie lange ungefähr? (min)</span>
          <div className="segmented" role="group" aria-labelledby="estimate-label">
            {copy.estimatePresets.map((m) => (
              <button key={m} type="button" className={form.estimateMin === m ? 'is-on' : ''} aria-pressed={form.estimateMin === m} onClick={() => set('estimateMin', m)}>
                {m}
              </button>
            ))}
            <input type="number" min={5} max={600} step={5} value={form.estimateMin} onChange={(e) => set('estimateMin', Number(e.target.value))} aria-label="Schätzung in Minuten" />
          </div>
        </div>
        <label className="field">
          <span>Geplanter Start (optional)</span>
          <input type="time" value={form.plannedTime} onChange={(e) => set('plannedTime', e.target.value)} />
        </label>
        <label className="field field--full">
          <span>{mode === 'low' ? 'Was wäre ein guter erster Mini-Schritt?' : 'Was ist am Ende fertig?'}</span>
          <input maxLength={160} value={form.intention} onChange={(e) => set('intention', e.target.value)} placeholder={copy.intentionPlaceholder} />
        </label>
        <label className="field field--full">
          <span>Schritte (einer pro Zeile)</span>
          <textarea rows={4} value={form.checklist} onChange={(e) => set('checklist', e.target.value)} />
        </label>
        {!business ? null : pro ? (
          <label className="check field--full">
            <input type="checkbox" checked={form.billable && Boolean(form.clientId)} disabled={!form.clientId} onChange={(e) => set('billable', e.target.checked)} />
            <span>Abrechenbar</span>
          </label>
        ) : (
          <button type="button" className="pro-row field--full" onClick={() => openPro('clients')}>
            <IconLock size={13} />
            <span>Abrechenbar pro Aufgabe festlegen</span>
            <span className="pro-lock">Pro</span>
          </button>
        )}
        {business && clients.length === 0 && <p className="hint field--full">{labels.clientsHint}</p>}
      </form>
    </Dialog>
  );
}
