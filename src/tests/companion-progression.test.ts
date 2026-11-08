import {
  FEATURE_UNLOCKS,
  TYPICAL_DAILY_XP,
  XP_RULES,
  applyTaskTransition,
  awardCompletion,
  effectTier,
  emptyProgression,
  isFeatureUnlocked,
  levelForXp,
  levelProgress,
  missedWorkdays,
  progressionAnnouncements,
  progressionEvents,
  registerActiveDay,
  rewardPath,
  visibleStreak,
  sanitizeProgression,
  streakMultiplier,
  totalXpForLevel,
  welcomeBackLine,
  xpForLevelUp,
  type CompanionProgression,
  type CompanionStats,
} from '../domain/companionProgression';
import type { Millis, Task } from '../domain/types';
import { bookGap, stopSession, toggleChecklistItem, updateTask } from '../state/commands';
import { emptyState } from '../state/defaults';
import { reducer } from '../state/reducer';
import { parseState } from '../state/store';
import { Harness, T0 } from '../test/helpers';

/** Local noon of a day in November 2026 (3 = Tuesday, 6 = Friday, 9 = Monday). */
const nov = (d: number, h = 12): Millis => new Date(2026, 10, d, h, 0, 0, 0).getTime();

function doTasks(p: CompanionProgression, count: number, at: Millis, prefix = 't'): CompanionProgression {
  let next = p;
  for (let i = 0; i < count; i++) next = awardCompletion(next, { kind: 'task', key: `${prefix}-${at}-${i}`, at });
  return next;
}

/** Builds a streak of `days` consecutive weekdays ending on the given day. */
function streakUntil(days: number, endDay: number): CompanionProgression {
  let p = emptyProgression();
  const workdays: number[] = [];
  for (let d = endDay; workdays.length < days; d--) {
    const wd = new Date(2026, 10, d).getDay();
    if (wd !== 0 && wd !== 6) workdays.unshift(d);
  }
  for (const d of workdays) p = awardCompletion(p, { kind: 'subtask', key: `warmup-${d}`, at: nov(d) });
  return p;
}

describe('level curve', () => {
  it('needs 180 + 13 × level XP for each next level', () => {
    expect(xpForLevelUp(1)).toBe(193);
    expect(xpForLevelUp(4)).toBe(232);
    expect(totalXpForLevel(1)).toBe(0);
    expect(totalXpForLevel(2)).toBe(193);
    expect(totalXpForLevel(5)).toBe(193 + 206 + 219 + 232);
  });

  it('paces the milestones for a typical day (~100 XP, ~21 active days a month)', () => {
    const activeDays = (level: number) => totalXpForLevel(level) / TYPICAL_DAILY_XP;
    expect(activeDays(5)).toBeGreaterThanOrEqual(5); // 1–2 weeks
    expect(activeDays(5)).toBeLessThanOrEqual(10);
    expect(activeDays(10)).toBeGreaterThanOrEqual(18); // about a month
    expect(activeDays(10)).toBeLessThanOrEqual(26);
    expect(activeDays(25)).toBeGreaterThanOrEqual(63); // 3–6 months
    expect(activeDays(25)).toBeLessThanOrEqual(126);
    expect(activeDays(50)).toBeGreaterThanOrEqual(230); // about a year of workdays
    expect(activeDays(50)).toBeLessThanOrEqual(270);
  });

  it('turns total XP into a level, never below 1', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(192)).toBe(1);
    expect(levelForXp(193)).toBe(2);
    expect(levelForXp(849)).toBe(4);
    expect(levelForXp(850)).toBe(5);
    expect(levelForXp(-50)).toBe(1);
    expect(levelForXp(Number.NaN)).toBe(1);
  });

  it('reports progress inside the current level for the XP bar', () => {
    expect(levelProgress(193 + 103)).toEqual({ level: 2, xpIntoLevel: 103, xpForNext: 206, ratio: 0.5 });
    expect(levelProgress(0).ratio).toBe(0);
  });
});

