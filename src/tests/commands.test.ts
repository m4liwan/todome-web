import {
  bookGap,
  correctSession,
  createTask,
  interruptWith,
  markWaiting,
  pauseSession,
  resumeSession,
  returnToSession,
  splitTask,
  startSession,
  stopSession,
} from '../state/commands';
import { parseState, createStore } from '../state/store';
import { emptyState } from '../state/defaults';
import { buildDemoState } from '../state/seed';
import { projectAll } from '../domain/session';
import { entriesToCsv, estimationFactor, roundMinutes, toTimeEntries, totalsByClient } from '../domain/reports';
import { createMemoryStore } from '../lib/storage';
import { Harness, MIN, T0 } from '../test/helpers';

describe('command invariants', () => {
  it('rejects a second foreground session', () => {
    const h = new Harness();
    h.start(h.task());
    const r = startSession(h.state, h.deps(), { taskId: h.task(), timeboxMin: 30, intention: '' });
    expect(r.ok).toBe(false);
  });

  it('validates task input', () => {
    const h = new Harness();
    expect(createTask(h.state, h.deps(), { title: ' ', type: 'admin', clientId: null, estimateMin: 30, intention: '' }).ok).toBe(false);
    expect(createTask(h.state, h.deps(), { title: 'x', type: 'admin', clientId: null, estimateMin: 2, intention: '' }).ok).toBe(false);
  });

  it('only resumes paused sessions and only returns to interrupted ones', () => {
    const h = new Harness();
    const sid = h.start(h.task());
    expect(resumeSession(h.state, h.deps(), sid).ok).toBe(false);
    h.at(5).apply(pauseSession(h.state, h.deps(), sid));
    expect(pauseSession(h.state, h.deps(), sid).ok).toBe(false);
    expect(returnToSession(h.state, h.deps(), sid).ok).toBe(false);
  });

  it('limits the interruption stack to 3', () => {
    const h = new Harness();
    let sid = h.start(h.task());
    for (let i = 1; i <= 3; i++) {
      sid = h.at(i).apply(interruptWith(h.state, h.deps(), { sessionId: sid, reason: 'client', title: `U${i}`, clientId: null, type: 'communication' })).newSessionId!;
    }
    expect(interruptWith(h.state, h.deps(), { sessionId: sid, reason: 'client', title: 'U4', clientId: null, type: 'communication' }).ok).toBe(false);
  });

  it('marks a task as waiting when client info is missing', () => {
    const h = new Harness();
    const tid = h.task();
    const sid = h.start(tid);
    h.at(20).apply(markWaiting(h.state, h.deps(), sid, 'Logo fehlt'));
    expect(h.state.tasks[tid]).toMatchObject({ status: 'waiting' });
    expect(h.state.tasks[tid]!.notes).toContain('Logo fehlt');
  });

  it('splits a task into sub-tasks and drops the original', () => {
    const h = new Harness();
    const tid = h.task('deep_work', 90);
    h.apply(splitTask(h.state, h.deps(), tid, ['A', 'B', 'C']));
    expect(h.state.tasks[tid]!.status).toBe('dropped');
    expect(h.state.taskOrder.slice(0, 3).map((id) => h.state.tasks[id]!.title)).toEqual(['A', 'B', 'C']);
  });

  it('refuses corrections larger than net time', () => {
    const h = new Harness();
    const sid = h.start(h.task());
    h.at(10);
    expect(correctSession(h.state, h.deps(), sid, 30, '').ok).toBe(false);
  });

  it('books gaps retroactively as finished sessions', () => {
    const h = new Harness();
    h.at(120).apply(bookGap(h.state, h.deps(), { from: T0 + 10 * MIN, to: T0 + 25 * MIN, title: 'Mails', clientId: null, type: 'communication' }));
    const [p] = projectAll(h.state, h.now);
    expect(p).toMatchObject({ status: 'stopped', netMs: 15 * MIN, startedAt: T0 + 10 * MIN });
  });
});

describe('reports', () => {
  it('rounds per client on export only', () => {
    expect(roundMinutes(31, 'fifteen')).toBe(45);
    expect(roundMinutes(31, 'six')).toBe(36);
    expect(roundMinutes(31.4, 'none')).toBe(31);
  });

  it('builds totals and a German CSV', () => {
    const h = new Harness();
    const c = h.client('Nordlicht', 90);
    const sid = h.start(h.task('deep_work', 60, c), 60);
    h.at(40).apply(stopSession(h.state, h.deps(), sid, 'achieved'));
    const entries = toTimeEntries(h.state, projectAll(h.state, h.now));
    const [total] = totalsByClient(entries, h.state.clients);
    expect(total).toMatchObject({ clientName: 'Nordlicht', billableMin: 40, amount: 60 });
    const csv = entriesToCsv(entries, h.state.clients);
    expect(csv.startsWith('﻿Datum;')).toBe(true);
    expect(csv).toContain(';40;40;90,00;60,00');
  });

  it('derives the personal estimation factor from history', () => {
    const state = buildDemoState(T0, (() => { let i = 0; return () => `d${++i}`; })());
    const f = estimationFactor(state, projectAll(state, T0), 'deep_work', null);
    expect(f).toBeCloseTo(1.2, 5);
  });
});

describe('store & persistence', () => {
  it('persists and restores state (with defaults for missing fields)', async () => {
    const storage = createMemoryStore();
    const store = createStore({ storage, key: 'k', initial: emptyState(), persistDelayMs: 0 });
    store.dispatch({ type: 'settings/update', patch: { userName: 'Lena' } });
    store.flush();
    await new Promise((r) => setTimeout(r, 5));
    const restored = parseState(storage.get('k'));
    expect(restored?.settings.userName).toBe('Lena');
    expect(restored?.settings.workdayEnd).toBe('17:45');
  });

  it('rejects corrupt or foreign payloads', () => {
    expect(parseState('{nope')).toBeNull();
    expect(parseState(JSON.stringify({ schemaVersion: 99 }))).toBeNull();
  });
});

describe('gap finder', () => {
  it('finds uncovered windows and skips lunch', async () => {
    const { findGaps } = await import('../domain/reports');
    const h = new Harness();
    const a = h.start(h.task());
    h.at(30).apply(stopSession(h.state, h.deps(), a, 'achieved'));
    const b = h.at(60).start(h.task());
    h.at(90).apply(stopSession(h.state, h.deps(), b, 'achieved'));
    const gaps = findGaps(projectAll(h.state, h.now), T0, T0 + 180 * MIN, 10 * MIN, [[T0 + 120 * MIN, T0 + 150 * MIN]]);
    expect(gaps).toEqual([
      [T0 + 30 * MIN, T0 + 60 * MIN],
      [T0 + 90 * MIN, T0 + 120 * MIN],
      [T0 + 150 * MIN, T0 + 180 * MIN],
    ]);
  });
});

describe('week summary', () => {
  it('collects focus time, finished tasks and the best day', async () => {
    const { weekSummary } = await import('../domain/reports');
    const h = new Harness();
    const sid = h.start(h.task('deep_work', 60), 60);
    h.at(50).apply(stopSession(h.state, h.deps(), sid, 'achieved'));
    const w = weekSummary(h.state, projectAll(h.state, h.now), h.now);
    expect(w.days).toHaveLength(7);
    expect(w.focusMs).toBe(50 * MIN);
    expect(w.tasksDone).toEqual(['Task deep_work']);
    expect(w.bestDay?.day).toBe('2026-11-03');
    expect(w.activeDays).toBe(1);
  });
});
