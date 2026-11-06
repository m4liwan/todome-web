import { gate, ignoredStreak, planSessionCheckIn, quietReason } from '../domain/checkinEngine';
import { projectSession } from '../domain/session';
import type { CheckIn } from '../domain/types';
import { extendSession, pauseSession } from '../state/commands';
import { DEFAULT_SETTINGS } from '../state/defaults';
import { Harness, MIN, T0 } from '../test/helpers';

const checkIn = (over: Partial<CheckIn>): CheckIn => ({
  id: Math.random().toString(36),
  kind: 'pulse',
  sessionId: 's',
  taskId: 't',
  channel: 'haptic',
  sentAt: T0,
  answeredAt: T0 + 1000,
  expiredAt: null,
  answer: 'ok',
  data: {},
  ...over,
});

function plan(h: Harness, sid: string, checkIns: CheckIn[] = [], focusSignalActive = false) {
  const p = projectSession(h.state, h.state.events, sid, h.now)!;
  const task = h.state.tasks[p.taskId]!;
  return planSessionCheckIn({ projection: p, taskType: task.type, checkIns, now: h.now, focusSignalActive });
}

describe('check-in engine', () => {
  it('keeps deep work quiet for 45 min, then pulses', () => {
    const h = new Harness();
    const sid = h.start(h.task('deep_work', 90), 90);
    const next = plan(h, sid)!;
    expect(next.kind).toBe('pulse');
    expect(next.dueAt).toBe(T0 + 45 * MIN);
    expect(next.channel).toBe('haptic');
  });

  it('shifts due times by pause length (net time based)', () => {
    const h = new Harness();
    const sid = h.start(h.task('deep_work', 90), 90);
    h.at(20).apply(pauseSession(h.state, h.deps(), sid));
    h.at(30).apply({ ok: true, actions: [{ type: 'session/event', event: { id: 'r', type: 'resumed', sessionId: sid, at: h.now } }] });
    expect(plan(h, sid)!.dueAt).toBe(T0 + 55 * MIN);
  });

  it('nudges acquisition after 3 minutes ("first sentence?")', () => {
    const h = new Harness();
    const sid = h.start(h.task('acquisition', 30), 30);
    const next = plan(h, sid)!;
    expect(next.kind).toBe('first_step');
    expect(next.dueAt).toBe(T0 + 3 * MIN);
  });

  it('fires milestone at 80 % for communication', () => {
    const h = new Harness();
    const sid = h.start(h.task('communication', 25), 25);
    expect(plan(h, sid)).toMatchObject({ kind: 'milestone', dueAt: T0 + 20 * MIN });
  });

  it('plans overrun at timebox + tolerance and moves it after an extension', () => {
    const h = new Harness();
    const sid = h.start(h.task('admin', 30), 30);
    expect(plan(h, sid)).toMatchObject({ kind: 'overrun', dueAt: T0 + 35 * MIN, channel: 'push' });
    const sent = checkIn({ kind: 'overrun', sessionId: sid, data: { threshold: 35 * MIN }, sentAt: T0 + 35 * MIN });
    h.at(36).apply(extendSession(h.state, h.deps(), sid, 10));
    expect(plan(h, sid, [sent])).toMatchObject({ kind: 'overrun', dueAt: T0 + 45 * MIN });
  });

  it('never prompts overrun for exploration', () => {
    const h = new Harness();
    const sid = h.start(h.task('exploration', 60), 60);
    expect(plan(h, sid)).toBeNull();
  });

  it('allows only one open prompt per session', () => {
    const h = new Harness();
    const sid = h.start(h.task('deep_work'), 90);
    expect(plan(h, sid, [checkIn({ sessionId: sid, answeredAt: null, answer: null })])).toBeNull();
  });

  it('after an ignored prompt in the phase only the overrun remains', () => {
    const h = new Harness();
    const sid = h.start(h.task('deep_work'), 90);
    h.at(50);
    const ignored = checkIn({ sessionId: sid, sentAt: T0 + 45 * MIN, answeredAt: null, answer: null, expiredAt: T0 + 50 * MIN, data: { netMs: 45 * MIN } });
    expect(plan(h, sid, [ignored])).toMatchObject({ kind: 'overrun' });
  });

  it('slows down and gets quieter after two ignored prompts', () => {
    const history = [
      checkIn({ sentAt: 1, answeredAt: null, expiredAt: 2 }),
      checkIn({ sentAt: 3, answeredAt: null, expiredAt: 4 }),
    ];
    expect(ignoredStreak(history)).toBe(2);
    expect(ignoredStreak([...history, checkIn({ sentAt: 5 })])).toBe(0);
  });

  it('defers pulses while a focus signal is active', () => {
    const h = new Harness();
    const sid = h.start(h.task('deep_work', 120), 120);
    expect(plan(h, sid, [], true)!.dueAt).toBe(T0 + 60 * MIN);
  });

  it('reminds when a planned pause is over – once per planned length', () => {
    const h = new Harness();
    const sid = h.start(h.task());
    h.at(30).apply(pauseSession(h.state, h.deps(), sid, 'planned_break', 15));
    const next = plan(h, sid)!;
    expect(next).toMatchObject({ kind: 'pause_over', dueAt: T0 + 45 * MIN });
    const sent = checkIn({ kind: 'pause_over', sessionId: sid, data: { pauseSince: T0 + 30 * MIN, plannedMin: 15 } });
    expect(plan(h, sid, [sent])).toBeNull();
  });
});

describe('gate (quiet hours & caps)', () => {
  const settings = { ...DEFAULT_SETTINGS };
  const due = { kind: 'pulse' as const, sessionId: 's', taskId: 't', dueAt: T0, channel: 'haptic' as const, data: {}, priority: 3 };

  it('blocks during lunch and do-not-disturb', () => {
    const lunch = new Date(2026, 10, 3, 12, 30).getTime();
    expect(quietReason(lunch, settings)).toBe('lunch');
    expect(gate({ ...due, dueAt: lunch }, lunch, settings, [])).toEqual({ allowed: false, reason: 'lunch' });
    expect(gate(due, T0, { ...settings, doNotDisturb: true }, [])).toEqual({ allowed: false, reason: 'dnd' });
  });

  it('caps prompts per hour but lets overruns through', () => {
    const recent = [1, 2, 3].map((i) => checkIn({ sentAt: T0 - i * MIN }));
    expect(gate(due, T0, settings, recent)).toEqual({ allowed: false, reason: 'cap' });
    expect(gate({ ...due, kind: 'overrun' }, T0, settings, recent)).toEqual({ allowed: true });
  });

  it('lets session prompts through after hours, but not coach nudges', () => {
    const late = new Date(2026, 10, 3, 20, 0).getTime();
    expect(gate({ ...due, dueAt: late }, late, settings, [])).toEqual({ allowed: true });
    expect(gate({ ...due, kind: 'break_suggestion', dueAt: late }, late, settings, [])).toEqual({ allowed: false, reason: 'after_hours' });
  });
});
