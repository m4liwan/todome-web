import { afterEach, describe, expect, it } from 'vitest';
import { canUseFeature } from '../app/progression';
import { effectiveFocusStyle, focusTimerOn, inFocusRound } from '../app/focusTimer';
import { sessionTitle } from '../app/hooks';
import { totalXpForLevel } from '../domain/companionProgression';
import { focusStartKey, pomodoroBreakMessage, pomodoroFocusMessage, pomodoroPhase, pomodoroStatus, pomodoroStep } from '../domain/pomodoro';
import { foregroundSession, projectAll } from '../domain/session';
import { annotatePause, pauseSession, resumeSession } from '../state/commands';
import { Harness, MIN } from '../test/helpers';
import { emptyState } from '../state/defaults';
import { parseState } from '../state/store';
import { tick } from '../state/scheduler';
import { planCompanionVisit } from '../domain/companion';

/** A running deep-work session with the timer settings 25 / 5 / 15. */
function running() {
  const h = new Harness();
  const taskId = h.task('deep_work', 180);
  const sessionId = h.start(taskId, 180);
  const phase = () => pomodoroPhase(h.state, foregroundSession(projectAll(h.state, h.now))!, h.now);
  const pomodoroBreak = (min: number) => h.apply(pauseSession(h.state, h.deps(), sessionId, 'pomodoro', min));
  const resume = () => h.apply(resumeSession(h.state, h.deps(), sessionId));
  return { h, sessionId, phase, pomodoroBreak, resume };
}

describe('pomodoro phase', () => {
  it('starts with round 1 of 4 and the full 25 minutes', () => {
    const { phase } = running();
    expect(phase()).toMatchObject({ kind: 'focus', round: 1, rounds: 4, remainingMs: 25 * MIN, due: false });
  });

  it('counts down with the running time', () => {
    const { h, phase } = running();
    h.at(10);
    expect(phase()).toMatchObject({ kind: 'focus', round: 1, elapsedMs: 10 * MIN, remainingMs: 15 * MIN });
  });

  it('stops the clock during an ordinary pause', () => {
    const { h, sessionId, phase, resume } = running();
    h.at(10);
    h.apply(pauseSession(h.state, h.deps(), sessionId, 'private', null));
    h.at(30);
    expect(phase()).toMatchObject({ kind: 'focus', elapsedMs: 10 * MIN });
    resume();
    h.at(33);
    expect(phase()).toMatchObject({ kind: 'focus', round: 1, elapsedMs: 13 * MIN });
  });

  it('is due once the 25 minutes are full', () => {
    const { h, phase } = running();
    h.at(25);
    expect(phase()).toMatchObject({ kind: 'focus', remainingMs: 0, due: true });
  });

  it('shows the break while a pomodoro pause runs', () => {
    const { h, phase, pomodoroBreak } = running();
    h.at(25);
    pomodoroBreak(5);
    h.at(27);
    expect(phase()).toMatchObject({ kind: 'break', round: 1, long: false, remainingMs: 3 * MIN });
  });

  it('starts round 2 fresh after the break', () => {
    const { h, phase, pomodoroBreak, resume } = running();
    h.at(25);
    pomodoroBreak(5);
    h.at(30);
    resume();
    h.at(31);
    expect(phase()).toMatchObject({ kind: 'focus', round: 2, elapsedMs: 1 * MIN, startedAt: h.now - 1 * MIN });
  });

  it('marks the fourth break as the long one and starts over with round 1', () => {
    const { h, phase, pomodoroBreak, resume } = running();
    let t = 0;
    for (let round = 1; round <= 4; round++) {
      h.at((t += 25));
      pomodoroBreak(round === 4 ? 15 : 5);
      if (round < 4) {
        h.at((t += 5));
        resume();
      }
    }
    expect(phase()).toMatchObject({ kind: 'break', round: 4, long: true });
    h.at((t += 15));
    resume();
    expect(phase()).toMatchObject({ kind: 'focus', round: 1 });
  });
});

describe('pomodoro settings from stored data', () => {
  const stored = (pomodoro: unknown) => {
    const base = emptyState();
    return parseState(JSON.stringify({ ...base, settings: { ...base.settings, pomodoro } }))!.settings.pomodoro;
  };

  it('gives data from before 1.16 the classic 25 / 5 / 15', () => {
    expect(stored(undefined)).toEqual({ focusMin: 25, breakMin: 5, longBreakMin: 15 });
  });

  it('keeps a valid own choice', () => {
    expect(stored({ focusMin: 50, breakMin: 10, longBreakMin: 30 })).toEqual({ focusMin: 50, breakMin: 10, longBreakMin: 30 });
  });

  it('replaces broken or absurd lengths field by field', () => {
    expect(stored({ focusMin: 0, breakMin: 'x', longBreakMin: 30 })).toEqual({ focusMin: 25, breakMin: 5, longBreakMin: 30 });
    expect(stored({ focusMin: 600, breakMin: 5, longBreakMin: -1 })).toEqual({ focusMin: 25, breakMin: 5, longBreakMin: 15 });
  });
});

