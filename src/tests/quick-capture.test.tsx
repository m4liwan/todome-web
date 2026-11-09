import { act, fireEvent, render, screen } from '@testing-library/react';
import type { Services } from '../app/services';
import type { Client } from '../domain/types';
import type { ToastAction } from '../lib/toasts';
import { emptyState } from '../state/defaults';
import { quickAddTask, QUICK_DEFAULT_MIN } from '../state/commands';
import { reduceAll } from '../state/reducer';
import { createStore } from '../state/store';
import { createMemoryStore } from '../lib/storage';

const shell = vi.hoisted(() => ({
  open: [] as Array<(info: { theme: 'light' | 'dark' }) => void>,
  submitted: [] as string[],
  closed: 0,
  reply: { ok: true, message: 'Gemerkt für morgen' },
  taken: new Set<string>(),
  registered: [] as string[],
}));
vi.mock('../lib/desktop', () => ({
  isCompanionView: false,
  isQuickView: false,
  desktop: {
    isDesktop: true,
    onQuickOpen: (cb: (info: { theme: 'light' | 'dark' }) => void) => {
      shell.open.push(cb);
      return () => undefined;
    },
    quickSubmit: async (text: string) => {
      shell.submitted.push(text);
      return shell.reply;
    },
    quickClose: () => void shell.closed++,
    quickConfig: async (key: string) => {
      shell.registered.push(key);
      const ok = key === 'off' || !shell.taken.has(key);
      return { ok, active: ok && key !== 'off' };
    },
    onQuickAdd: () => () => undefined,
  },
}));

const { handleQuickAdd, useQuickCapture } = await import('../app/quickCapture');
const { ServicesContext } = await import('../app/services');
const { renderHook } = await import('@testing-library/react');
const { undoLast, resetUndo, UNDO_MS } = await import('../app/undo');
const { QuickCaptureWindow } = await import('../components/QuickCapture');
const { Toasts } = await import('../components/Toasts');
const { toastStore } = await import('../lib/toasts');

const NOW = new Date(2026, 10, 9, 10).getTime();
const deps = { now: NOW, newId: (() => {
  let n = 0;
  return () => `id${++n}`;
})() };
const weber: Client = { id: 'c1', name: 'Kanzlei Weber', hourlyRate: 90, billableDefault: true, rounding: 'none' as Client['rounding'], archived: false };

function servicesFor() {
  const store = createStore({ storage: createMemoryStore(), key: 'k', initial: { ...emptyState(), clients: { c1: weber } } });
  const said: Array<{ message: string; action?: ToastAction }> = [];
  const services = {
    store,
    clock: { now: () => NOW },
    deps: () => deps,
    announce: (message: string, action?: ToastAction) => void said.push({ message, action }),
  } as unknown as Services;
  return { services, store, said };
}

describe('quick capture: the command', () => {
  it('turns a line into a task with client, priority, estimate and day', () => {
    const r = quickAddTask({ ...emptyState(), clients: { c1: weber } }, deps, 'Angebot 45m !hoch @kanzlei morgen');
    expect(r.ok).toBe(true);
    const state = reduceAll(emptyState(), r.ok ? r.actions : []);
    const task = state.tasks[r.taskId!]!;
    expect(task).toMatchObject({ title: 'Angebot', estimateMin: 45, priority: 'high', clientId: 'c1', billable: true, plannedDay: '2026-11-10', status: 'planned' });
    expect(r.clientName).toBe('Kanzlei Weber');
  });

  it('keeps an unknown @client in the title, defaults and clamps the estimate', () => {
    const a = quickAddTask(emptyState(), deps, 'Rückruf @Unbekannt');
    expect(reduceAll(emptyState(), a.ok ? a.actions : []).tasks[a.taskId!]).toMatchObject({ title: 'Rückruf @Unbekannt', estimateMin: QUICK_DEFAULT_MIN, clientId: null });
    const b = quickAddTask(emptyState(), deps, 'Lesen 2m');
    expect(reduceAll(emptyState(), b.ok ? b.actions : []).tasks[b.taskId!]!.estimateMin).toBe(5);
    expect(quickAddTask(emptyState(), deps, '   ').ok).toBe(false);
  });

  it('task/remove never removes a task that already has sessions', () => {
    const r = quickAddTask(emptyState(), deps, 'Angebot');
    const s = reduceAll(emptyState(), r.ok ? r.actions : []);
    const id = r.taskId!;
    expect(reduceAll(s, [{ type: 'task/remove', id }]).tasks[id]).toBeUndefined();
    const withSession = { ...s, sessions: { s1: { id: 's1', taskId: id } as never } };
    expect(reduceAll(withSession, [{ type: 'task/remove', id }]).tasks[id]).toBeDefined();
  });
});