describe('streak multiplier', () => {
  it('rewards day 3 with 1.2× and day 7 with 1.5×', () => {
    expect([0, 1, 2].map(streakMultiplier)).toEqual([1, 1, 1]);
    expect([3, 6].map(streakMultiplier)).toEqual([1.2, 1.2]);
    expect([7, 30, 365].map(streakMultiplier)).toEqual([1.5, 1.5, 1.5]);
  });
});

describe('XP for tasks and sub-tasks', () => {
  it('gives 15 XP per task and starts a streak on the first active day', () => {
    const p = awardCompletion(emptyProgression(), { kind: 'task', key: 't:1', at: nov(3) });
    expect(p.stats.xp).toBe(XP_RULES.taskXp);
    expect(p.stats.streak).toBe(1);
    expect(p.stats.lastActiveDate).toBe('2026-11-03');
    expect(p.stats.tasksCompleted).toBe(1);
  });

  it('never pays the same completion twice (toggle farming)', () => {
    const once = awardCompletion(emptyProgression(), { kind: 'task', key: 't:1', at: nov(3) });
    const twice = awardCompletion(once, { kind: 'task', key: 't:1', at: nov(4) });
    expect(twice).toBe(once);
  });

  it('caps task XP at 150 per day but still counts every finished task', () => {
    const p = doTasks(emptyProgression(), 14, nov(3));
    expect(p.daily.taskXp).toBe(XP_RULES.dailyTaskCap);
    expect(p.stats.xp).toBe(150);
    expect(p.stats.tasksCompleted).toBe(14);
    // A new day opens a fresh allowance.
    const tomorrow = awardCompletion(p, { kind: 'task', key: 'next', at: nov(4) });
    expect(tomorrow.stats.xp).toBe(150 + 15);
  });

  it('applies the streak multiplier before the cap', () => {
    const day3 = awardCompletion(streakUntil(2, 4), { kind: 'task', key: 'x', at: nov(5) });
    expect(day3.stats.streak).toBe(3);
    expect(day3.daily.taskXp).toBe(18);
    const day7 = doTasks(streakUntil(6, 11), 7, nov(12));
    expect(day7.stats.streak).toBe(7);
    // 23 XP per task (15 × 1.5, rounded): six tasks are 138, the seventh fills up to 150.
    expect(day7.daily.taskXp).toBe(150);
  });

  it('pays a flat +5 XP per sub-task with its own small daily cap', () => {
    let p = streakUntil(7, 12);
    const before = p.stats.xp;
    p = awardCompletion(p, { kind: 'subtask', key: 's:a', at: nov(13) });
    expect(p.stats.xp - before).toBe(5);
    for (let i = 0; i < 30; i++) p = awardCompletion(p, { kind: 'subtask', key: `s:${i}`, at: nov(13) });
    expect(p.daily.subtaskXp).toBe(XP_RULES.dailySubtaskCap);
    expect(p.stats.subtasksCompleted).toBe(1 + 7 + 30);
  });

  it('keeps the cap when the clock is turned back (no fresh allowance)', () => {
    const full = doTasks(emptyProgression(), 12, nov(5));
    const skewed = awardCompletion(full, { kind: 'task', key: 'back', at: nov(4) });
    expect(skewed.daily.taskXp).toBe(150);
    expect(skewed.stats.xp).toBe(full.stats.xp);
    expect(skewed.stats.lastActiveDate).toBe('2026-11-05');
    expect(skewed.stats.streak).toBe(full.stats.streak);
  });

  it('forgets ledger entries after a few months so storage stays small', () => {
    const old = awardCompletion(emptyProgression(), { kind: 'task', key: 'ancient', at: new Date(2026, 0, 5, 12).getTime() });
    const later = awardCompletion(old, { kind: 'task', key: 'fresh', at: nov(3) });
    expect(Object.keys(later.ledger)).toEqual(['fresh']);
  });
});

