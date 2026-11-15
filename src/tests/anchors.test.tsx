import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServicesContext, type Services } from '../app/services';
import { AnchorsDialog, AnchorsSection } from '../components/DailyAnchors';
import { anchorsToday, anchorTitle, isAnchorDone, MAX_ANCHORS, normalizeDays, rhythmLabel, sanitizeAnchors, weekdayOf } from '../domain/anchors';
import type { AppState, DailyAnchor } from '../domain/types';
import { createMemoryStore } from '../lib/storage';
import { dayKey } from '../lib/time';
import { emptyState } from '../state/defaults';
import { reducer } from '../state/reducer';
import { createStore, parseState } from '../state/store';

// Saturday, 14 November 2026, 9:00 (weekday 5 with Monday = 0).
const NOW = new Date(2026, 10, 14, 9, 0).getTime();
const TODAY = dayKey(NOW);
const TOMORROW = dayKey(NOW + 24 * 3600e3);
const DAILY = [0, 1, 2, 3, 4, 5, 6];

const anchor = (id: string, title = `Anker ${id}`, lastDoneDay: string | null = null, days: number[] = DAILY): DailyAnchor => ({ id, title, createdAt: NOW, lastDoneDay, days });
const withAnchors = (...anchors: DailyAnchor[]): AppState => ({ ...emptyState(), anchors });

afterEach(() => {
  window.localStorage.clear();
});

describe('Tages-Anker: domain', () => {
  it('cleans titles: trimmed, single-spaced, capped, empty stays empty', () => {
    expect(anchorTitle('  X-Post   absetzen ')).toBe('X-Post absetzen');
    expect(anchorTitle('   ')).toBe('');
    expect(anchorTitle('a'.repeat(200))).toHaveLength(60);
  });

  it('counts weekdays from Monday and names a rhythm in plain words', () => {
    expect(weekdayOf(NOW)).toBe(5);
    expect(rhythmLabel(DAILY)).toBe('Täglich');
    expect(rhythmLabel([0, 1, 2, 3, 4])).toBe('Werktags');
    expect(rhythmLabel([5, 6])).toBe('Am Wochenende');
    expect(rhythmLabel([4, 0, 2])).toBe('Mo · Mi · Fr');
    expect(normalizeDays([9, -1, 'x'])).toEqual(DAILY);
  });

  it('is done only on the day it was set: a new day starts fresh by itself', () => {
    const a = anchor('a', 'Post', TODAY);
    expect(isAnchorDone(a, TODAY)).toBe(true);
    expect(isAnchorDone(a, TOMORROW)).toBe(false);
  });

  it('splits the day into anchors for today and anchors that are free today', () => {
    const t = anchorsToday([anchor('d', 'Täglich', TODAY), anchor('w', 'Werktags', null, [0, 1, 2, 3, 4]), anchor('s', 'Samstags', null, [5])], NOW, TODAY);
    expect(t.due.map((a) => a.id)).toEqual(['d', 's']);
    expect(t.free.map((a) => a.id)).toEqual(['w']);
    expect(t.done).toBe(1);
  });

  it('loads stored anchors one by one, at most ten; older anchors without a rhythm are daily', () => {
    const old = { id: 'o', title: 'Alt', createdAt: 1, lastDoneDay: null };
    const raw = [old, { id: 2, title: 'kaputt' }, anchor('3', '   '), ...Array.from({ length: 12 }, (_, i) => anchor(`n${i}`))];
    const out = sanitizeAnchors(raw);
    expect(out).toHaveLength(MAX_ANCHORS);
    expect(out[0]).toEqual({ ...old, days: DAILY });
    expect(sanitizeAnchors('nope')).toEqual([]);
  });
});

