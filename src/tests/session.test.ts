import { projectSession, overrunRatio, remainingMs, foregroundSession, projectAll, sessionStack } from '../domain/session';
import {
  pauseSession,
  resumeSession,
  interruptWith,
  returnToSession,
  extendSession,
  resolveIdle,
  correctSession,
  stopSession,
} from '../state/commands';
import { Harness, MIN, T0 } from '../test/helpers';

describe('session projection (event-sourced time)', () => {
  it('computes net time = gross − pauses', () => {
    const h = new Harness();
    const sid = h.start(h.task());
    h.at(30).apply(pauseSession(h.state, h.deps(), sid, 'planned_break', 10));
    h.at(45).apply(resumeSession(h.state, h.deps(), sid));
    const p = projectSession(h.state, h.state.events, sid, T0 + 60 * MIN)!;
    expect(p.status).toBe('running');
    expect(p.grossMs).toBe(60 * MIN);
    expect(p.pauseMs).toBe(15 * MIN);
    expect(p.netMs).toBe(45 * MIN);
    expect(p.pauseCount).toBe(1);
  });

  it('counts an open pause up to "now"', () => {
    const h = new Harness();
    const sid = h.start(h.task());
    h.at(20).apply(pauseSession(h.state, h.deps(), sid));
    const p = projectSession(h.state, h.state.events, sid, T0 + 50 * MIN)!;
    expect(p.status).toBe('paused');
    expect(p.netMs).toBe(20 * MIN);
    expect(p.pauseMs).toBe(30 * MIN);
    expect(p.currentPause?.since).toBe(T0 + 20 * MIN);
  });

  it('stacks interruptions and never double-counts time', () => {
    const h = new Harness();
    const c = h.client();
    const sid = h.start(h.task('deep_work', 90, c));
    const r = h.at(40).apply(
      interruptWith(h.state, h.deps(), { sessionId: sid, reason: 'client', title: 'Anruf', clientId: c, type: 'communication', parkingNote: 'Step 2' }),
    );
    const child = r.newSessionId!;
    h.at(55).apply(stopSession(h.state, h.deps(), child, 'achieved'));
    h.at(56).apply(returnToSession(h.state, h.deps(), sid));

    const all = projectAll(h.state, T0 + 70 * MIN);
    const parent = all.find((p) => p.sessionId === sid)!;
    const kid = all.find((p) => p.sessionId === child)!;
    expect(kid.netMs).toBe(15 * MIN);
    expect(parent.interruptMs).toBe(16 * MIN);
    expect(parent.netMs).toBe(54 * MIN);
    expect(parent.netMs + kid.netMs).toBe(69 * MIN); // 70 min wall − 1 min gap
    expect(parent.lastSnapshotId).not.toBeNull();
  });

  it('exposes the interrupted session on the stack while the child runs', () => {
    const h = new Harness();
    const sid = h.start(h.task());
    h.at(10).apply(interruptWith(h.state, h.deps(), { sessionId: sid, reason: 'client', title: 'Anruf', clientId: null, type: 'communication' }));
    const all = projectAll(h.state, h.now);
    expect(sessionStack(all).map((p) => p.sessionId)).toEqual([sid]);
    expect(foregroundSession(all)?.parentSessionId).toBe(sid);
  });

  it('deducts idle booked as break only where it overlaps running time', () => {
    const h = new Harness();
    const sid = h.start(h.task());
    h.at(60).apply(resolveIdle(h.state, h.deps(), sid, T0 + 30 * MIN, T0 + 48 * MIN, 'break'));
    const p = projectSession(h.state, h.state.events, sid, h.now)!;
    expect(p.idleDeductMs).toBe(18 * MIN);
    expect(p.netMs).toBe(42 * MIN);
  });

  it('keeps idle confirmed as "working" as working time', () => {
    const h = new Harness();
    const sid = h.start(h.task());
    h.at(60).apply(resolveIdle(h.state, h.deps(), sid, T0 + 30 * MIN, T0 + 48 * MIN, 'working'));
    expect(projectSession(h.state, h.state.events, sid, h.now)!.netMs).toBe(60 * MIN);
  });

  it('applies extensions and corrections without rewriting history', () => {
    const h = new Harness();
    const sid = h.start(h.task(), 60);
    h.at(70).apply(extendSession(h.state, h.deps(), sid, 25));
    h.at(80).apply(correctSession(h.state, h.deps(), sid, 15, 'Telefonat'));
    const p = projectSession(h.state, h.state.events, sid, h.now)!;
    expect(p.effectiveTimeboxMin).toBe(85);
    expect(p.netMs).toBe(65 * MIN);
    expect(remainingMs(p)).toBe(20 * MIN);
    expect(overrunRatio(p)).toBeCloseTo(65 / 60 - 1);
    expect(h.state.events.filter((e) => e.sessionId === sid)).toHaveLength(3);
  });

  it('freezes after stop', () => {
    const h = new Harness();
    const sid = h.start(h.task());
    h.at(30).apply(stopSession(h.state, h.deps(), sid, 'partial'));
    const p = projectSession(h.state, h.state.events, sid, T0 + 500 * MIN)!;
    expect(p.status).toBe('stopped');
    expect(p.netMs).toBe(30 * MIN);
    expect(h.state.tasks[p.taskId]?.status).toBe('planned');
  });
});