describe('streak days, freezes and the welcome back', () => {
  it('counts only missed workdays: weekends never break a streak', () => {
    expect(missedWorkdays('2026-11-06', '2026-11-09')).toBe(0); // Fri → Mon
    expect(missedWorkdays('2026-11-03', '2026-11-04')).toBe(0);
    expect(missedWorkdays('2026-11-03', '2026-11-06')).toBe(2); // Wed + Thu
    expect(missedWorkdays('2026-11-03', '2026-11-03')).toBe(0);
    expect(missedWorkdays('2020-01-01', '2026-11-03')).toBe(Number.POSITIVE_INFINITY);
  });

  it('continues a streak over the weekend', () => {
    const fri = awardCompletion(streakUntil(4, 5), { kind: 'task', key: 'fri', at: nov(6) });
    const mon = awardCompletion(fri, { kind: 'task', key: 'mon', at: nov(9) });
    expect(mon.stats.streak).toBe(6);
  });

  it('keeps the streak with a freeze when one workday is missed', () => {
    const base = streakUntil(7, 11); // earns the first freeze on day 7
    expect(base.stats.streakFreezes).toBe(1);
    const r = registerActiveDay(base.stats, '2026-11-13');
    expect(r.outcome).toBe('bridged');
    expect(r.freezesUsed).toBe(1);
    expect(r.stats.streak).toBe(8);
    expect(r.stats.streakFreezes).toBe(0);
  });

  it('never burns freezes that could not save the streak', () => {
    const base = streakUntil(7, 11);
    const r = registerActiveDay(base.stats, '2026-11-16'); // Thu + Fri missed, only one freeze
    expect(r.outcome).toBe('fresh_start');
    expect(r.stats.streak).toBe(1);
    expect(r.stats.streakFreezes).toBe(1);
    expect(r.stats.maxStreak).toBe(7);
  });

  it('earns a freeze every 7 streak days, at most 3 in the bank', () => {
    let stats: CompanionStats = { ...emptyProgression().stats, streak: 6, lastActiveDate: '2026-11-03', streakFreezes: 3 };
    stats = registerActiveDay(stats, '2026-11-04').stats;
    expect(stats.streak).toBe(7);
    expect(stats.streakFreezes).toBe(XP_RULES.maxFreezes);
  });

  it('welcomes you back with a small comeback bonus instead of guilt', () => {
    const before = awardCompletion(emptyProgression(), { kind: 'task', key: 'a', at: nov(3) });
    const back = awardCompletion(before, { kind: 'task', key: 'b', at: nov(20) });
    expect(back.stats.streak).toBe(1);
    expect(back.stats.xp - before.stats.xp).toBe(15 + XP_RULES.comebackBonus);
    const events = progressionEvents(before, back);
    expect(events).toContainEqual({ type: 'welcome_back', daysAway: 17, bonusXp: XP_RULES.comebackBonus });
  });

  it('speaks warmly: no word of loss or guilt in any welcome back line', () => {
    for (let seed = 0; seed < 10; seed++) {
      const line = welcomeBackLine(seed);
      expect(line).toContain(`${XP_RULES.comebackBonus} XP`);
      expect(line).not.toMatch(/verpasst|verloren|schade|leider|endlich|vernachlässig|überfällig|\bmusst\b/i);
    }
  });
});

