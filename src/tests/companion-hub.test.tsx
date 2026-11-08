import { act, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CalmStats } from '../components/CalmStats';
import { CompanionHub, progressionTrail } from '../components/CompanionHub';
import { LevelBadge } from '../components/LevelBadge';
import { connectProgression } from '../app/progression';
import { freeState, isProPalette, themesUnlocked } from '../app/pro';
import { rewardPath, totalXpForLevel } from '../domain/companionProgression';
import type { AppState } from '../domain/types';
import { createMemoryStore } from '../lib/storage';
import { emptyState } from '../state/defaults';
import { createStore } from '../state/store';
import { T0 } from '../test/helpers';

function atLevel(level: number, patch: Partial<AppState['progression']['stats']> = {}): AppState {
  const s = emptyState();
  s.progression = { ...s.progression, stats: { ...s.progression.stats, xp: totalXpForLevel(level) + 40, level, ...patch } };
  return s;
}

describe('companion hub', () => {
  it('shows the companion, its level and the XP still to go', () => {
    render(<CompanionHub state={atLevel(4)} now={T0} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Spike Level 4');
    const bar = screen.getByRole('progressbar', { name: 'Fortschritt bis Level 5' });
    expect(bar.getAttribute('aria-valuenow')).toBe('40');
    expect(screen.getByText('Bei Level 5 wartet:').querySelector('strong')?.textContent).toBe('Erweiterte Statistiken');
  });

  it('shows streak, freezes and counts without guilt when the streak is over', () => {
    render(<CompanionHub state={atLevel(2, { streak: 5, maxStreak: 9, lastActiveDate: '2026-10-20', streakFreezes: 2, tasksCompleted: 31 })} now={T0} />);
    const stats = screen.getByRole('list', { name: 'Eure Zahlen' });
    expect(within(stats).getByText('0 Tage')).toBeTruthy();
    expect(within(stats).getByText(/Startet mit deinem nächsten erledigten Schritt/)).toBeTruthy();
    expect(within(stats).getByRole('img', { name: '2 von 3' })).toBeTruthy();
    expect(within(stats).getByText('31')).toBeTruthy();
    expect(stats.textContent).not.toMatch(/verloren|verpasst|leider/i);
  });

  it('walks the reward path: reached, the one next step, and later', () => {
    render(<CompanionHub state={atLevel(12)} now={T0} />);
    const steps = screen.getAllByRole('listitem').filter((li) => li.classList.contains('reward-path__step'));
    expect(steps.map((li) => li.className.replace('reward-path__step ', ''))).toEqual(['is-reached', 'is-reached', 'is-next', 'is-later', 'is-later']);
    expect(steps[2]!.getAttribute('aria-current')).toBe('step');
    expect(within(steps[0]!).getByText('Freigeschaltet')).toBeTruthy();
    // Earned, but the focus timer itself is not built yet: say so honestly. The sparkle is live.
    expect(within(steps[1]!).getAllByText(/kommt mit einem der nächsten Updates/)).toHaveLength(1);
    expect(within(steps[1]!).getAllByText('Freigeschaltet')).toHaveLength(1);
  });
});

describe('the next milestone in the hero', () => {
  it('names looks as well as features (level 30 still has the holofoil ahead)', () => {
    render(<CompanionHub state={atLevel(30)} now={T0} />);
    expect(screen.getByText('Bei Level 50 wartet:').querySelector('strong')?.textContent).toBe('Holofoil');
  });

  it('names everything a level brings', () => {
    render(<CompanionHub state={atLevel(7)} now={T0} />);
    expect(screen.getByText('Bei Level 10 wartet:').querySelector('strong')?.textContent).toBe('Fokus-Timer und Glitzern');
  });

  it('says all is earned only beyond the last milestone', () => {
    render(<CompanionHub state={atLevel(50)} now={T0} />);
    expect(screen.getByText(/Alle Belohnungen gehören euch/)).toBeTruthy();
  });
});

describe('level badge', () => {
  it('lets a "+15" rise from the badge for a gain while it is visible', () => {
    const state = emptyState();
    state.tasks.t = { id: 't', status: 'planned', checklist: [] } as unknown as AppState['tasks'][string];
    const store = createStore({ storage: createMemoryStore(), key: 'k', initial: state, persistDelayMs: 0 });
    const disconnect = connectProgression(store);
    const { container } = render(<LevelBadge level={1} />);
    expect(container.querySelector('.level-badge__float')).toBeNull();
    act(() => store.dispatch({ type: 'task/update', id: 't', patch: { status: 'done' }, at: T0 }));
    expect(container.querySelector('.level-badge__float')?.textContent).toBe('+15');
    expect(container.querySelector('.level-badge__float')?.getAttribute('aria-hidden')).toBe('true');
    disconnect();
  });
});

describe('level unlocks open Pro features (step by step)', () => {
  it('opens the calm statistics at level 5', () => {
    const { container, rerender } = render(<CalmStats state={atLevel(4)} projections={[]} now={T0} />);
    expect(container.querySelector('.pro-veil')).not.toBeNull();
    rerender(<CalmStats state={atLevel(5)} projections={[]} now={T0} />);
    expect(container.querySelector('.pro-veil')).toBeNull();
  });

  it('opens the night worlds at level 15 and keeps them after a restart', () => {
    expect(isProPalette('matrix', themesUnlocked(atLevel(14)))).toBe(true);
    expect(isProPalette('matrix', themesUnlocked(atLevel(15)))).toBe(false);
    const chosen = atLevel(15);
    chosen.settings.appearance = { ...chosen.settings.appearance, palette: 'matrix' };
    expect(freeState(chosen, false).settings.appearance.palette).toBe('matrix');
    const low = atLevel(3);
    low.settings.appearance = { ...low.settings.appearance, palette: 'matrix' };
    expect(freeState(low, false).settings.appearance.palette).toBe('neon');
  });
});

describe('progression trail', () => {
  const lvl = (l: number) => totalXpForLevel(l);

  it('charges the strands: gold between reached milestones, filling into the next, asleep beyond', () => {
    // Level 30, 40 XP in: 5, 10, 15 and 25 reached, 50 next.
    const state = atLevel(30);
    const trail = progressionTrail(rewardPath(state.progression.stats), state.progression.stats.xp);
    expect(trail.map((t) => t.strand?.state ?? null)).toEqual(['charged', 'charged', 'charged', 'charging', null]);
    const filling = (state.progression.stats.xp - lvl(25)) / (lvl(50) - lvl(25));
    expect(trail[3]!.strand!.fill).toBeCloseTo(filling, 6);
    // The next milestone's ring shows the same way.
    expect(trail[4]!.charge).toBeCloseTo(filling, 6);
  });

  it('starts the first ring from level 1 and keeps later strands asleep', () => {
    const state = atLevel(3);
    const trail = progressionTrail(rewardPath(state.progression.stats), state.progression.stats.xp);
    expect(trail[0]!.step.status).toBe('next');
    expect(trail[0]!.charge).toBeCloseTo(state.progression.stats.xp / lvl(5), 6);
    expect(trail.slice(0, -1).every((t) => t.strand?.state === 'dormant')).toBe(true);
  });

  it('treats a kept unlock as full, even with fewer XP', () => {
    const state = atLevel(3, { unlockedFeatures: ['advanced_stats'] });
    const trail = progressionTrail(rewardPath(state.progression.stats), state.progression.stats.xp);
    expect(trail[0]!.step.status).toBe('reached');
    expect(trail[0]!.charge).toBe(1);
    expect(trail[0]!.strand!.fill).toBeGreaterThanOrEqual(0);
  });

  it('draws gold nodes, strands and locks, with the pulse only while effects run', () => {
    const { container, rerender } = render(<CompanionHub state={atLevel(30)} now={T0} />);
    expect(container.querySelectorAll('.reward-path__strand.is-charged .reward-path__pulse')).toHaveLength(3);
    expect(container.querySelectorAll('.reward-path__strand.is-charging .reward-path__charge')).toHaveLength(1);
    expect(container.querySelector('.reward-path')!.classList.contains('is-live')).toBe(true);
    const off = atLevel(30);
    off.settings.appearance = { ...off.settings.appearance, companionFx: false };
    rerender(<CompanionHub state={off} now={T0} />);
    expect(container.querySelector('.reward-path')!.classList.contains('is-live')).toBe(false);
    // The trail itself stays: it is the hub's design, not a decoration.
    expect(container.querySelectorAll('.reward-path__strand')).toHaveLength(4);
  });
});
