import { tick } from '../state/scheduler';
import { handleAnswer } from '../state/promptHandlers';
import { projectSession } from '../domain/session';
import { pauseSession, startSession } from '../state/commands';
import { Harness, MIN, T0 } from '../test/helpers';

function runTick(h: Harness) {
  const r = tick(h.state, h.deps());
  h.apply({ ok: true, actions: r.actions });
  return r;
}

describe('scheduler tick', () => {
  it('sends nothing before due, then exactly one prompt', () => {
    const h = new Harness();
    h.start(h.task('deep_work', 90), 90);
    expect(runTick(h.at(44)).sent).toHaveLength(0);
    const r = runTick(h.at(45));
    expect(r.sent.map((c) => c.kind)).toEqual(['pulse']);
    expect(runTick(h.at(46)).sent).toHaveLength(0); // still open
  });

  it('expires unanswered prompts and records them as ignored', () => {
    const h = new Harness();
    h.start(h.task('deep_work', 90), 90);
    runTick(h.at(45));
    runTick(h.at(51));
    const c = Object.values(h.state.checkIns)[0]!;
    expect(c.expiredAt).toBe(T0 + 51 * MIN);
  });

  it('runs the overrun flow end to end: +10 extends the timebox', () => {
    const h = new Harness();
    const sid = h.start(h.task('admin', 30), 30);
    const r = runTick(h.at(35));
    const overrun = r.sent.find((c) => c.kind === 'overrun')!;
    const outcome = handleAnswer(h.state, h.deps(), overrun, 'extend_10');
    h.apply(outcome.result);
    expect(projectSession(h.state, h.state.events, sid, h.now)!.effectiveTimeboxMin).toBe(40);
    expect(outcome.followUp).toBeNull();
  });

  it('suggests a break after the focus budget across task switches', () => {
    const h = new Harness();
    const a = h.start(h.task('deep_work', 60), 60);
    h.at(60).apply({ ok: true, actions: [{ type: 'session/event', event: { id: 'x', type: 'stopped', sessionId: a, at: h.now, outcome: 'achieved' } }] });
    const t2 = h.task('deep_work', 60);
    h.at(62).apply(startSession(h.state, h.deps(), { taskId: t2, timeboxMin: 60, intention: 'x' }));
    // answer whatever session prompts come so they don't block
    for (let m = 62; m <= 92; m++) {
      const r = runTick(h.at(m));
      for (const c of r.sent) if (c.sessionId) h.apply(handleAnswer(h.state, h.deps(), c, 'ok').result);
      if (r.sent.some((c) => c.kind === 'break_suggestion')) {
        expect(m).toBeGreaterThanOrEqual(90);
        return;
      }
    }
    throw new Error('break suggestion was not sent');
  });

  it('take_break pauses the running session with a 15 min plan', () => {
    const h = new Harness();
    const sid = h.start(h.task('deep_work', 120), 120);
    h.at(95);
    const r = tick(h.state, h.deps());
    h.apply({ ok: true, actions: r.actions });
    const suggestion = Object.values(h.state.checkIns).find((c) => c.kind === 'break_suggestion')!;
    const out = handleAnswer(h.state, h.deps(), suggestion, 'take_break');
    h.apply(out.result);
    const p = projectSession(h.state, h.state.events, sid, h.now)!;
    expect(p.status).toBe('paused');
    expect(p.currentPause).toMatchObject({ reason: 'planned_break', plannedMin: 15 });
  });

  it('pause_over → "+10 min Pause" re-plans the reminder', () => {
    const h = new Harness();
    const sid = h.start(h.task());
    h.at(20).apply(pauseSession(h.state, h.deps(), sid, 'planned_break', 10));
    const first = runTick(h.at(30)).sent[0]!;
    expect(first.kind).toBe('pause_over');
    h.apply(handleAnswer(h.state, h.deps(), first, 'extend_pause').result);
    expect(runTick(h.at(35)).sent).toHaveLength(0);
    expect(runTick(h.at(40)).sent[0]?.kind).toBe('pause_over');
  });

  it('nudges a planned start that was missed by 10 minutes', () => {
    const h = new Harness();
    const tid = h.task('acquisition', 30);
    h.apply({ ok: true, actions: [{ type: 'task/update', id: tid, patch: { plannedStart: T0 + 15 * MIN }, at: h.now }] });
    expect(runTick(h.at(20)).sent).toHaveLength(0);
    const r = runTick(h.at(25));
    expect(r.sent[0]).toMatchObject({ kind: 'start_delay', taskId: tid });
    const out = handleAnswer(h.state, h.deps(), r.sent[0]!, 'start_5');
    h.apply(out.result);
    expect(Object.keys(h.state.sessions)).toHaveLength(1);
  });
});