describe('feature gates', () => {
  it('unlocks the Pro features at level 5, 10 and 15', () => {
    expect(FEATURE_UNLOCKS.map((u) => [u.feature, u.level])).toEqual([
      ['advanced_stats', 5],
      ['focus_timer', 10],
      ['exclusive_themes', 15],
    ]);
    const atLevel = (level: number) => ({ ...emptyProgression().stats, xp: totalXpForLevel(level), level });
    expect(isFeatureUnlocked(atLevel(4), 'advanced_stats')).toBe(false);
    expect(isFeatureUnlocked(atLevel(5), 'advanced_stats')).toBe(true);
    expect(isFeatureUnlocked(atLevel(9), 'focus_timer')).toBe(false);
  });

  it('has no voice or sound unlock: level 25 brings the aura, and an old stored one is dropped', () => {
    expect(JSON.stringify(FEATURE_UNLOCKS)).not.toMatch(/stimme|voice|sound|klang/i);
    const at25 = rewardPath({ xp: totalXpForLevel(25), unlockedFeatures: [] }).find((s) => s.level === 25);
    expect(at25?.rewards.map((r) => r.title)).toEqual(['Aura']);
    const old = sanitizeProgression({ ...emptyProgression(), stats: { ...emptyProgression().stats, unlockedFeatures: ['advanced_stats', 'sound_packs'] } });
    expect(old.stats.unlockedFeatures).toEqual(['advanced_stats']);
  });

  it('records the unlock in the stats once the level is reached', () => {
    const p = awardCompletion({ ...emptyProgression(), stats: { ...emptyProgression().stats, xp: totalXpForLevel(5) - 5 } }, { kind: 'subtask', key: 's', at: nov(3) });
    expect(p.stats.level).toBe(5);
    expect(p.stats.unlockedFeatures).toEqual(['advanced_stats']);
  });

  it('lays out the reward path: features and looks per level, one next step', () => {
    const path = rewardPath({ xp: totalXpForLevel(12), unlockedFeatures: [] });
    expect(path.map((p) => [p.level, p.status])).toEqual([
      [5, 'reached'],
      [10, 'reached'],
      [15, 'next'],
      [25, 'later'],
      [50, 'later'],
    ]);
    expect(path[1]!.rewards.map((r) => r.title)).toEqual(['Fokus-Timer', 'Glitzern']);
    expect(path[2]!.xpToGo).toBe(totalXpForLevel(15) - totalXpForLevel(12));
    expect(path[0]!.xpToGo).toBe(0);
  });

  it('maps the level to the companion effect tier', () => {
    expect([1, 9, 10, 24, 25, 49, 50, 120].map(effectTier)).toEqual(['standard', 'standard', 'sparkle', 'sparkle', 'aura', 'aura', 'shiny', 'shiny']);
  });
});

describe('task transitions', () => {
  const task = (patch: Partial<Task> = {}): Task => ({
    id: 'task-1',
    title: 'Angebot schreiben',
    type: 'deep_work',
    clientId: null,
    estimateMin: 30,
    intention: '',
    status: 'planned',
    priority: 'normal',
    billable: false,
    checklist: [
      { id: 'c1', label: 'Gliederung', doneAt: null },
      { id: 'c2', label: 'Preise', doneAt: null },
    ],
    notes: '',
    plannedStart: null,
    plannedDay: '2026-11-03',
    createdAt: T0,
    updatedAt: T0,
    ...patch,
  });

  it('awards XP when a task turns done', () => {
    const p = applyTaskTransition(emptyProgression(), task(), task({ status: 'done' }), nov(3));
    expect(p.stats.xp).toBe(15);
  });

  it('awards each newly ticked sub-task once', () => {
    const before = task();
    const after = task({ checklist: [{ id: 'c1', label: 'Gliederung', doneAt: nov(3) }, before.checklist[1]!] });
    const p = applyTaskTransition(emptyProgression(), before, after, nov(3));
    expect(p.stats.xp).toBe(5);
    // Untick and tick again: nothing more.
    const again = applyTaskTransition(applyTaskTransition(p, after, before, nov(3)), before, after, nov(3));
    expect(again.stats.xp).toBe(5);
  });

  it('leaves the progression untouched for unrelated edits', () => {
    const p = emptyProgression();
    expect(applyTaskTransition(p, task(), task({ title: 'Neu' }), nov(3))).toBe(p);
    expect(applyTaskTransition(p, task({ status: 'done' }), task({ status: 'done', notes: 'x' }), nov(3))).toBe(p);
  });
});