describe('focus timer unlock (companion level 10)', () => {
  const at = (level: number) => {
    const s = emptyState();
    s.settings.appearance = { ...s.settings.appearance, focusStyle: 'pomodoro' };
    s.progression = { ...s.progression, stats: { ...s.progression.stats, xp: totalXpForLevel(level) } };
    return s;
  };
  afterEach(() => window.localStorage.removeItem('todome:pro-preview'));

  it('stays locked below level 10: a stored "pomodoro" falls back to the breathing focus', () => {
    expect(canUseFeature(at(9), 'focus_timer')).toBe(false);
    expect(focusTimerOn(at(9))).toBe(false);
    expect(effectiveFocusStyle(at(9))).toBe('breathe');
  });

  it('runs from level 10 on', () => {
    expect(focusTimerOn(at(10))).toBe(true);
    expect(effectiveFocusStyle(at(10))).toBe('pomodoro');
  });

  it('runs with Pro at any level', () => {
    window.localStorage.setItem('todome:pro-preview', '1');
    expect(focusTimerOn(at(1))).toBe(true);
  });

  it('is off when another focus style is chosen', () => {
    const s = at(10);
    s.settings.appearance = { ...s.settings.appearance, focusStyle: 'tunnel' };
    expect(focusTimerOn(s)).toBe(false);
    expect(effectiveFocusStyle(s)).toBe('tunnel');
  });
});

describe('fewer interruptions during a focus round', () => {
  /** Round 1 (0–25), break (25–30), round 2 from minute 30. */
  function inRoundTwo(timeboxMin = 180) {
    const h = new Harness();
    const taskId = h.task('deep_work', timeboxMin);
    const sessionId = h.start(taskId, timeboxMin);
    h.at(25);
    h.apply(pauseSession(h.state, h.deps(), sessionId, 'pomodoro', 5));
    h.at(30);
    h.apply(resumeSession(h.state, h.deps(), sessionId));
    return h;
  }
  const sentKinds = (h: Harness, focusTimer: boolean) => tick(h.state, h.deps(), { focusTimer }).sent.map((c) => c.kind);

  it('holds the focus pulse back while a round runs', () => {
    // Deep work asks its first pulse after 45 net minutes: minute 50 on the wall clock.
    const h = inRoundTwo().at(50);
    expect(sentKinds(h, false)).toEqual(['pulse']);
    expect(sentKinds(h, true)).toEqual([]);
  });

  it('still asks about an overrun (it protects the plan), even with a milestone held back', () => {
    const h = new Harness();
    h.start(h.task('deep_work', 15), 15);
    // Timebox 15 min: milestone at 12, overrun from 20 (+20 %, at least 5 min).
    h.at(21);
    expect(sentKinds(h, true)).toEqual(['overrun']);
  });

  it('still says when the break is over', () => {
    const h = new Harness();
    const sessionId = h.start(h.task('deep_work', 180), 180);
    h.at(25);
    h.apply(pauseSession(h.state, h.deps(), sessionId, 'pomodoro', 5));
    h.at(30);
    expect(sentKinds(h, true)).toEqual(['pause_over']);
  });
});

describe('companion visits with the focus timer', () => {
  const visit = (h: Harness, focusTimer: boolean) => planCompanionVisit(h.state, projectAll(h.state, h.now), h.now, { focusTimer });

  it('stays away while a round runs (no focus check, no water reminder)', () => {
    const h = new Harness();
    h.start(h.task('deep_work', 180), 180);
    h.at(10);
    // Without the timer, the water reminder (due 09:00) would show now.
    expect(visit(h, false)).toMatchObject({ kind: 'hydration' });
    expect(visit(h, true)).toBeNull();
  });

  it('brings the water reminder in the break instead', () => {
    const h = new Harness();
    const sessionId = h.start(h.task('deep_work', 180), 180);
    h.at(25);
    h.apply(pauseSession(h.state, h.deps(), sessionId, 'pomodoro', 5));
    h.at(26);
    expect(visit(h, true)).toMatchObject({ kind: 'hydration' });
  });
});

