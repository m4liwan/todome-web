import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ServicesContext, type Services } from '../app/services';
import { MoodSection } from '../components/dialogs/SettingsSections';
import { FocusStyleMenu } from '../components/FocusStyle';
import { PomodoroClock } from '../components/PomodoroClock';
import { totalXpForLevel } from '../domain/companionProgression';
import type { AppState } from '../domain/types';
import { createMemoryStore } from '../lib/storage';
import { emptyState } from '../state/defaults';
import { createStore } from '../state/store';

function atLevel(level: number): AppState {
  const s = emptyState();
  s.progression = { ...s.progression, stats: { ...s.progression.stats, xp: totalXpForLevel(level), level } };
  return s;
}

function settingsAt(level: number) {
  const store = createStore({ storage: createMemoryStore(), key: 'k', initial: atLevel(level), persistDelayMs: 0 });
  const said: string[] = [];
  const services = { store, announce: (m: string) => void said.push(m) } as unknown as Services;
  render(
    <ServicesContext.Provider value={services}>
      <MoodSection />
    </ServicesContext.Provider>,
  );
  const group = screen.getByRole('radiogroup', { name: 'Fokus-Stil' });
  return { store, said, timer: within(group).getByRole('radio', { name: /Fokus-Timer/ }) };
}

describe('focus timer in the settings', () => {
  it('shows a lock with "ab Level 10" below level 10 and does not switch', () => {
    const { store, said, timer } = settingsAt(9);
    expect(timer.getAttribute('aria-disabled')).toBe('true');
    expect(timer.textContent).toContain('Ab Level 10');
    fireEvent.click(timer);
    expect(store.getState().settings.appearance.focusStyle).toBe('breathe');
    expect(said.join(' ')).toContain('Level 10');
  });

  it('can be chosen from level 10 on, and then offers the lengths', () => {
    const { store, timer } = settingsAt(10);
    expect(timer.getAttribute('aria-disabled')).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'Fokus-Runde' })).toBeNull();
    fireEvent.click(timer);
    expect(store.getState().settings.appearance.focusStyle).toBe('pomodoro');
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Fokus-Runde' })).getByRole('radio', { name: '50 min' }));
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Kurze Pause' })).getByRole('radio', { name: '10 min' }));
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Lange Pause' })).getByRole('radio', { name: '30 min' }));
    expect(store.getState().settings.pomodoro).toEqual({ focusMin: 50, breakMin: 10, longBreakMin: 30 });
  });
});

describe('focus timer in the running focus card', () => {
  it('locks the timer in the style menu below level 10', () => {
    let chosen: string | null = null;
    let lockedHint = 0;
    render(<FocusStyleMenu value="breathe" timerUnlocked={false} onLocked={() => lockedHint++} onChange={(s) => (chosen = s)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Atmender Fokus' }));
    const item = screen.getByRole('menuitemradio', { name: /Fokus-Timer/ });
    expect(item.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(item);
    expect(chosen).toBeNull();
    expect(lockedHint).toBe(1);
  });

  it('offers it from level 10 on', () => {
    let chosen: string | null = null;
    render(<FocusStyleMenu value="breathe" timerUnlocked onLocked={() => undefined} onChange={(s) => (chosen = s)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Atmender Fokus' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Fokus-Timer/ }));
    expect(chosen).toBe('pomodoro');
  });
});

describe('the timer clock in the focus card', () => {
  const focus = { kind: 'focus' as const, round: 2, rounds: 4, startedAt: 0, elapsedMs: 6.5 * 60_000, remainingMs: 18.5 * 60_000, due: false };

  it('shows the round, the time left and the four round marks', () => {
    render(<PomodoroClock phase={focus} />);
    expect(screen.getByRole('timer').textContent).toBe('18:30');
    expect(screen.getByText('Fokus-Runde 2 von 4')).toBeTruthy();
    const marks = screen.getByRole('list', { name: 'Runde 2 von 4' }).querySelectorAll('li');
    expect([...marks].map((m) => m.className)).toEqual(['is-done', 'is-on', '', '']);
  });

  it('says a full round waits for the break', () => {
    render(<PomodoroClock phase={{ ...focus, remainingMs: 0, due: true }} />);
    expect(screen.getByText('Runde geschafft, gleich Pause')).toBeTruthy();
  });

  it('shows the long break after round four', () => {
    render(<PomodoroClock phase={{ kind: 'break', round: 4, rounds: 4, long: true, startedAt: 0, plannedMin: 15, remainingMs: 12 * 60_000 }} />);
    expect(screen.getByRole('timer').textContent).toBe('12:00');
    expect(screen.getByText('Lange Pause nach Runde 4')).toBeTruthy();
  });
});