describe('integration with the app state', () => {
  it('pays XP when a block ends with "geschafft"', () => {
    const h = new Harness();
    const id = h.task();
    const s = h.start(id);
    h.at(60).apply(stopSession(h.state, h.deps(), s, 'achieved'));
    expect(h.state.progression.stats.xp).toBe(15);
    expect(h.state.progression.stats.tasksCompleted).toBe(1);
  });

  it('pays nothing for a partial block and nothing twice on reopen', () => {
    const h = new Harness();
    const id = h.task();
    const s = h.start(id);
    h.at(30).apply(stopSession(h.state, h.deps(), s, 'partial'));
    expect(h.state.progression.stats.xp).toBe(0);
    h.apply(updateTask(h.state, h.deps(), id, { status: 'done' }));
    h.apply(updateTask(h.state, h.deps(), id, { status: 'planned' }));
    h.apply(updateTask(h.state, h.deps(), id, { status: 'done' }));
    expect(h.state.progression.stats.xp).toBe(15);
  });

  it('pays sub-task XP via the checklist and for a booked gap', () => {
    const h = new Harness();
    const id = h.task();
    h.apply(updateTask(h.state, h.deps(), id, { checklist: [{ id: 'c1', label: 'A', doneAt: null }] }));
    h.apply(toggleChecklistItem(h.state, h.deps(), id, 'c1'));
    expect(h.state.progression.stats.xp).toBe(5);
    h.at(120).apply(bookGap(h.state, h.deps(), { from: T0 + 60 * 60_000, to: T0 + 90 * 60_000, title: 'Telefonat', clientId: null, type: 'communication' }));
    expect(h.state.progression.stats.xp).toBe(20);
  });

  it('never pays for a replaced state (backup import, archive compaction)', () => {
    const state = emptyState();
    const imported = { ...emptyState(), tasks: { a: { id: 'a', status: 'done' } as Task } };
    expect(reducer(state, { type: 'state/replace', state: imported }).progression.stats.xp).toBe(0);
  });
});

describe('persistence', () => {
  it('gives data from older versions a fresh progression', () => {
    const old = { ...emptyState() } as Partial<ReturnType<typeof emptyState>>;
    delete old.progression;
    expect(parseState(JSON.stringify(old))!.progression).toEqual(emptyProgression());
  });

  it('survives a JSON round trip unchanged', () => {
    const h = new Harness();
    const s = h.start(h.task());
    h.at(60).apply(stopSession(h.state, h.deps(), s, 'achieved'));
    expect(parseState(JSON.stringify(h.state))!.progression).toEqual(h.state.progression);
  });

  it('repairs a corrupt progression without losing the rest of the state', () => {
    const state = emptyState();
    state.settings.userName = 'Lena';
    const raw = JSON.stringify({
      ...state,
      progression: {
        stats: { xp: '9999', level: 77, streak: -4, maxStreak: 'x', lastActiveDate: 'gestern', streakFreezes: 99, unlockedFeatures: ['hack', 'focus_timer'] },
        daily: { day: 42, taskXp: 1e9 },
        ledger: { ok: '2026-11-03', bad: 7, worse: 'kein Datum' },
      },
    });
    const parsed = parseState(raw)!;
    expect(parsed.settings.userName).toBe('Lena');
    const { stats, daily, ledger } = parsed.progression;
    expect(stats).toMatchObject({ xp: 0, level: 1, streak: 0, maxStreak: 0, lastActiveDate: null, streakFreezes: XP_RULES.maxFreezes });
    expect(stats.unlockedFeatures).toEqual(['focus_timer']);
    expect(daily).toEqual(emptyProgression().daily);
    expect(ledger).toEqual({ ok: '2026-11-03' });
  });

  it('recomputes the level from XP (XP is the source of truth)', () => {
    const p = sanitizeProgression({ stats: { xp: totalXpForLevel(6) + 3, level: 2 } });
    expect(p.stats.level).toBe(6);
    expect(p.stats.unlockedFeatures).toEqual(['advanced_stats']);
    expect(sanitizeProgression('kaputt')).toEqual(emptyProgression());
    expect(sanitizeProgression(null)).toEqual(emptyProgression());
  });
});

