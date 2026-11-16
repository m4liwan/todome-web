import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ServicesContext, type Services } from '../app/services';
import { SettingsDialog } from '../components/dialogs/SettingsDialog';
import { HAVENS } from '../components/Haven';
import { CompanionHome } from '../components/HomeExtras';
import type { AppState } from '../domain/types';
import { createMemoryStore } from '../lib/storage';
import { emptyState } from '../state/defaults';
import { createStore, parseState } from '../state/store';

const NOW = new Date(2026, 10, 16, 10, 0).getTime();

function withHome(home: unknown, fx = true): AppState {
  const s = emptyState();
  return { ...s, settings: { ...s.settings, companion: { ...s.settings.companion, home } as AppState['settings']['companion'], appearance: { ...s.settings.appearance, companionFx: fx } } };
}

function mountHub(state: AppState) {
  const store = createStore({ storage: createMemoryStore(), key: 'k', initial: state, persistDelayMs: 0 });
  const services = { store, announce: () => {}, clock: { now: () => NOW, speed: 1 }, deps: () => ({ now: NOW, newId: () => 'x' }), run: () => true } as unknown as Services;
  const view = (s: AppState) => (
    <ServicesContext.Provider value={services}>
      <CompanionHome state={s} now={NOW} fgTaskId={null} onCustomize={() => {}} />
    </ServicesContext.Provider>
  );
  const r = render(view(state));
  return { store, rerender: () => r.rerender(view(store.getState())) };
}

describe('the companion at home', () => {
  it('remembers his ambience and starts new homes in moonlight', () => {
    const load = (home: unknown) => parseState(JSON.stringify(withHome(home)))?.settings.companion.home;
    for (const h of HAVENS) expect(load(h.id)).toBe(h.id);
    expect(load('disco')).toBe('moon');
    expect(load(undefined)).toBe('moon');
    expect(emptyState().settings.companion.home).toBe('moon');
  });

  it('offers five quiet moods, one of them plain', () => {
    expect(HAVENS.map((h) => h.id)).toEqual(['moon', 'fireflies', 'stardust', 'dew', 'none']);
  });

  it('lets him stand in his ambience, inside his alcove', () => {
    mountHub(withHome('fireflies'));
    const haven = document.querySelector('.home-hub__house .haven');
    expect(haven?.classList.contains('haven--fireflies')).toBe(true);
    expect(haven?.getAttribute('aria-hidden')).toBe('true');
    expect(haven?.querySelectorAll('.haven__mote').length).toBeGreaterThan(3);
  });

  it('shows nothing around him in the plain mood, and holds still without effects', () => {
    mountHub(withHome('none'));
    expect(document.querySelector('.haven')).toBeNull();
    document.body.innerHTML = '';
    mountHub(withHome('stardust', false));
    expect(document.querySelector('.haven')?.classList.contains('is-still')).toBe(true);
  });

  it('changes the ambience right at the companion', () => {
    const { store, rerender } = mountHub(withHome('moon'));
    const group = screen.getByRole('radiogroup', { name: /Zuhause/ });
    fireEvent.click(within(group).getByRole('radio', { name: 'Glühwürmchen' }));
    expect(store.getState().settings.companion.home).toBe('fireflies');
    rerender();
    expect(within(group).getByRole('radio', { name: 'Glühwürmchen' }).getAttribute('aria-checked')).toBe('true');
  });

  it('can be chosen in the settings, too', () => {
    const store = createStore({ storage: createMemoryStore(), key: 'k', initial: emptyState(), persistDelayMs: 0 });
    const services = { store, announce: () => {} } as unknown as Services;
    render(
      <ServicesContext.Provider value={services}>
        <SettingsDialog open onClose={() => {}} initialTab="companion" />
      </ServicesContext.Provider>,
    );
    const group = screen.getByRole('radiogroup', { name: /Zuhause/, hidden: true });
    fireEvent.click(within(group).getByRole('radio', { name: /Sternenstaub/, hidden: true }));
    expect(store.getState().settings.companion.home).toBe('stardust');
  });
});
