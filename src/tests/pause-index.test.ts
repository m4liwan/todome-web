import { describe, expect, it } from 'vitest';
import { careSummary, countedPauseMs, MAX_COUNTED_PAUSE_MS, weekSummary } from '../domain/reports';
import { compactSessions } from '../domain/archive';
import { projectAll } from '../domain/session';
import { pauseSession, resumeSession, stopSession } from '../state/commands';
import { Harness, MIN } from '../test/helpers';

const HOUR = 60 * MIN;
const week = (h: Harness, opts?: { maxPauseMs?: number }) => weekSummary(h.state, projectAll(h.state, h.now), h.now, opts);

/** 1 min focus, then a pause that stays open for `pauseMin` (the reported case: 63:31 h). */
function parkedSession(pauseMin: number) {
  const h = new Harness();
  const sessionId = h.start(h.task('deep_work', 60), 60);
  h.at(1);
  h.apply(pauseSession(h.state, h.deps(), sessionId, 'none', null));
  h.at(1 + pauseMin);
  return { h, sessionId };
}

describe('pause time in the look back', () => {
  it('counts a pause left open over nights at most 90 minutes (the session was parked, not resting)', () => {
    const { h } = parkedSession(63 * 60 + 31);
    const w = week(h);
    expect(w.focusMs).toBe(1 * MIN);
    expect(w.pauseMs).toBe(MAX_COUNTED_PAUSE_MS);
    expect(MAX_COUNTED_PAUSE_MS).toBe(90 * MIN);
  });

  it('caps every single pause, also in a stopped session, and keeps ordinary pauses whole', () => {
    const h = new Harness();
    const sessionId = h.start(h.task('deep_work', 480), 480);
    h.at(30);
    h.apply(pauseSession(h.state, h.deps(), sessionId, 'planned_break', 15));
    h.at(45);
    h.apply(resumeSession(h.state, h.deps(), sessionId));
    h.at(60);
    h.apply(pauseSession(h.state, h.deps(), sessionId, 'none', null));
    h.at(60 + 10 * 60); // computer slept 10 h inside this pause
    h.apply(resumeSession(h.state, h.deps(), sessionId));
    h.at(60 + 10 * 60 + 30);
    h.apply(stopSession(h.state, h.deps(), sessionId, 'achieved'));
    expect(week(h).pauseMs).toBe(15 * MIN + 90 * MIN);
  });

  it('lets the cap be set for the calculation', () => {
    const { h } = parkedSession(5 * 60);
    expect(week(h, { maxPauseMs: 30 * MIN }).pauseMs).toBe(30 * MIN);
  });

  it('cleans pauses of sessions condensed into the archive', () => {
    const { h, sessionId } = parkedSession(20 * 60);
    h.apply(resumeSession(h.state, h.deps(), sessionId));
    h.apply(stopSession(h.state, h.deps(), sessionId, 'partial'));
    const p = projectAll(h.state, h.now).find((x) => x.sessionId === sessionId)!;
    expect(countedPauseMs(p)).toBe(90 * MIN);
    // A year later the session is condensed into a day summary.
    const later = compactSessions(h.state, h.now + 400 * 24 * HOUR).state;
    expect(later.archive[0]!.pauseMs).toBe(90 * MIN);
  });

  it('corrects day summaries archived before the cap (at most 90 min per session)', () => {
    const { h } = parkedSession(0);
    h.state = {
      ...h.state,
      sessions: {},
      events: [],
      archive: [{ day: '2026-11-03', taskId: 't', taskTitle: 'Alt', clientId: null, clientName: 'Intern', billable: false, netMs: 60 * MIN, pauseMs: 63 * HOUR, billableMin: 0, sessions: 2, interruptions: 0, achieved: 1 }],
    };
    expect(week(h).pauseMs).toBe(2 * 90 * MIN);
  });
});

describe('pause index', () => {
  it('never shows more than 200 %', () => {
    const { h } = parkedSession(63 * 60 + 31);
    const c = careSummary(h.state, week(h));
    expect(c.pauseRatio).toBe(2);
  });

  it('keeps ordinary ratios exact', () => {
    const h = new Harness();
    const sessionId = h.start(h.task('deep_work', 120), 120);
    h.at(50);
    h.apply(pauseSession(h.state, h.deps(), sessionId, 'planned_break', 10));
    h.at(60);
    h.apply(resumeSession(h.state, h.deps(), sessionId));
    h.at(110);
    expect(careSummary(h.state, week(h)).pauseRatio).toBeCloseTo(10 / 100, 5);
  });
});