describe('what the hub and the toasts say', () => {
  const stats = (patch: Partial<CompanionStats>): CompanionStats => ({ ...emptyProgression().stats, ...patch });

  it('shows a streak while it can still be kept, else a quiet 0', () => {
    expect(visibleStreak(stats({}), '2026-11-03')).toBe(0);
    expect(visibleStreak(stats({ streak: 4, lastActiveDate: '2026-11-06' }), '2026-11-09')).toBe(4); // weekend
    expect(visibleStreak(stats({ streak: 4, lastActiveDate: '2026-11-04' }), '2026-11-06')).toBe(0); // Thu missed
    expect(visibleStreak(stats({ streak: 4, lastActiveDate: '2026-11-04', streakFreezes: 1 }), '2026-11-06')).toBe(4);
    expect(visibleStreak(stats({ streak: 4, lastActiveDate: '2026-11-06' }), '2026-11-05')).toBe(4); // clock skew
  });

  it('announces the big moments, most important first, at most two', () => {
    const lines = progressionAnnouncements(
      [
        { type: 'xp_gained', amount: 15 },
        { type: 'daily_cap_reached' },
        { type: 'feature_unlocked', feature: 'focus_timer' },
        { type: 'level_up', from: 9, to: 10 },
      ],
      'Spike',
    );
    expect(lines).toEqual(['Level 10! Spike wächst mit dir.', 'Freigeschaltet: Fokus-Timer.']);
    expect(progressionAnnouncements([{ type: 'xp_gained', amount: 15 }, { type: 'streak_extended', streak: 2 }], 'Spike')).toEqual([]);
    expect(progressionAnnouncements([{ type: 'streak_extended', streak: 3 }], 'Spike')).toEqual(['3 aktive Tage in Folge. Ab jetzt gibt es 1,2× XP.']);
  });
});

describe('progression events for the UI', () => {
  it('reports XP, level-ups and unlocks', () => {
    const prev = { ...emptyProgression(), stats: { ...emptyProgression().stats, xp: totalXpForLevel(5) - 10 } };
    const next = awardCompletion(sanitizeProgression(prev), { kind: 'task', key: 'k', at: nov(3) });
    const events = progressionEvents(sanitizeProgression(prev), next);
    expect(events).toContainEqual({ type: 'xp_gained', amount: 15 });
    expect(events).toContainEqual({ type: 'level_up', from: 4, to: 5 });
    expect(events).toContainEqual({ type: 'feature_unlocked', feature: 'advanced_stats' });
    expect(events).toContainEqual({ type: 'streak_extended', streak: 1 });
  });

  it('reports a used and an earned freeze', () => {
    const base = streakUntil(7, 11);
    expect(progressionEvents(streakUntil(6, 10), base)).toContainEqual({ type: 'freeze_earned', total: 1 });
    const bridged = awardCompletion(base, { kind: 'task', key: 'b', at: nov(13) });
    expect(progressionEvents(base, bridged)).toContainEqual({ type: 'freeze_used', count: 1 });
  });

  it('celebrates a full XP tank once instead of hiding the cap', () => {
    const almost = doTasks(emptyProgression(), 9, nov(3));
    const full = awardCompletion(almost, { kind: 'task', key: 'last', at: nov(3) });
    expect(progressionEvents(almost, full)).toContainEqual({ type: 'daily_cap_reached' });
    const more = awardCompletion(full, { kind: 'task', key: 'more', at: nov(3) });
    expect(progressionEvents(full, more)).toEqual([{ type: 'task_counted' }]);
  });

  it('is silent when nothing changed', () => {
    const p = emptyProgression();
    expect(progressionEvents(p, p)).toEqual([]);
  });
});
