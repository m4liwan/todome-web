import { describe, expect, it } from 'vitest';
import { brainPatch } from '../domain/brain';
import { energyProfile } from '../domain/energy';
import { emptyState } from '../state/defaults';

const NOW = new Date(2026, 10, 5, 10, 0).getTime();

describe('brain profiles', () => {
  it('Overload: one step, silent notifications, few prompts, cocoon', () => {
    const s = emptyState();
    const p = brainPatch(s.settings, 'overload');
    expect(p).toMatchObject({ brain: 'overload', oneStep: true, systemNotifications: false, maxPromptsPerHour: 1 });
    expect(p.appearance?.focusStyle).toBe('cocoon');
  });

  it('ADHS: 15-minute blocks, movement breaks after 30 min, micro steps', () => {
    const s = emptyState();
    const patched = { ...s, settings: { ...s.settings, ...brainPatch(s.settings, 'adhd') } };
    expect(patched.settings.appearance.focusStyle).toBe('micro');
    const profile = energyProfile(patched, NOW);
    expect(profile?.timeboxCapMin).toBe(15);
    expect(profile?.focusBudgetMin).toBe(30);
    expect(profile?.micro).toBe(true);
  });

  it('Aufschieben: the soft mode is always on', () => {
    const s = emptyState();
    const patched = { ...s, settings: { ...s.settings, ...brainPatch(s.settings, 'procrastination') } };
    expect(energyProfile(patched, NOW)?.mode).toBe('low');
  });

  it('Kreatives Chaos: a quiet room without visits during a block', () => {
    const s = emptyState();
    expect(brainPatch(s.settings, 'creative').companion?.visitIntervalMin).toBe(0);
  });
});
