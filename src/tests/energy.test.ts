import { avatarActivity, effectiveTone, energyMode, energyProfile, suggestTimebox, theOneThing } from '../domain/energy';
import { Harness, T0 } from '../test/helpers';

const setEnergy = (h: Harness, level: number) =>
  h.apply({ ok: true, actions: [{ type: 'wellbeing/mark', patch: { energyDay: '2026-11-03', energyLevel: level } }] });

describe('energy', () => {
  it('maps 1–10 to gentle, balanced and full power', () => {
    expect([1, 3, 4, 7, 8, 10].map(energyMode)).toEqual(['low', 'low', 'mid', 'mid', 'high', 'high']);
    expect(energyMode(null)).toBeNull();
  });

  it('switches to the gentle tone and micro timeboxes when energy is low', () => {
    const h = new Harness();
    setEnergy(h, 2);
    expect(effectiveTone(h.state, h.now)).toBe('gentle');
    const id = h.task('deep_work', 90);
    const task = h.state.tasks[id]!;
    expect(suggestTimebox(task, 1.2, energyProfile(h.state, h.now))).toBe(15);
  });

  it('suggests ambitious blocks on high energy', () => {
    const h = new Harness();
    setEnergy(h, 9);
    const id = h.task('deep_work', 45);
    const task = h.state.tasks[id]!;
    expect(suggestTimebox(task, null, energyProfile(h.state, h.now))).toBe(90);
  });

  it('shows exactly one thing: the running task, else the important one', () => {
    const h = new Harness();
    const a = h.task('admin', 30);
    const b = h.task('deep_work', 60);
    h.apply({ ok: true, actions: [{ type: 'task/update', id: b, patch: { priority: 'high' }, at: T0 }] });
    expect(theOneThing(h.state, h.now)?.id).toBe(b);
    h.start(a);
    expect(theOneThing(h.state, h.now)?.id).toBe(a);
  });

  it('lets the companion read along on learning tasks and wait when idle', () => {
    const h = new Harness();
    const id = h.task('learning', 30);
    const t = h.state.tasks[id]!;
    expect(avatarActivity(h.state, h.now, t)).toBe('reading');
    expect(avatarActivity(h.state, h.now, null)).toBe('waiting');
  });
});
