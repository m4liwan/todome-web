import { describe, expect, it, beforeEach } from 'vitest';
import { inlineCompanion } from '../app/companion';
import { pomodoroTick } from '../app/pomodoro';
import type { Services } from '../app/services';
import { totalXpForLevel } from '../domain/companionProgression';
import { foregroundSession, projectAll } from '../domain/session';
import { createMemoryStore } from '../lib/storage';
import { createStore } from '../state/store';
import { Harness, MIN, T0 } from '../test/helpers';

/** A store with a running session (focus timer chosen) at companion `level`. */
function setup(level = 10, companion = true) {
  const h = new Harness();
  const sessionId = h.start(h.task('deep_work', 180), 180);
  const s = h.state;
  s.settings = {
    ...s.settings,
    onboarded: true,
    appearance: { ...s.settings.appearance, focusStyle: 'pomodoro' },
    companion: { ...s.settings.companion, enabled: companion },
  };
  s.progression = { ...s.progression, stats: { ...s.progression.stats, xp: totalXpForLevel(level) } };
  const store = createStore({ storage: createMemoryStore(), key: 'k', initial: s });
  let now = T0;
  let n = 0;
  const said: string[] = [];
  const services = {
    store,
    clock: { now: () => now },
    mode: 'live',
    deps: () => ({ now, newId: () => `p${++n}` }),
    run: (r: { ok: boolean; actions?: unknown }) => {
      if (r.ok) store.dispatch((r as { actions: Parameters<typeof store.dispatch>[0] }).actions);
      return r.ok;
    },
    announce: (m: string) => void said.push(m),
  } as unknown as Services;
  const seen = new Set<string>();
  return {
    services,
    store,
    said,
    sessionId,
    at: (min: number) => void (now = T0 + min * MIN),
    tick: (moment: 'typing' | 'micro_pause' | 'away' | null = 'micro_pause') => pomodoroTick(services, moment, seen),
    fg: () => foregroundSession(projectAll(store.getState(), now))!,
  };
}

beforeEach(() => inlineCompanion.set(null));

describe('focus timer in the app', () => {
  it('lets the companion comment once when a round starts', () => {
    const t = setup();
    t.tick();
    expect(inlineCompanion.get()?.message).toMatchObject({ kind: 'pomodoro', title: 'Runde 1 von 4' });
    const first = inlineCompanion.get()?.message.id;
    t.at(0.5);
    t.tick();
    expect(inlineCompanion.get()?.message.id).toBe(first);
  });

  it('does nothing below level 10', () => {
    const t = setup(9);
    t.at(26);
    t.tick();
    expect(inlineCompanion.get()).toBeNull();
    expect(t.fg().status).toBe('running');
  });

  it('starts the break by itself once the round is full', () => {
    const t = setup();
    t.tick();
    t.at(25);
    t.tick();
    expect(t.fg()).toMatchObject({ status: 'paused', currentPause: { reason: 'pomodoro', plannedMin: 5 } });
    expect(inlineCompanion.get()?.message).toMatchObject({ kind: 'pomodoro', title: 'Pause' });
  });

  it('keeps typing hands going, up to 3 minutes', () => {
    const t = setup();
    t.at(26);
    t.tick('typing');
    expect(t.fg().status).toBe('running');
    t.at(28);
    t.tick('typing');
    expect(t.fg().status).toBe('paused');
  });

  it('with the companion switched off, says it in the app instead', () => {
    const t = setup(10, false);
    t.at(25);
    t.tick();
    expect(t.fg().status).toBe('paused');
    expect(inlineCompanion.get()).toBeNull();
    expect(t.said.join(' ')).toContain('Pause');
  });
});
