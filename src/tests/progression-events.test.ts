import { canUseFeature, connectProgression, onProgression } from '../app/progression';
import { isAwardStep, totalXpForLevel, type ProgressionEvent } from '../domain/companionProgression';
import { createMemoryStore } from '../lib/storage';
import { stopSession, toggleChecklistItem, updateTask } from '../state/commands';
import { emptyState } from '../state/defaults';
import { createStore } from '../state/store';
import { Harness } from '../test/helpers';

function setup() {
  const h = new Harness();
  const store = createStore({ storage: createMemoryStore(), key: 'k', initial: h.state, persistDelayMs: 0 });
  const seen: ProgressionEvent[][] = [];
  const off = onProgression((e) => seen.push(e));
  const disconnect = connectProgression(store);
  /** Runs a command against the store, keeping the harness ids and clock. */
  const run = (make: (s: typeof h.state) => Parameters<typeof store.run>[0]) => {
    h.state = store.getState();
    store.run(make(h.state));
    h.state = store.getState();
  };
  return { h, store, seen, run, done: () => (off(), disconnect()) };
}

describe('task completion listener', () => {
  it('announces the XP of a finished block for the floating animation', () => {
    const { h, store, seen, run, done } = setup();
    const id = h.task();
    store.dispatch({ type: 'state/replace', state: h.state });
    const s = h.start(id);
    store.dispatch({ type: 'state/replace', state: h.state });
    seen.length = 0;
    h.at(45);
    run((st) => stopSession(st, h.deps(), s, 'achieved'));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContainEqual({ type: 'xp_gained', amount: 15 });
    expect(seen[0]).toContainEqual({ type: 'streak_extended', streak: 1 });
    done();
  });

  it('stays silent for edits that complete nothing', () => {
    const { h, store, seen, run, done } = setup();
    const id = h.task();
    store.dispatch({ type: 'state/replace', state: h.state });
    run((st) => updateTask(st, h.deps(), id, { title: 'Neuer Titel' }));
    expect(seen).toEqual([]);
    done();
  });

  it('announces each ticked step', () => {
    const { h, store, seen, run, done } = setup();
    const id = h.task();
    h.apply(updateTask(h.state, h.deps(), id, { checklist: [{ id: 'c1', label: 'A', doneAt: null }] }));
    store.dispatch({ type: 'state/replace', state: h.state });
    run((st) => toggleChecklistItem(st, h.deps(), id, 'c1'));
    expect(seen).toEqual([[{ type: 'streak_extended', streak: 1 }, { type: 'xp_gained', amount: 5 }]]);
    done();
  });

  it('does not celebrate an imported backup as progress', () => {
    const { store, seen, done } = setup();
    const imported = emptyState();
    imported.progression = { ...imported.progression, stats: { ...imported.progression.stats, xp: 9000, tasksCompleted: 400 }, ledger: { 't:x': '2026-11-01' } };
    store.dispatch({ type: 'state/replace', state: imported });
    expect(seen).toEqual([]);
    expect(isAwardStep(emptyState().progression, imported.progression)).toBe(false);
    done();
  });

  it('keeps the task flow alive when a listener throws', () => {
    const { h, store, run, done } = setup();
    const off = onProgression(() => {
      throw new Error('animation broke');
    });
    const id = h.task();
    store.dispatch({ type: 'state/replace', state: h.state });
    expect(() => run((st) => updateTask(st, h.deps(), id, { status: 'done' }))).not.toThrow();
    expect(store.getState().tasks[id]!.status).toBe('done');
    off();
    done();
  });
});

describe('feature gate', () => {
  it('opens a feature by level, or everything with Pro', () => {
    const state = emptyState();
    expect(canUseFeature(state, 'focus_timer', false)).toBe(false);
    expect(canUseFeature(state, 'focus_timer', true)).toBe(true);
    state.progression = { ...state.progression, stats: { ...state.progression.stats, xp: totalXpForLevel(10) } };
    expect(canUseFeature(state, 'focus_timer', false)).toBe(true);
    expect(canUseFeature(state, 'exclusive_themes', false)).toBe(false);
  });
});
