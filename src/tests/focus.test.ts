import { describe, expect, it } from 'vitest';
import { microBites } from '../domain/micro';
import { emptyState } from '../state/defaults';

describe('breathing before a block', () => {
  it('starts blocks without a breathing exercise unless chosen', () => {
    expect(emptyState().settings.breathBeforeStart).toBe(false);
  });
});

describe('micro bites', () => {
  it('breaks a task into three small, concrete bites', () => {
    const bites = microBites({ title: 'Angebot schreiben', type: 'communication', intention: 'Erste Version an Kunde A' });
    expect(bites).toHaveLength(3);
    expect(bites[1]).toContain('Erste Version an Kunde A');
  });
});