describe('Tages-Anker: reducer', () => {
  it('adds up to ten anchors and quietly ignores more or an empty title', () => {
    let s = emptyState();
    for (let i = 0; i < MAX_ANCHORS + 2; i++) s = reducer(s, { type: 'anchor/add', anchor: anchor(String(i)) });
    expect(s.anchors).toHaveLength(MAX_ANCHORS);
    expect(reducer(withAnchors(), { type: 'anchor/add', anchor: anchor('x', '  ') }).anchors).toEqual([]);
  });

  it('sets and loosens an anchor for today only', () => {
    let s = withAnchors(anchor('a'));
    s = reducer(s, { type: 'anchor/mark', id: 'a', day: TODAY, done: true });
    expect(s.anchors[0]?.lastDoneDay).toBe(TODAY);
    expect(reducer(s, { type: 'anchor/mark', id: 'a', day: TOMORROW, done: false }).anchors[0]?.lastDoneDay).toBe(TODAY);
    s = reducer(s, { type: 'anchor/mark', id: 'a', day: TODAY, done: false });
    expect(s.anchors[0]?.lastDoneDay).toBeNull();
  });

  it('updates title (never to nothing) and rhythm, moves and removes', () => {
    let s = withAnchors(anchor('a', 'Alt'), anchor('b'), anchor('c'));
    s = reducer(s, { type: 'anchor/update', id: 'a', title: ' Neu ', days: [4, 0] });
    expect(s.anchors[0]).toMatchObject({ title: 'Neu', days: [0, 4] });
    expect(reducer(s, { type: 'anchor/update', id: 'a', title: '' }).anchors[0]?.title).toBe('Neu');
    s = reducer(s, { type: 'anchor/move', id: 'c', by: -1 });
    expect(s.anchors.map((a) => a.id)).toEqual(['a', 'c', 'b']);
    expect(reducer(s, { type: 'anchor/move', id: 'a', by: -1 })).toBe(s);
    s = reducer(s, { type: 'anchor/remove', id: 'c' });
    expect(s.anchors.map((a) => a.id)).toEqual(['a', 'b']);
  });

  it('reads data from before the anchors and keeps anchors across a reload', () => {
    const old = { ...emptyState() } as Partial<AppState>;
    delete old.anchors;
    expect(parseState(JSON.stringify(old))?.anchors).toEqual([]);
    const saved = withAnchors(anchor('a', 'X-Post absetzen', TODAY, [0, 2, 4]));
    expect(parseState(JSON.stringify(saved))?.anchors).toEqual(saved.anchors);
  });
});

function mount(state: AppState, ui: 'section' | 'dialog', onImpulse = vi.fn()) {
  const store = createStore({ storage: createMemoryStore(), key: 'k', initial: state, persistDelayMs: 0 });
  let n = 0;
  const services = { store, announce: () => {}, clock: { now: () => NOW }, deps: () => ({ newId: () => `id-${++n}` }) } as unknown as Services;
  const onOpen = vi.fn();
  const view = (s: AppState) => (
    <ServicesContext.Provider value={services}>
      {ui === 'section' ? <AnchorsSection state={s} now={NOW} onManage={onOpen} onImpulse={onImpulse} /> : <AnchorsDialog open state={s} now={NOW} onClose={() => {}} onImpulse={onImpulse} />}
    </ServicesContext.Provider>
  );
  const r = render(view(state));
  return { store, onOpen, onImpulse, rerender: () => r.rerender(view(store.getState())) };
}

