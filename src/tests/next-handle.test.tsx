import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ServicesContext, type Services } from '../app/services';
import { ActiveSession } from '../components/ActiveSession';
import { foregroundSession, projectAll } from '../domain/session';
import type { AppState } from '../domain/types';
import { createMemoryStore } from '../lib/storage';
import { createStore } from '../state/store';
import { Harness } from '../test/helpers';

/** A running block in the "Mikro-Schritt" focus style, its task with the given steps. */
function micro(steps: string[] = []) {
  const h = new Harness();
  const id = h.task('deep_work');
  if (steps.length) h.state.tasks[id] = { ...h.state.tasks[id]!, checklist: steps.map((label, i) => ({ id: `s${i}`, label, doneAt: null })) };
  h.start(id);
  h.at(5);
  const state: AppState = { ...h.state, settings: { ...h.state.settings, appearance: { ...h.state.settings.appearance, focusStyle: 'micro' } } };
  const store = createStore({ storage: createMemoryStore(), key: 'k', initial: state, persistDelayMs: 0 });
  let n = 0;
  const services = {
    store,
    clock: { now: () => h.now, speed: 1 },
    deps: () => ({ now: h.now, newId: () => `n-${++n}` }),
    run: (r: { ok: boolean; actions?: unknown }) => {
      if (r.ok) store.dispatch((r as { actions: Parameters<typeof store.dispatch>[0] }).actions);
      return r.ok;
    },
    announce: () => {},
  } as unknown as Services;
  const view = () => {
    const s = store.getState();
    const projections = projectAll(s, h.now);
    return (
      <ServicesContext.Provider value={services}>
        <ActiveSession state={s} projections={projections} foreground={foregroundSession(projections)} now={h.now} onOpen={() => {}} onShowPlan={() => {}} onBreathe={() => {}} />
      </ServicesContext.Provider>
    );
  };
  const r = render(view());
  return { store, taskId: id, rerender: () => r.rerender(view()) };
}

describe('the next handhold (Mikro-Schritt)', () => {
  it('never fills the task with generic steps of its own', () => {
    const { store, taskId } = micro();
    expect(store.getState().tasks[taskId]!.checklist).toEqual([]);
    expect(document.body.textContent).not.toMatch(/zwei Minuten|reinschauen|Häppchen/);
  });

  it('asks for your real next handhold and keeps it as a step of the task', () => {
    const { store, taskId, rerender } = micro();
    const field = screen.getByRole('textbox', { name: 'Dein nächster Handgriff' });
    fireEvent.change(field, { target: { value: 'Figma öffnen, Screen 1 skizzieren' } });
    fireEvent.submit(field.closest('form')!);
    expect(store.getState().tasks[taskId]!.checklist.map((i) => i.label)).toEqual(['Figma öffnen, Screen 1 skizzieren']);
    rerender();
    expect(screen.getByText('Figma öffnen, Screen 1 skizzieren')).not.toBeNull();
  });

  it('shows your own next open step large, and checks it off', () => {
    const { store, taskId } = micro(['Mail an Lena', 'Angebot rechnen']);
    expect(screen.getByText('Mail an Lena')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Geschafft/ }));
    expect(store.getState().tasks[taskId]!.checklist[0]!.doneAt).not.toBeNull();
  });
});

describe('the generic bites of earlier versions', () => {
  it('are removed from saved tasks for good; your own steps stay', async () => {
    const { parseState } = await import('../state/store');
    const { emptyState } = await import('../state/defaults');
    const base = emptyState();
    const item = (label: string, i: number) => ({ id: `c${i}`, label, doneAt: null });
    const task = {
      id: 't1',
      title: 'Angebot',
      type: 'deep_work',
      clientId: null,
      estimateMin: 45,
      intention: 'Entwurf steht',
      status: 'planned',
      priority: 'normal',
      billable: false,
      notes: '',
      plannedStart: null,
      plannedDay: null,
      createdAt: 1,
      updatedAt: 1,
      checklist: [
        'Datei öffnen und zwei Minuten nur reinschauen',
        'Das kleinste sinnvolle Stück: Entwurf steht',
        'Kurz notieren, wo es als Nächstes weitergeht',
        'Mail an Lena schreiben',
        'Alles dafür öffnen und zwei Minuten sichten',
      ].map(item),
    };
    const loaded = parseState(JSON.stringify({ ...base, tasks: { t1: task }, taskOrder: ['t1'] }))!;
    expect(loaded.tasks.t1!.checklist.map((i) => i.label)).toEqual(['Mail an Lena schreiben']);
  });
});