describe('quick capture: app side and undo', () => {
  afterEach(() => resetUndo());

  it('creates the task, answers the window and offers undo (button and Ctrl+Z, once)', () => {
    const { services, store, said } = servicesFor();
    expect(handleQuickAdd(services, 'Angebot 45m @weber morgen')).toEqual({ ok: true, message: 'Gemerkt für morgen · Kanzlei Weber' });
    expect(said[0]!.message).toBe('Gemerkt für morgen: „Angebot“');
    expect(said[0]!.action?.label).toBe('Rückgängig');
    expect(Object.keys(store.getState().tasks)).toHaveLength(1);

    expect(undoLast()).toBe(true);
    expect(Object.keys(store.getState().tasks)).toHaveLength(0);
    expect(said.at(-1)!.message).toBe('Rückgängig gemacht.');
    expect(undoLast()).toBe(false);
    said[0]!.action!.run();
    expect(said.filter((s) => s.message === 'Rückgängig gemacht.')).toHaveLength(1);
  });

  it('undo expires with its toast', () => {
    const { services, store } = servicesFor();
    handleQuickAdd(services, 'Angebot');
    expect(undoLast(Date.now() + UNDO_MS + 1)).toBe(false);
    expect(Object.keys(store.getState().tasks)).toHaveLength(1);
  });

  it('says what went wrong instead of creating nothing silently', () => {
    const { services } = servicesFor();
    expect(handleQuickAdd(services, '  ').ok).toBe(false);
  });

  it('shows the undo button in the toast; a click undoes and closes it', () => {
    const run = vi.fn();
    render(<Toasts />);
    act(() => toastStore.push('„Angebot“ gestrichen.', 8000, { label: 'Rückgängig', run }));
    fireEvent.click(screen.getByRole('button', { name: 'Rückgängig: „Angebot“ gestrichen.' }));
    expect(run).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('„Angebot“ gestrichen.')).toBeNull();
  });
});

describe('quick capture window', () => {
  beforeEach(() => {
    shell.open.length = 0;
    shell.submitted.length = 0;
    shell.closed = 0;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => vi.useRealTimers());

  it('previews the markers, sends the line, confirms and steps aside', async () => {
    render(<QuickCaptureWindow />);
    act(() => shell.open[0]!({ theme: 'dark' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    const input = screen.getByLabelText('Was willst du dir merken?');
    fireEvent.change(input, { target: { value: 'Angebot 90m !hoch morgen' } });
    expect(screen.getByText('1,5 Std')).toBeTruthy();
    expect(screen.getByText('Wichtig')).toBeTruthy();
    expect(screen.getByText('Morgen')).toBeTruthy();

    await act(async () => {
      fireEvent.submit(input.closest('form')!);
    });
    expect(shell.submitted).toEqual(['Angebot 90m !hoch morgen']);
    expect(screen.getByRole('status').textContent).toBe('✓ Gemerkt für morgen');
    act(() => vi.advanceTimersByTime(900));
    expect(shell.closed).toBe(1);
  });

  it('keeps the text when it did not work, and Esc closes', async () => {
    shell.reply = { ok: false, message: 'ToDoMe. startet gerade.' };
    render(<QuickCaptureWindow />);
    const input = screen.getByLabelText('Was willst du dir merken?');
    fireEvent.change(input, { target: { value: 'Angebot' } });
    await act(async () => {
      fireEvent.submit(input.closest('form')!);
    });
    expect(screen.getByRole('alert').textContent).toBe('ToDoMe. startet gerade.');
    expect((input as HTMLInputElement).value).toBe('Angebot');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(shell.closed).toBe(1);
    shell.reply = { ok: true, message: 'Gemerkt für morgen' };
  });
});

describe('quick capture shortcut', () => {
  it('falls back to a free shortcut when the default is taken, and says so once', async () => {
    shell.taken = new Set(['ctrl_alt_space']);
    shell.registered.length = 0;
    const { services, store, said } = servicesFor();
    renderHook(() => useQuickCapture(), { wrapper: ({ children }) => <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider> });
    await act(async () => {
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });
    expect(store.getState().settings.quickCapture).toBe('ctrl_alt_t');
    expect(shell.registered.slice(0, 2)).toEqual(['ctrl_alt_space', 'ctrl_alt_t']);
    expect(said.map((s) => s.message)).toEqual(['Strg + Alt + Leertaste ist schon von einem anderen Programm belegt. Die Schnellerfassung öffnest du mit Strg + Alt + T.']);
    shell.taken = new Set();
  });
});
