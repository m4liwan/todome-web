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
        appearance: { ...s.settings.appearance, palette: 'rose' as const, layout: 'flow' as const },
        companion: { ...s.settings.companion, avatar: 'woody' as const },
      },
    };
    const free = freeState(locked, false);
    // The closest free light: rosé falls back to warm amber.
    expect(free.settings.appearance.palette).toBe('amber');
    expect(free.settings.appearance.layout).toBe('hub');
    expect(free.settings.companion.avatar).toBe('spike');
  });
  it('leaves free choices and Pro users untouched', () => {
    const s = emptyState();
    expect(freeState(s, false)).toBe(s);
    const a = { ...s.settings.appearance, palette: 'violet' as const };
    expect(freeAppearance(a, true)).toBe(a);
  });
});
