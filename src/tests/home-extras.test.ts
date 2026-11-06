import { thoughtFor } from '../components/HomeExtras';
import { emptyState } from '../state/defaults';
import { reducer } from '../state/reducer';
import { MIN, T0 } from '../test/helpers';

describe('home extras', () => {
  it('parks and releases thoughts', () => {
    let s = emptyState();
    s = reducer(s, { type: 'thought/add', thought: { id: 't1', text: 'Anrufen', createdAt: T0 } });
    s = reducer(s, { type: 'thought/add', thought: { id: 't2', text: 'Idee', createdAt: T0 + MIN } });
    expect(s.thoughts.map((t) => t.id)).toEqual(['t2', 't1']);
    s = reducer(s, { type: 'thought/remove', id: 't1' });
    expect(s.thoughts.map((t) => t.id)).toEqual(['t2']);
  });

  it('ticks micro routines per day without streaks', () => {
    let s = emptyState();
    s = reducer(s, { type: 'routine/toggle', day: '2026-11-04', id: 'air' });
    s = reducer(s, { type: 'routine/toggle', day: '2026-11-04', id: 'screen' });
    s = reducer(s, { type: 'routine/toggle', day: '2026-11-04', id: 'air' });
    expect(s.wellbeing.routines['2026-11-04']).toEqual(['screen']);
  });

  it('picks a stable daily thought', () => {
    expect(thoughtFor('2026-11-04', null)).toBe(thoughtFor('2026-11-04', null));
    expect(thoughtFor('2026-11-04', null, 1)).not.toBe(thoughtFor('2026-11-04', null));
  });
});
