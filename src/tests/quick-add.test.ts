import { draftChips, parseQuickAdd, plannedDayFor, resolveClient } from '../domain/quickAdd';
import type { Client } from '../domain/types';

const client = (id: string, name: string, archived = false): Client => ({ id, name, hourlyRate: 90, billableDefault: true, rounding: 'none' as Client['rounding'], archived });

describe('quick capture parser', () => {
  it('reads markers from the end only', () => {
    expect(parseQuickAdd('Angebot Müller 45m !hoch @Kanzlei morgen')).toEqual({ title: 'Angebot Müller', estimateMin: 45, priority: 'high', dayOffset: 1, clientQuery: 'Kanzlei' });
    expect(parseQuickAdd('Folien für morgen vorbereiten')).toEqual({ title: 'Folien für morgen vorbereiten', dayOffset: 0 });
    expect(parseQuickAdd('  Steuer   1,5h ')).toEqual({ title: 'Steuer', estimateMin: 90, dayOffset: 0 });
    expect(parseQuickAdd('Rückruf 2h übermorgen !niedrig')).toMatchObject({ title: 'Rückruf', estimateMin: 120, priority: 'low', dayOffset: 2 });
  });

  it('keeps at least one word as the title and never eats a marker twice', () => {
    expect(parseQuickAdd('morgen')).toEqual({ title: 'morgen', dayOffset: 0 });
    expect(parseQuickAdd('Lesen 30m 45m')).toEqual({ title: 'Lesen 30m', estimateMin: 45, dayOffset: 0 });
    expect(parseQuickAdd('Mail an a@b.de')).toEqual({ title: 'Mail an a@b.de', dayOffset: 0 });
  });

  it('resolves @client by a unique prefix of an active client', () => {
    const clients = { a: client('a', 'Kanzlei Weber'), b: client('b', 'Kanu Verleih'), c: client('c', 'Alt GmbH', true) };
    expect(resolveClient('kanzlei', clients)?.id).toBe('a');
    expect(resolveClient('weber', clients)?.id).toBe('a');
    expect(resolveClient('verl', clients)?.id).toBe('b');
    expect(resolveClient('Kan', clients)).toBeNull();
    expect(resolveClient('Alt', clients)).toBeNull();
    expect(resolveClient(undefined, clients)).toBeNull();
  });

  it('plans the day and shows calm chips', () => {
    expect(plannedDayFor(parseQuickAdd('A morgen'), '2026-11-09')).toBe('2026-11-10');
    expect(plannedDayFor(parseQuickAdd('A'), '2026-11-09')).toBe('2026-11-09');
    expect(draftChips(parseQuickAdd('Angebot 90m ! @Weber morgen'))).toEqual(['1,5 Std', 'Wichtig', 'Morgen', '@Weber']);
    expect(draftChips(parseQuickAdd('Angebot 120m'))).toEqual(['2 Std']);
  });
});
