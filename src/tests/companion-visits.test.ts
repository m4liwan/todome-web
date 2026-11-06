import { planCompanionVisit, PRIORITY_FACTOR, waterToday } from '../domain/companion';
import { describeCode, eveningAdvice, localIsoToEpoch, parseForecast } from '../domain/weather';
import { projectAll } from '../domain/session';
import { parseState } from '../state/store';
import { Harness, MIN, T0 } from '../test/helpers';

function plan(h: Harness) {
  return planCompanionVisit(h.state, projectAll(h.state, h.now), h.now);
}

describe('companion visits', () => {
  it('scales the focus visit interval by task priority', () => {
    expect(PRIORITY_FACTOR.high).toBeLessThan(1);
    const h = new Harness();
    h.state = { ...h.state, settings: { ...h.state.settings, companion: { ...h.state.settings.companion, hydrationIntervalMin: 0 } } };
    const tid = h.task('deep_work', 90);
    h.apply({ ok: true, actions: [{ type: 'task/update', id: tid, patch: { priority: 'high' }, at: h.now }] });
    h.start(tid);
    expect(plan(h)).toMatchObject({ kind: 'focus_check', dueAt: T0 + 18 * MIN }); // 30 × 0.6
  });

  it('waits after a recent interaction and stays away during do-not-disturb', () => {
    const h = new Harness();
    h.state = { ...h.state, settings: { ...h.state.settings, companion: { ...h.state.settings.companion, hydrationIntervalMin: 0 } } };
    h.start(h.task());
    h.apply({ ok: true, actions: [{ type: 'wellbeing/mark', patch: { lastVisitAt: T0 + 20 * MIN } }] });
    expect(plan(h)?.dueAt).toBe(T0 + 50 * MIN);
    h.apply({ ok: true, actions: [{ type: 'settings/update', patch: { doNotDisturb: true } }] });
    expect(plan(h)).toBeNull();
  });

  it('reminds to drink within working hours and counts water per day', () => {
    const h = new Harness();
    expect(plan(h)).toMatchObject({ kind: 'hydration', dueAt: new Date(2026, 10, 3, 9, 0).getTime() });
    h.apply({ ok: true, actions: [{ type: 'wellbeing/water', at: h.now, day: '2026-11-03', delta: 1 }] });
    expect(waterToday(h.state, h.now)).toBe(1);
    expect(plan(h)?.dueAt).toBe(T0 + 60 * MIN);
    expect(waterToday(h.state, T0 + 24 * 60 * MIN)).toBe(0);
  });
});

describe('weather', () => {
  const sample = {
    utc_offset_seconds: 3600,
    current: { temperature_2m: 8.4, weather_code: 2, is_day: 1 },
    hourly: {
      time: ['2026-11-03T17:00', '2026-11-03T18:00', '2026-11-03T19:00', '2026-11-03T20:00', '2026-11-03T21:00'],
      temperature_2m: [6, 4, 3, 2.4, 2],
      precipitation_probability: [10, 20, 30, 20, 10],
      weather_code: [3, 3, 3, 3, 3],
    },
    daily: { temperature_2m_max: [11], temperature_2m_min: [1] },
  };

  it('parses local times with the UTC offset', () => {
    expect(localIsoToEpoch('2026-11-03T18:00', 3600)).toBe(Date.UTC(2026, 10, 3, 17, 0));
    const w = parseForecast(sample, { name: 'Wetzlar', latitude: 50.5, longitude: 8.5 }, 0)!;
    expect(w.hourly).toHaveLength(5);
    expect(w.current.temp).toBeCloseTo(8.4);
  });

  it('tells you to dress warmly when the evening gets cold', () => {
    const w = parseForecast(sample, { name: 'Wetzlar', latitude: 50.5, longitude: 8.5 }, 0)!;
    const now = new Date(2026, 10, 3, 12, 0).getTime();
    // Hours are in UTC+1 local time of the sample; shift them to this machine's local evening.
    const local = { ...w, hourly: w.hourly.map((h, i) => ({ ...h, at: new Date(2026, 10, 3, 17 + i, 0).getTime() })) };
    const advice = eveningAdvice(local, '17:45', now)!;
    expect(advice.minTemp).toBe(2);
    expect(advice.text).toContain('warm');
    expect(describeCode(63).kind).toBe('rain');
  });

  it('migrates v1 state (priority, companion defaults, onboarding)', () => {
    const v1 = { schemaVersion: 1, tasks: { a: { id: 'a', title: 'x' } }, settings: { userName: 'Julian' }, events: [], taskOrder: ['a'] };
    const s = parseState(JSON.stringify(v1))!;
    expect(s.schemaVersion).toBe(4);
    expect(s.settings.appearance.palette).toBe('lime');
    expect(s.tasks.a?.priority).toBe('normal');
    expect(s.settings.companion.avatar).toBe('spike');
    expect(s.settings.onboarded).toBe(true);
    expect(s.wellbeing.waterCount).toBe(0);
  });
});
