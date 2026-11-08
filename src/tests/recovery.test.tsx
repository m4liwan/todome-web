import { act, fireEvent, render, screen } from '@testing-library/react';
import type { VaultEntry } from '../lib/desktop';
import { emptyState } from '../state/defaults';
import { CURRENT_SCHEMA, inspectState, parseState } from '../state/store';

// A fake shell with a small safe.
const shell = vi.hoisted(() => ({
  files: new Map<string, string>(),
  saved: [] as Array<{ kind: string; json: string }>,
}));
vi.mock('../lib/desktop', () => ({
  isCompanionView: false,
  isRecoveryView: false,
  desktop: {
    isDesktop: true,
    onBeforeQuit: () => () => undefined,
    vaultSave: (kind: string, json: string) => void shell.saved.push({ kind, json }),
    vaultList: async (): Promise<VaultEntry[]> =>
      [...shell.files.keys()].map((name, i) => ({ name, kind: name.startsWith('daily') ? 'daily' : 'pre-update', at: Date.UTC(2026, 10, 7 - i, 18), size: 10 })),
    vaultRead: async (name: string) => shell.files.get(name) ?? null,
    vaultOpen: async () => true,
  },
}));

const { Recovery } = await import('../components/Recovery');
const { ErrorBoundary } = await import('../components/ErrorBoundary');

const KEY = 'todome:live:state:v1';
const stored = (patch: Record<string, unknown> = {}) => JSON.stringify({ ...emptyState(), ...patch });
const flush = () => act(async () => {
  await Promise.resolve();
  await Promise.resolve();
});

describe('inspectState', () => {
  it('tells empty, readable, unreadable and newer data apart', () => {
    expect(inspectState(null)).toEqual({ status: 'empty' });
    expect(inspectState(stored()).status).toBe('ok');
    expect(inspectState('{kaputt')).toEqual({ status: 'unreadable' });
    expect(inspectState(JSON.stringify({ schemaVersion: 'x' }))).toEqual({ status: 'unreadable' });
    expect(inspectState(JSON.stringify({ schemaVersion: CURRENT_SCHEMA + 1 }))).toEqual({ status: 'newer', version: CURRENT_SCHEMA + 1 });
  });

  it('drops single broken records instead of letting them crash a view', () => {
    const s = parseState(
      stored({
        sessions: { good: { id: 'good', taskId: 't' }, bad: 'oops', worse: null },
        clients: [],
        events: [{ id: 'e', sessionId: 'good', type: 'started', at: 1 }, null, { id: 'x' }],
        taskOrder: ['t', 3, null],
        tasks: { t: { id: 't', title: 'A' }, broken: 5 },
      }),
    )!;
    expect(Object.keys(s.sessions)).toEqual(['good']);
    expect(s.clients).toEqual({});
    expect(s.events).toHaveLength(1);
    expect(s.taskOrder).toEqual(['t']);
    expect(Object.keys(s.tasks)).toEqual(['t']);
  });
});

describe('recovery screen', () => {
  beforeEach(() => {
    window.localStorage.clear();
    shell.files.clear();
    shell.saved.length = 0;
  });

  it('never touches unreadable data and restores an earlier copy only after a confirmation', async () => {
    window.localStorage.setItem(KEY, '{kaputt');
    shell.files.set('daily-2026-11-07.json', stored({ tasks: { t1: { id: 't1', title: 'Angebot', priority: 'normal' } } }));
    const reload = vi.fn();
    render(<Recovery reason="unreadable" storageKey={KEY} reload={reload} />);
    expect(screen.getByRole('heading', { name: /konnten nicht gelesen werden/ })).toBeTruthy();
    await flush();

    fireEvent.click(screen.getByRole('button', { name: 'Auswählen' }));
    await flush();
    expect(screen.getByText(/1 Aufgabe, 0 Sessions/)).toBeTruthy();
    expect(window.localStorage.getItem(KEY)).toBe('{kaputt');

    fireEvent.click(screen.getByRole('button', { name: 'Wiederherstellen' }));
    expect(parseState(window.localStorage.getItem(KEY))?.tasks.t1?.title).toBe('Angebot');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('starts fresh only on purpose and keeps the old data in the safe', async () => {
    window.localStorage.setItem(KEY, '{kaputt');
    const reload = vi.fn();
    render(<Recovery reason="unreadable" storageKey={KEY} reload={reload} />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Neu beginnen …' }));
    expect(window.localStorage.getItem(KEY)).toBe('{kaputt');
    fireEvent.click(screen.getByRole('button', { name: 'Neu beginnen' }));
    expect(shell.saved).toEqual([{ kind: 'unreadable', json: '{kaputt' }]);
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('a skipped unreadable copy is reported calmly', async () => {
    shell.files.set('daily-2026-11-07.json', 'auch kaputt');
    render(<Recovery reason="newer" storageKey={KEY} reload={() => undefined} />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Auswählen' }));
    await flush();
    expect(screen.getByRole('status').textContent).toMatch(/nicht lesbar/);
  });
});

describe('ErrorBoundary', () => {
  it('shows the recovery screen instead of a white window, and saves first', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onCrash = vi.fn();
    const Boom = () => {
      throw new Error('kaputte Ansicht');
    };
    render(
      <ErrorBoundary storageKey={KEY} onCrash={onCrash}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('heading', { name: /etwas schiefgelaufen/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Neu laden' })).toBeTruthy();
    expect(screen.getByText(/kaputte Ansicht/)).toBeTruthy();
    expect(onCrash).toHaveBeenCalledTimes(1);
    await flush();
    spy.mockRestore();
  });
});
