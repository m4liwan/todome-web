import { fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ServicesContext, type Services } from '../app/services';
import { SettingsDialog } from '../components/dialogs/SettingsDialog';
import { createMemoryStore } from '../lib/storage';
import { emptyState } from '../state/defaults';
import { createStore } from '../state/store';

function open() {
  const store = createStore({ storage: createMemoryStore(), key: 'k', initial: emptyState(), persistDelayMs: 0 });
  const services = { store, announce: () => {} } as unknown as Services;
  render(
    <ServicesContext.Provider value={services}>
      <SettingsDialog open onClose={() => {}} initialTab="design" />
    </ServicesContext.Provider>,
  );
  return store;
}

const panel = () => document.getElementById('settings-panel')!;
const tab = (name: string) => screen.getByRole('tab', { name, hidden: true });

describe('the living settings', () => {
  it('gives every tab an icon and the panel a large title with one line about it', () => {
    open();
    for (const t of screen.getAllByRole('tab', { hidden: true })) expect(t.querySelector('svg'), t.textContent ?? '').not.toBeNull();
    expect(panel().querySelector('.settings__title')?.textContent).toBe('Design');
    expect(panel().querySelector('.settings__lead')?.textContent).toBeTruthy();
  });

  it('floats its navigation above the content, the lens gliding to the chosen tab', () => {
    open();
    const bar = document.querySelector<HTMLElement>('.settings__bar')!;
    expect(bar.querySelector('[role="tablist"]')).not.toBeNull();
    // The bar is not part of the scrolling panel: the content runs beneath it.
    expect(panel().contains(bar)).toBe(false);
    const sheet = document.querySelector<HTMLElement>('.settings')!;
    expect(sheet.style.getPropertyValue('--tab')).toBe('2');
    fireEvent.click(tab('Daten'));
    expect(sheet.style.getPropertyValue('--tab')).toBe('6');
    expect(bar.querySelector('.settings__lens')).not.toBeNull();
  });

  it('moves the panel in the direction you travel along the bar', () => {
    open();
    fireEvent.click(tab('Daten'));
    expect(panel().dataset.dir).toBe('forward');
    fireEvent.click(tab('Allgemein'));
    expect(panel().dataset.dir).toBe('back');
  });

  it('opens as a full-screen studio, not a pop-up, and rises softly into place', () => {
    const css = readFileSync(join(process.cwd(), 'src', 'styles', 'components', 'dialogs.css'), 'utf8');
    const sheet = /\.dialog--settings\[open\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(sheet).toMatch(/inset:\s*0;/);
    expect(sheet).toMatch(/width:\s*100vw;/);
    expect(sheet).toMatch(/height:\s*100dvh;/);
    expect(sheet).toMatch(/border-radius:\s*0;/);
    expect(sheet).toMatch(/animation: settings-in/);
    expect(css).not.toMatch(/data-dock='(left|right)'/);
  });

  it('has a clear way back and its areas on one straight line, a dock that magnifies under the pointer', () => {
    const onClose = vi.fn();
    const store = createStore({ storage: createMemoryStore(), key: 'k', initial: emptyState(), persistDelayMs: 0 });
    render(
      <ServicesContext.Provider value={{ store, announce: () => {} } as unknown as Services}>
        <SettingsDialog open onClose={onClose} initialTab="design" />
      </ServicesContext.Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Zurück/, hidden: true }));
    expect(onClose).toHaveBeenCalled();
    const tabs = screen.getAllByRole('tab', { hidden: true });
    expect(tabs.map((t) => t.textContent)).toEqual(['Allgemein', 'Begleiter', 'Design', 'Schnellzugriff', 'Overlay', 'Audio', 'Daten', 'Über']);
    // The pointer's pull: the area under it grows most, its far neighbours not at all.
    tabs.forEach((t, i) => (t.getBoundingClientRect = () => ({ left: i * 120, width: 100, top: 0, height: 48, right: i * 120 + 100, bottom: 48, x: i * 120, y: 0, toJSON: () => ({}) })));
    fireEvent.mouseMove(screen.getByRole('tablist', { hidden: true }), { clientX: 2 * 120 + 50 });
    const m = tabs.map((t) => Number(t.style.getPropertyValue('--m')));
    expect(m[2]).toBeGreaterThan(m[1]!);
    expect(m[1]).toBeGreaterThan(m[0]!);
    expect(m[6]).toBe(1);
    fireEvent.mouseLeave(screen.getByRole('tablist', { hidden: true }));
    expect(tabs.every((t) => t.style.getPropertyValue('--m') === '1')).toBe(true);
    const css = readFileSync(join(process.cwd(), 'src', 'styles', 'components', 'settings.css'), 'utf8');
    expect(css).toMatch(/\.settings__tabs button \{[^}]*transform: scale\(var\(--m, 1\)\)/);
    expect(css).not.toMatch(/var\(--d\) \* var\(--d\)/);
    // No hairline beneath the head: it floats.
    expect(/\.settings__top \{([^}]*)\}/.exec(css)?.[1]).not.toMatch(/border-bottom/);
  });

  it('scrolls in one space whose scrollbar runs along the window edge, in the light colour', () => {
    open();
    const stage = document.querySelector('.settings__stage')!;
    expect(stage.querySelector('.settings__panel')).not.toBeNull();
    expect(stage.querySelector('.studio-preview')).not.toBeNull();
    const css = readFileSync(join(process.cwd(), 'src', 'styles', 'components', 'settings.css'), 'utf8');
    expect(css).toMatch(/\.settings__stage \{[^}]*overflow-y: auto/);
    expect(css).toMatch(/\.settings__stage::-webkit-scrollbar-thumb \{[^}]*--accent-rgb/);
    expect(/\.settings__panel \{([^}]*)\}/.exec(css)?.[1]).not.toMatch(/overflow-y/);
    expect(css).toMatch(/\.studio-preview \{[^}]*position: sticky/);
  });

  it('keeps the chosen companion and every chosen card marked: a frame of light and a check', () => {
    const store = createStore({ storage: createMemoryStore(), key: 'k', initial: emptyState(), persistDelayMs: 0 });
    render(
      <ServicesContext.Provider value={{ store, announce: () => {} } as unknown as Services}>
        <SettingsDialog open onClose={() => {}} initialTab="companion" />
      </ServicesContext.Provider>,
    );
    const chosen = document.querySelector('.avatar-option.is-on');
    expect(chosen?.textContent).toMatch(/Spike/);
    const css = readFileSync(join(process.cwd(), 'src', 'styles', 'components', 'settings.css'), 'utf8');
    expect(css).toMatch(/:is\(\.option, \.corner-opt, \.brain, \.tone, \.avatar-option\):is\(\[aria-checked='true'\], \[aria-pressed='true'\], \.is-on, :has\(input:checked\)\),\s*\.module:has\(input:checked\) \{[^}]*border-color: rgb\(var\(--accent-rgb\)/);
    expect(css).toMatch(/:is\(\.option, \.corner-opt, \.brain, \.tone, \.avatar-option\):is\([^)]*\.is-on[^{]*::after \{[^}]*opacity: 1/);
    // The keyboard ring stays; a click alone no longer flashes it.
    expect(readFileSync(join(process.cwd(), 'src', 'styles', 'components', 'controls.css'), 'utf8')).toMatch(/\.avatar-option:has\(input:focus-visible\)/);
  });

  it('shows a live preview in which the companion notices a change', () => {
    const store = open();
    expect(screen.getByRole('complementary', { name: 'Live-Vorschau', hidden: true })).not.toBeNull();
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Größe der Oberfläche', hidden: true })).getByRole('radio', { name: /Komfort/, hidden: true }));
    expect(store.getState().settings.appearance.uiScale).toBe(1.2);
  });

  it('offers the five rooms of Heute with a preview each, all of them free', () => {
    const store = open();
    const group = screen.getByRole('radiogroup', { name: 'Aufbau von Heute', hidden: true });
    const rooms = [...group.querySelectorAll<HTMLElement>('[role="radio"]')];
    expect(rooms.map((r) => r.querySelector('strong')?.textContent)).toEqual(['Classic', 'Sanctuary', 'Hub', 'Flow', 'Duo']);
    for (const r of rooms) expect(r.querySelector('.room-opt__preview')).not.toBeNull();
    expect(rooms.some((r) => r.hasAttribute('aria-disabled'))).toBe(false);
    fireEvent.click(rooms[1]!);
    expect(store.getState().settings.appearance.layout).toBe('sanctuary');
  });
});
