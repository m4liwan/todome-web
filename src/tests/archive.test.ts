import { archiveCutoffDay, compactSessions } from '../domain/archive';
import { entriesToCsv, totalsByClient, toTimeEntries } from '../domain/reports';
import { projectAll } from '../domain/session';
import { dayKey } from '../lib/time';
import { stopSession } from '../state/commands';
import { parseState } from '../state/store';
import { Harness, MIN, T0 } from '../test/helpers';

const DAY = 24 * 60;

function history() {
  const h = new Harness();
  const client = h.client('Nordlicht', 120);
  h.state = { ...h.state, clients: { ...h.state.clients, [client]: { ...h.state.clients[client]!, rounding: 'fifteen' } } };
  const task = h.task('deep_work', 60, client);
  h.at(-400 * DAY);
  const a = h.start(task);
  h.at(-400 * DAY + 50);
  h.apply(stopSession(h.state, h.deps(), a, 'partial'));
  h.at(-400 * DAY + 120);
  const b = h.start(task);
  h.at(-400 * DAY + 140);
  h.apply(stopSession(h.state, h.deps(), b, 'achieved'));
  h.at(-10 * DAY);
  const c = h.start(h.task('admin', 30, client));
  h.at(-10 * DAY + 30);
  h.apply(stopSession(h.state, h.deps(), c, 'achieved'));
  h.at(0);
  return { h, a, b, c, oldDay: dayKey(T0 - 400 * DAY * MIN) };
}

describe('session archive', () => {
  it('condenses sessions older than 12 months into exact day summaries', () => {
    const { h, a, b, c, oldDay } = history();
    const before = toTimeEntries(h.state, projectAll(h.state, T0)).filter((e) => e.day === oldDay);
    const billedBefore = totalsByClient(before, h.state.clients)[0]!;

    const { state, condensed } = compactSessions(h.state, T0);
    expect(condensed).toBe(2);
    expect(Object.keys(state.sessions)).toEqual([c]);
    expect(state.events.some((e) => e.sessionId === a || e.sessionId === b)).toBe(false);
    expect(state.archive).toHaveLength(1);
    expect(state.archive[0]).toMatchObject({ day: oldDay, sessions: 2, netMs: 70 * MIN, billableMin: 90, achieved: 1, clientName: 'Nordlicht' });

    const after = toTimeEntries(state, projectAll(state, T0)).filter((e) => e.day === oldDay);
    expect(after).toHaveLength(1);
    const billedAfter = totalsByClient(after, state.clients)[0]!;
    // Same money as before: rounding stays per original session (60 + 30 min).
    expect(billedAfter.billableMin).toBe(billedBefore.billableMin);
    expect(billedAfter.amount).toBeCloseTo(billedBefore.amount);
    expect(billedAfter.netMs).toBe(billedBefore.netMs);
    expect(entriesToCsv(after, state.clients)).toContain('Tagessumme (2 Sessions)');
  });

  it('does nothing when nothing is old and is stable when run again', () => {
    const { h } = history();
    const once = compactSessions(h.state, T0).state;
    expect(compactSessions(once, T0).state).toBe(once);
    const fresh = new Harness();
    expect(compactSessions(fresh.state, T0).state).toBe(fresh.state);
  });

  it('keeps an old session that a newer one still points to', () => {
    const { h, a, c } = history();
    const linked = { ...h.state, sessions: { ...h.state.sessions, [c]: { ...h.state.sessions[c]!, parentSessionId: a } } };
    const { state } = compactSessions(linked, T0);
    expect(state.sessions[a]).toBeDefined();
    expect(state.archive[0]!.sessions).toBe(1);
  });

  it('survives a save and reload', () => {
    const { h } = history();
    const { state } = compactSessions(h.state, T0);
    expect(parseState(JSON.stringify(state))!.archive).toEqual(state.archive);
    expect(parseState(JSON.stringify({ ...state, archive: undefined }))!.archive).toEqual([]);
  });

  it('cuts at the same calendar day one year back', () => {
    expect(archiveCutoffDay(new Date(2026, 10, 5, 12).getTime())).toBe('2025-11-05');
  });
});
