import { describe, expect, it } from 'vitest';
import { planCoachPrompt } from '../domain/coach';
import { emptyState } from '../state/defaults';
import { reducer } from '../state/reducer';

describe('second shift', () => {
  it('reopens the day without touching what was done', () => {
    const base = emptyState();
    const closed = reducer({ ...base, wellbeing: { ...base.wellbeing, closedLog: { '2026-11-04': true } } }, { type: 'coach/closeDay', day: '2026-11-04' });
    const reopened = reducer(closed, { type: 'coach/reopenDay', day: '2026-11-04' });
    expect(reopened.coach.closedDay).toBeNull();
    expect(reopened.coach.secondShiftDay).toBe('2026-11-04');
    expect(reopened.wellbeing.closedLog['2026-11-04']).toBe(true);
    expect(reopened.sessions).toBe(closed.sessions);
    expect(reopened.tasks).toBe(closed.tasks);
  });
  it('ignores a reopen for another day', () => {
    const closed = reducer(emptyState(), { type: 'coach/closeDay', day: '2026-11-04' });
    expect(reducer(closed, { type: 'coach/reopenDay', day: '2026-11-05' })).toBe(closed);
  });
  it('does not ask about Feierabend again during the second shift', () => {
    const s = emptyState();
    const now = new Date(2026, 10, 4, 17, 50).getTime();
    const state = { ...s, settings: { ...s.settings, workdayEnd: '18:00' } };
    expect(planCoachPrompt(state, [], now)?.kind).toBe('shutdown');
    const shift = { ...state, coach: { ...state.coach, secondShiftDay: '2026-11-04' } };
    expect(planCoachPrompt(shift, [], now)).toBeNull();
  });
});
