import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ServicesContext, type Services } from '../app/services';
import { Rail } from '../components/Rail';
import { Topbar, type View } from '../components/Topbar';
import type { AppState } from '../domain/types';
import { contextLabels } from '../domain/userContext';
import { createMemoryStore } from '../lib/storage';
import { emptyState } from '../state/defaults';
import { createStore } from '../state/store';

const NOW = new Date(2026, 10, 15, 10, 0).getTime();

function mount(view: View = 'today', state: AppState = emptyState()) {
  const store = createStore({ storage: createMemoryStore(), key: 'k', initial: state, persistDelayMs: 0 });
  const services = { store, announce: () => {}, mode: 'live', clock: { now: () => NOW, speed: 1 } } as unknown as Services;
  const onView = vi.fn();
  const onOpen = vi.fn();
  const ui = (s: AppState) => (
    <ServicesContext.Provider value={services}>
      <Rail state={s} view={view} onView={onView} onOpen={onOpen} />
    </ServicesContext.Provider>
  );
  const r = render(ui(state));
  return { store, onView, onOpen, rerender: () => r.rerender(ui(store.getState())) };
}

describe('the icon rail', () => {
  it('marks the current station for screen readers', () => {
    mount('times');
    expect(screen.getByRole('button', { name: /Rückblick/ }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: /Heute/ }).hasAttribute('aria-current')).toBe(false);
  });

  it('switches views', () => {
    const { onView } = mount();
    fireEvent.click(screen.getByRole('button', { name: /Begleiter/ }));
    expect(onView).toHaveBeenCalledWith('companion');
  });

  it('toggles do-not-disturb and the light like the old tool pill', () => {
    const { store, rerender } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Stumm schalten' }));
    expect(store.getState().settings.doNotDisturb).toBe(true);
    rerender();
    expect(screen.getByRole('button', { name: 'Stumm ist an' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Licht dimmen' }));
    expect(store.getState().settings.appearance.ambient).toBe(0);
  });

  it('opens the settings', () => {
    const { onOpen } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Einstellungen' }));
    expect(onOpen).toHaveBeenCalledWith({ kind: 'settings' });
  });

  it('names every station for the tooltip and the screen reader alike', () => {
    mount();
    for (const name of ['Heute', 'Rückblick', 'Begleiter']) {
      const button = screen.getByRole('button', { name: new RegExp(name) });
      expect(button.querySelector('.rail__tip')?.textContent).toContain(name);
    }
  });
});

describe('the slim header', () => {
  it('keeps the day-end action as its main button', () => {
    const state = emptyState();
    const store = createStore({ storage: createMemoryStore(), key: 'k', initial: state, persistDelayMs: 0 });
    const services = { store, announce: () => {}, mode: 'live', clock: { now: () => NOW, speed: 1 } } as unknown as Services;
    render(
      <ServicesContext.Provider value={services}>
        <Topbar state={state} view="today" onView={() => {}} onOpen={() => {}} onResume={() => {}} />
      </ServicesContext.Provider>,
    );
    expect(document.querySelector('.topbar__main')?.textContent).toBe(contextLabels(state.settings.userContext).dayEnd);
    // The navigation moved to the rail.
    expect(document.querySelector('.topbar .segnav, .topbar .tool-pill')).toBeNull();
  });
});