describe('Tages-Anker: the section on the home', () => {
  it('shows this week as a calendar: today marked, each day with its anchors as dots', () => {
    mount(withAnchors(anchor('a', 'Post', TODAY), anchor('b'), anchor('w', 'Werktags', null, [0, 1, 2, 3, 4])), 'section');
    const week = screen.getByRole('group', { name: 'Diese Woche' });
    const days = within(week).getAllByRole('button');
    expect(days).toHaveLength(7);
    // Saturday the 14th: two anchors, one of them set today.
    const saturday = within(week).getByRole('button', { name: 'Samstag, 14.: 2 Anker' });
    expect(saturday.className).toContain('is-today');
    expect(saturday.querySelectorAll('.week-cal__dots i')).toHaveLength(2);
    expect(saturday.querySelectorAll('.week-cal__dots i.is-done')).toHaveLength(1);
    expect(within(week).getByRole('button', { name: 'Montag, 9.: 3 Anker' })).toBeTruthy();
  });

  it('ticks today with one click and offers the five-minute impulse', () => {
    const { store, rerender, onImpulse } = mount(withAnchors(anchor('a', 'Post'), anchor('b', 'Lesen')), 'section');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Post' }));
    expect(isAnchorDone(store.getState().anchors[0]!, TODAY)).toBe(true);
    rerender();
    expect(screen.getByText('Heute · 1 von 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '5 Min.' }));
    expect(onImpulse).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
  });

  it('shows another day’s anchors without a tick', () => {
    mount(withAnchors(anchor('a', 'Post'), anchor('w', 'Werktags', null, [0, 1, 2, 3, 4])), 'section');
    fireEvent.click(screen.getByRole('button', { name: /^Montag/ }));
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.getByText('Werktags', { selector: '.anchor__title' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Sonntag/ }));
    expect(screen.queryByText('Werktags', { selector: '.anchor__title' })).toBeNull();
  });

  it('invites to the first anchor and opens the pop-up for everything else', () => {
    const empty = mount(emptyState(), 'section');
    fireEvent.click(screen.getByRole('button', { name: 'Ersten Anker setzen' }));
    expect(empty.onOpen).toHaveBeenCalled();
    document.body.innerHTML = '';
    const some = mount(withAnchors(anchor('a')), 'section');
    fireEvent.click(screen.getByRole('button', { name: 'Anker anpassen' }));
    expect(some.onOpen).toHaveBeenCalled();
  });

  it('never shows anything red, overdue or a streak', () => {
    mount(withAnchors(anchor('a', 'Post', '2026-11-01'), anchor('b', 'Lesen')), 'section');
    expect(document.body.textContent ?? '').not.toMatch(/Serie|Streak|überfällig|verpasst|nachholen/i);
  });
});

describe('Tages-Anker: pop-up', () => {
  it('starts with one-click suggestions', () => {
    const { store } = mount(emptyState(), 'dialog');
    fireEvent.click(screen.getByRole('button', { name: /X-Post absetzen/ }));
    expect(store.getState().anchors).toMatchObject([{ title: 'X-Post absetzen', days: DAILY }]);
  });

  it('ticks with one click, offers the five-minute impulse, and loosens again', () => {
    const { store, rerender, onImpulse } = mount(withAnchors(anchor('a', 'X-Post absetzen')), 'dialog');
    fireEvent.click(screen.getByRole('button', { name: '5 Min.' }));
    expect(onImpulse).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /X-Post absetzen/ }));
    expect(store.getState().anchors[0]?.lastDoneDay).toBe(TODAY);
    rerender();
    expect(screen.getByRole('checkbox', { name: /X-Post absetzen/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByRole('button', { name: '5 Min.' })).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: /X-Post absetzen/ }));
    expect(store.getState().anchors[0]?.lastDoneDay).toBeNull();
  });

  it('shows anchors that are free today apart, without a tick', () => {
    mount(withAnchors(anchor('w', 'Wochenbericht', null, [0, 1, 2, 3, 4])), 'dialog');
    const free = screen.getByRole('region', { name: 'Heute frei' });
    expect(within(free).getByText('Wochenbericht')).toBeTruthy();
    expect(within(free).getByText('Werktags')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('adds an anchor with its own rhythm', () => {
    const { store } = mount(withAnchors(anchor('a')), 'dialog');
    fireEvent.change(screen.getByLabelText('Neuer Tages-Anker'), { target: { value: 'Laufen gehen' } });
    const picker = screen.getByRole('group', { name: 'Rhythmus des neuen Ankers' });
    for (const d of ['Di', 'Do', 'Sa', 'So']) fireEvent.click(within(picker).getByRole('button', { name: d }));
    fireEvent.click(screen.getByRole('button', { name: 'Setzen' }));
    expect(store.getState().anchors[1]).toMatchObject({ title: 'Laufen gehen', days: [0, 2, 4] });
  });

  it('changes the rhythm and the order in the edit mode', () => {
    const { store, rerender } = mount(withAnchors(anchor('a', 'Erster'), anchor('b', 'Zweiter')), 'dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Anpassen' }));
    fireEvent.click(screen.getByRole('button', { name: '„Zweiter“ nach oben' }));
    expect(store.getState().anchors.map((a) => a.id)).toEqual(['b', 'a']);
    rerender();
    const picker = screen.getByRole('group', { name: 'Rhythmus von „Erster“' });
    fireEvent.click(within(picker).getByRole('button', { name: 'So' }));
    expect(store.getState().anchors.find((a) => a.id === 'a')?.days).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('gives the top anchors of a fuller day more presence', () => {
    mount(withAnchors(...['1', '2', '3', '4', '5'].map((id) => anchor(id))), 'dialog');
    const rows = screen.getAllByRole('checkbox').map((c) => c.closest('li')?.className ?? '');
    expect(rows.filter((c) => c.includes('is-core'))).toHaveLength(3);
    expect(rows[3]).not.toContain('is-core');
  });

  it('offers no eleventh anchor, kindly', () => {
    mount(withAnchors(...Array.from({ length: MAX_ANCHORS }, (_, i) => anchor(String(i)))), 'dialog');
    expect(screen.queryByLabelText('Neuer Tages-Anker')).toBeNull();
    expect(screen.getByText(/genug Halt/)).toBeTruthy();
  });

  it('never shows anything red, overdue or a streak', () => {
    mount(withAnchors(anchor('a', 'Post', '2026-11-01'), anchor('b', 'Lesen')), 'dialog');
    expect(document.body.textContent ?? '').not.toMatch(/Serie|Streak|überfällig|verpasst|nachholen/i);
  });
});

describe('Tages-Anker: a section of the home', () => {
  it('lives in the areas of the cockpit, no longer as a floating pill, and stays off the welcome screen', () => {
    const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
    const app = read('../app/App.tsx');
    expect(app).toMatch(/anchors: <AnchorsSection/);
    expect(app).not.toMatch(/AnchorsPill|anchors-fab/);
    expect(read('../components/Cockpit.tsx')).toMatch(/id: 'anchors', label: 'Tages-Anker'/);
    expect(read('../components/Splash.tsx')).not.toMatch(/nchor/);
  });
});
