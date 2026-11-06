import { describe, expect, it } from 'vitest';
import { freeAppearance, freeState } from '../app/pro';
import { emptyState } from '../state/defaults';

describe('Pro markers', () => {
  it('moves locked choices to their free neighbours', () => {
    const s = emptyState();
    const locked = {
      ...s,
      settings: {
        ...s.settings,
        appearance: { ...s.settings.appearance, palette: 'matrix' as const, layout: 'flow' as const },
        companion: { ...s.settings.companion, avatar: 'woody' as const },
      },
    };
    const free = freeState(locked, false);
    expect(free.settings.appearance.palette).toBe('neon');
    expect(free.settings.appearance.layout).toBe('hub');
    expect(free.settings.companion.avatar).toBe('spike');
  });
  it('leaves free choices and Pro users untouched', () => {
    const s = emptyState();
    expect(freeState(s, false)).toBe(s);
    const a = { ...s.settings.appearance, palette: 'pulse' as const };
    expect(freeAppearance(a, true)).toBe(a);
  });
});
