import { promptFor, type PromptVars } from '../domain/copy';
import { USER_CONTEXTS, contextLabels, normalizeUserContext, DEFAULT_USER_CONTEXT } from '../domain/userContext';
import { emptyState } from '../state/defaults';
import { buildDemoState } from '../state/seed';
import { parseState } from '../state/store';

const vars: PromptVars = { taskTitle: 'Skript lesen', clientName: null, intention: '', overMin: 0, overrunRatio: 0, remainingMin: 0, streakMin: 0, idleMin: 0, pauseMin: 0, capHours: '8', userName: 'Lena' };

describe('usage context (study, work, everyday)', () => {
  it('offers three choices and falls back to everyday wording', () => {
    expect(USER_CONTEXTS.map((c) => c.id)).toEqual(['study', 'work', 'allround']);
    expect(DEFAULT_USER_CONTEXT).toBe('allround');
    expect(normalizeUserContext('study')).toBe('study');
    expect(normalizeUserContext(undefined)).toBe('allround');
    expect(normalizeUserContext('job')).toBe('allround');
    expect(emptyState().settings.userContext).toBe('allround');
  });

  it('gives existing installations (no context stored yet) the everyday wording, keeps a stored one', () => {
    const old = emptyState() as unknown as { settings: Record<string, unknown> };
    const legacy = { ...old.settings };
    delete legacy.userContext;
    expect(parseState(JSON.stringify({ ...old, settings: legacy }))!.settings.userContext).toBe('allround');
    expect(parseState(JSON.stringify({ ...old, settings: { ...legacy, userContext: 'kaputt' } }))!.settings.userContext).toBe('allround');
    expect(parseState(JSON.stringify({ ...old, settings: { ...legacy, userContext: 'study' } }))!.settings.userContext).toBe('study');
    expect(buildDemoState(Date.now(), (() => { let i = 0; return () => `d${++i}`; })()).settings.userContext).toBe('work');
  });

  it('changes only the words, from one central place', () => {
    expect(contextLabels('work').dayEnd).toBe('Feierabend');
    expect(contextLabels('work').dayStart).toBe('Arbeitsbeginn');
    expect(contextLabels('study').dayEnd).toBe('Tagesabschluss');
    expect(contextLabels('study').focusTime).toBe('Lern-Phase');
    expect(contextLabels('allround').focusTime).toBe('Fokus-Zeit');
    expect(contextLabels('allround').dayEnd).toBe('Ruhe-Phase');
    expect(contextLabels('nonsense')).toBe(contextLabels('allround'));
    expect(promptFor('shutdown', 'gentle', { ...vars, context: 'study' }).body).toContain('Tagesabschluss');
    expect(promptFor('shutdown', 'direct', { ...vars, context: 'work' }).body).toContain('Feierabend in 30 min');
    expect(promptFor('shutdown', 'gentle', vars).body).toContain('Ruhe-Phase');
  });

  it('keeps every label calm (no pressure words)', () => {
    for (const c of USER_CONTEXTS) {
      const l = contextLabels(c.id);
      const all = [c.label, c.description, ...Object.values(l).map((v) => (typeof v === 'function' ? v('08:00') : v))].join(' ');
      expect(all).not.toMatch(/\bmuss\b|\bmusst\b|Deadline|überfällig/i);
    }
  });
});

describe('context-aware modules (1.14)', () => {
  it('names the grouping per context and hides business fields outside work, unless entries exist', async () => {
    const { businessShown } = await import('../domain/userContext');
    expect([contextLabels('work').clients, contextLabels('study').clients, contextLabels('allround').clients]).toEqual(['Kunden', 'Fächer', 'Vorhaben']);
    expect(contextLabels('study').breakName).toBe('Lernpause');
    const s = emptyState();
    expect(businessShown({ ...s, settings: { ...s.settings, userContext: 'work' } })).toBe(true);
    expect(businessShown({ ...s, settings: { ...s.settings, userContext: 'study' } })).toBe(false);
    expect(businessShown({ ...s, settings: { ...s.settings, userContext: 'allround' } })).toBe(false);
    const withClient = { ...s, clients: { c1: { id: 'c1', name: 'Nordlicht', hourlyRate: 90, rounding: 'fifteen' as const, billableDefault: true, archived: false } } };
    expect(businessShown({ ...withClient, settings: { ...s.settings, userContext: 'allround' } })).toBe(true);
  });

  it('shows the client step of the tour only at work, there marked as a Pro preview', async () => {
    const { buildSteps } = await import('../components/CompanionTour');
    const ids = (c: 'work' | 'study' | 'allround') => buildSteps('Spike', 'Lena', contextLabels(c)).map((x) => x.id);
    expect(ids('work')).toContain('clients');
    expect(ids('study')).not.toContain('clients');
    expect(ids('allround')).not.toContain('clients');
    expect(buildSteps('Spike', 'Lena', contextLabels('work')).find((x) => x.id === 'clients')?.badge).toBe('Pro-Vorschau');
    expect(buildSteps('Spike', 'Lena', contextLabels('work'), true).at(-1)?.text).toContain('Kopf auf');
  });
});
