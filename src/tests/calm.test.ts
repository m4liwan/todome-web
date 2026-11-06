import { describe, expect, it } from 'vitest';
import { calmStats } from '../domain/calm';
import { FEEL_REPLIES, shouldOfferSoftCheck } from '../domain/companion';
import { energyCopy } from '../domain/energy';
import { careSummary, weekSummary } from '../domain/reports';
import { projectAll } from '../domain/session';
import { pauseSession, resumeSession, stopSession } from '../state/commands';
import { emptyState } from '../state/defaults';
import { reducer } from '../state/reducer';
import { Harness } from '../test/helpers';

const at = (h: number, m = 0, month = 10, day = 4) => new Date(2026, month, day, h, m).getTime();

const NOW = new Date(2026, 10, 5, 10, 0).getTime();

describe('energy-adaptive wording', () => {
  it('suggests tiny steps on low energy and deep blocks on high energy', () => {
    expect(energyCopy('low').estimatePresets.every((m) => m <= 25)).toBe(true);
    expect(energyCopy('low').taskHint).toContain('80 %');
    expect(energyCopy('high').defaultEstimate).toBeGreaterThanOrEqual(60);
    expect(energyCopy(null)).toEqual(energyCopy('mid'));
  });

  it('never uses pressure words', () => {
    const all = (['low', 'mid', 'high'] as const).map((m) => Object.values(energyCopy(m)).join(' ')).join(' ');
    expect(all).not.toMatch(/überfällig|Deadline|\bmuss\b|\bmusst\b/i);
  });
});

describe('self-care look back', () => {
  it('measures pauses and kindness gently', () => {
    const h = new Harness();
    const sid = h.start(h.task('deep_work', 60), 60);
    h.at(40).apply(pauseSession(h.state, h.deps(), sid));
    h.at(48).apply(resumeSession(h.state, h.deps(), sid));
    h.at(60).apply(stopSession(h.state, h.deps(), sid, 'achieved'));
    h.state = reducer(h.state, { type: 'wellbeing/mark', patch: { proud: { '2026-11-03': 'Angefangen' }, closedLog: { '2026-11-03': true } } });
    const w = weekSummary(h.state, projectAll(h.state, h.now), h.now);
    const c = careSummary(h.state, w);
    expect(c.pauseRatio).toBeCloseTo(8 / 52, 2);
    expect(c.pauseWord).toContain('gesunder Rhythmus');
    expect(c.parts.find((p) => p.id === 'proud')?.value).toBe(1);
    expect(c.selfCompassion).toBeGreaterThan(40);
  });
});

describe('afternoon soft check', () => {
  const base = () => {
    const s = emptyState();
    return { ...s, settings: { ...s.settings, workdayStart: '08:00', workdayEnd: '18:00' } };
  };
  it('asks gently in the afternoon window only', () => {
    const s = base();
    expect(shouldOfferSoftCheck(s, at(15, 0), 6)).toBe(true);
    expect(shouldOfferSoftCheck(s, at(11, 0), 6)).toBe(false);
    expect(shouldOfferSoftCheck(s, at(17, 0), 6)).toBe(false);
  });
  it('stays quiet when already gentle, already asked or switched off', () => {
    const s = base();
    expect(shouldOfferSoftCheck(s, at(15, 0), 3)).toBe(false);
    expect(shouldOfferSoftCheck({ ...s, wellbeing: { ...s.wellbeing, softCheckDay: '2026-11-04' } }, at(15, 0), 6)).toBe(false);
    expect(shouldOfferSoftCheck({ ...s, settings: { ...s.settings, companion: { ...s.settings.companion, softCheck: false } } }, at(15, 0), 6)).toBe(false);
  });
});

describe('calm statistics', () => {
  it('counts parked thoughts and breaths of the last seven days', () => {
    let s = emptyState();
    s = reducer(s, { type: 'thought/add', thought: { id: 't1', text: 'Steuer', createdAt: NOW } });
    s = reducer(s, { type: 'wellbeing/mark', patch: { breathLog: { '2026-11-05': 2, '2026-10-01': 5 } } });
    const c = calmStats(s, [], NOW);
    expect(c.parked).toBe(1);
    expect(c.breaths).toBe(2);
    expect(c.protectedMs).toBe(0);
  });
  it('replies to every feeling without judging', () => {
    expect(Object.keys(FEEL_REPLIES).sort()).toEqual(['neutral', 'smooth', 'tough']);
  });
});
