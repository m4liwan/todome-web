import { describe, expect, it } from 'vitest';
import { emptyState } from '../state/defaults';

describe('breathing before a block', () => {
  it('starts blocks without a breathing exercise unless chosen', () => {
    expect(emptyState().settings.breathBeforeStart).toBe(false);
  });
});
