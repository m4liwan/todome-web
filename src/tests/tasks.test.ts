import { describe, expect, it } from 'vitest';
import { typeLabel } from '../domain/taskTypes';
import { createTask } from '../state/commands';
import { emptyState } from '../state/defaults';

describe('task types', () => {
  it('keeps an own name for "Sonstiges…"', () => {
    const r = createTask(
      emptyState(),
      { now: 0, newId: () => 't1' },
      { title: 'Fotos', type: 'other', typeLabel: '  Fotos bearbeiten ', clientId: null, estimateMin: 30, intention: '' },
    );
    expect(r.ok).toBe(true);
    const add = r.ok ? r.actions.find((a) => a.type === 'task/add') : undefined;
    const task = add && add.type === 'task/add' ? add.task : null;
    expect(task?.typeLabel).toBe('Fotos bearbeiten');
    expect(typeLabel({ type: 'other', typeLabel: 'Fotos bearbeiten' })).toBe('Fotos bearbeiten');
    expect(typeLabel({ type: 'other' })).toBe('Sonstiges');
    expect(typeLabel({ type: 'deep_work', typeLabel: 'ignored' })).toBe('Deep Work');
  });
});
