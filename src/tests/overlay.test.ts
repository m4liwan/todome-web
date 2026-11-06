import { overlayState } from '../app/overlay';
import { projectSession } from '../domain/session';
import { pauseSession } from '../state/commands';
import { Harness } from '../test/helpers';

describe('mini overlay status', () => {
  it('shows the one thing calmly when nothing runs', () => {
    const h = new Harness();
    h.task();
    const s = overlayState(h.state, h.now, null);
    expect(s).toMatchObject({ status: 'idle', title: 'Task deep_work', progress: 0, hint: 'Wartet geduldig auf dich' });
  });

  it('turns progress into words, never numbers', () => {
    const h = new Harness();
    const sid = h.start(h.task(), 60);
    h.at(40);
    const p = projectSession(h.state, h.state.events, sid, h.now);
    const s = overlayState(h.state, h.now, p);
    expect(s.status).toBe('running');
    expect(s.hint).toBe('Ein gutes Stück geschafft');
    expect(s.hint).not.toMatch(/\d/);
    h.apply(pauseSession(h.state, h.deps(), sid));
    const paused = overlayState(h.state, h.now, projectSession(h.state, h.state.events, sid, h.now));
    expect(paused).toMatchObject({ status: 'paused', activity: 'tea' });
  });

  it('is gentle when running long', () => {
    const h = new Harness();
    const sid = h.start(h.task(), 30);
    h.at(50);
    const s = overlayState(h.state, h.now, projectSession(h.state, h.state.events, sid, h.now));
    expect(s).toMatchObject({ status: 'over', hint: 'Länger als geplant, ganz okay', progress: 1 });
  });
});