describe('when the break starts', () => {
  const due = (overdueMin: number, round = 1) => {
    const { h, phase, pomodoroBreak, resume } = running();
    let t = 0;
    for (let r = 1; r < round; r++) {
      h.at((t += 25));
      pomodoroBreak(5);
      h.at((t += 5));
      resume();
    }
    h.at(t + 25 + overdueMin);
    return { phase: phase(), settings: h.state.settings };
  };

  it('waits while a round is still running', () => {
    const { phase, settings } = due(-5);
    expect(pomodoroStep(phase, 'micro_pause', settings)).toBeNull();
  });

  it('starts the short break at the next pause of the hands', () => {
    const { phase, settings } = due(0);
    expect(pomodoroStep(phase, 'micro_pause', settings)).toEqual({ type: 'break', round: 1, long: false, plannedMin: 5 });
  });

  it('never cuts into a sentence, but waits at most 3 minutes', () => {
    expect(pomodoroStep(due(1).phase, 'typing', due(1).settings)).toBeNull();
    expect(pomodoroStep(due(3).phase, 'typing', due(3).settings)).toMatchObject({ type: 'break' });
  });

  it('starts it right away when nobody is at the desk (or without an input signal)', () => {
    expect(pomodoroStep(due(0).phase, 'away', due(0).settings)).toMatchObject({ type: 'break' });
    expect(pomodoroStep(due(0).phase, null, due(0).settings)).toMatchObject({ type: 'break' });
  });

  it('makes the fourth break the long one', () => {
    const { phase, settings } = due(0, 4);
    expect(pomodoroStep(phase, 'micro_pause', settings)).toEqual({ type: 'break', round: 4, long: true, plannedMin: 15 });
  });
});

describe('focus timer words', () => {
  it('names round, minutes and the task when a round starts', () => {
    const m = pomodoroFocusMessage('m1', 2, 25, 'Angebot schreiben');
    expect(m).toMatchObject({ kind: 'pomodoro', title: 'Runde 2 von 4' });
    expect(m.text).toContain('25 Minuten');
    expect(m.text).toContain('Angebot schreiben');
  });

  it('sends into a short or a long break', () => {
    expect(pomodoroBreakMessage('m2', { type: 'break', round: 1, long: false, plannedMin: 5 }).text).toContain('5 Minuten');
    expect(pomodoroBreakMessage('m3', { type: 'break', round: 4, long: true, plannedMin: 15 }).title).toBe('Lange Pause');
  });

  it('shows phase and time for the tray', () => {
    const { h, phase, pomodoroBreak } = running();
    h.at(6.5);
    expect(pomodoroStatus(phase())).toBe('Fokus 1/4 · 18:30');
    h.at(25);
    pomodoroBreak(5);
    h.at(26);
    expect(pomodoroStatus(phase())).toBe('Pause · 4:00');
  });

  it('comments only on the fresh start of a round, once', () => {
    const { h, sessionId, phase } = running();
    const first = focusStartKey(sessionId, phase(), h.now);
    expect(first).not.toBeNull();
    h.at(2);
    expect(focusStartKey(sessionId, phase(), h.now)).toBeNull();
  });
});

describe('focus round for the rest of the app', () => {
  const unlocked = (h: Harness) => {
    h.state.settings = { ...h.state.settings, appearance: { ...h.state.settings.appearance, focusStyle: 'pomodoro' } };
    h.state.progression = { ...h.state.progression, stats: { ...h.state.progression.stats, xp: totalXpForLevel(10) } };
    return h;
  };

  it('is a focus round while the timer runs, not in its break and not when locked', () => {
    const h = unlocked(new Harness());
    const sessionId = h.start(h.task('deep_work', 180), 180);
    h.at(10);
    expect(inFocusRound(h.state, h.now)).toBe(true);
    h.at(25);
    h.apply(pauseSession(h.state, h.deps(), sessionId, 'pomodoro', 5));
    expect(inFocusRound(h.state, h.now)).toBe(false);
    const locked = new Harness();
    locked.state.settings = h.state.settings;
    locked.start(locked.task(), 90);
    expect(inFocusRound(locked.state, locked.now)).toBe(false);
  });

  it('puts the timer phase into the tray and window title', () => {
    const h = unlocked(new Harness());
    h.start(h.task('deep_work', 180), 180);
    h.at(6.5);
    const fg = foregroundSession(projectAll(h.state, h.now))!;
    expect(sessionTitle(fg, 'Task deep_work', 0, pomodoroPhase(h.state, fg, h.now))).toBe('Fokus 1/4 · 18:30 · Task deep_work');
    expect(sessionTitle(fg, 'Task deep_work', 1, null)).toBe('● 2:53:30 · Task deep_work');
  });
});

describe('a longer break', () => {
  it('stays the timer break when "+10 min Pause" extends it', () => {
    const { h, sessionId, phase, pomodoroBreak } = running();
    h.at(25);
    pomodoroBreak(5);
    h.at(30);
    h.apply(annotatePause(h.state, h.deps(), sessionId, 'pomodoro', 15));
    expect(phase()).toMatchObject({ kind: 'break', plannedMin: 15, remainingMs: 10 * MIN });
  });
});

describe('focus timer words for a single minute', () => {
  it('says "1 Minute", not "1 Minuten"', () => {
    expect(pomodoroFocusMessage('m', 1, 1, 'Angebot').text).toContain('1 Minute nur');
    expect(pomodoroBreakMessage('m', { type: 'break', round: 1, long: false, plannedMin: 1 }).text).toContain('1 Minute Pause');
  });
});
