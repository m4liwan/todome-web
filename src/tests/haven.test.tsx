import { fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ServicesContext, type Services } from '../app/services';
import { CompanionHub } from '../components/CompanionHub';
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

  it('offers eight quiet moods, one of them plain', () => {
    expect(HAVENS.map((h) => h.id)).toEqual(['moon', 'fireflies', 'stardust', 'dew', 'hearth', 'rain', 'sakura', 'none']);
    expect(HAVENS.map((h) => h.label)).toEqual(['Mondschein', 'Glühwürmchen', 'Sternenstille', 'Morgentau', 'Kaminfeuer', 'Regennacht', 'Sakura-Abend', 'Schlicht']);
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
    fireEvent.click(within(group).getByRole('radio', { name: /Sternenstille/, hidden: true }));
    expect(store.getState().settings.companion.home).toBe('stardust');
  });
});

describe('the Begleiter tab: his true home', () => {
  const home = (h: string, onHome?: (id: string) => void) => {
    const s = withHome(h);
    return render(<CompanionHub state={s} now={NOW} onHome={onHome as never} />);
  };

  it('welcomes you home, with him standing in his ambience inside a room of his own', () => {
    home('fireflies');
    const room = document.querySelector('.companion-hub__home')!;
    expect(room.querySelector('.haven.haven--fireflies')).not.toBeNull();
    expect(room.querySelector('.companion-hub__stage')).not.toBeNull();
    expect(room.querySelector('.companion-hub__horizon')).not.toBeNull();
    expect(screen.getByText(/Willkommen zu Hause/)).not.toBeNull();
    // The level is still there, just no longer the only thing.
    expect(document.querySelector('.companion-hub__level-num')).not.toBeNull();
  });

  it('lets a soft lantern follow the mouse through his room', () => {
    home('moon');
    const room = document.querySelector<HTMLElement>('.companion-hub__home')!;
    room.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.mouseMove(room, { clientX: 100, clientY: 50 });
    expect(room.style.getPropertyValue('--mx')).toBe('25%');
    expect(room.style.getPropertyValue('--my')).toBe('25%');
  });

  it('changes his home right there', () => {
    const onHome = vi.fn();
    home('moon', onHome);
    fireEvent.click(within(screen.getByRole('radiogroup', { name: /Zuhause/ })).getByRole('radio', { name: 'Morgentau' }));
    expect(onHome).toHaveBeenCalledWith('dew');
  });

  it('bathes the whole tab in his ambience, not only his alcove', () => {
    home('rain');
    // At the window, not inside the tab's box (no edge, no box).
    const room = document.querySelector('#companion-room > .haven.haven--room.haven--rain');
    expect(room).not.toBeNull();
    expect(room!.querySelectorAll('.haven__mote').length).toBeGreaterThanOrEqual(10);
  });

  it('lets him stand free on the horizon: no box beneath him', () => {
    const css = readFileSync(join(process.cwd(), 'src', 'styles', 'components', 'companion-hub.css'), 'utf8');
    expect(css).not.toMatch(/\.companion-hub__home::after/);
    expect(css).toMatch(/\.companion-hub__floor\s*\{[^}]*radial-gradient/);
    home('moon');
    expect(document.querySelector('.companion-hub__home .companion-hub__floor')).not.toBeNull();
  });

  it('places the things you choose at his side, on his horizon', () => {
    const onObjects = vi.fn();
    const s = withHome('moon');
    render(<CompanionHub state={{ ...s, settings: { ...s.settings, companion: { ...s.settings.companion, objects: ['tea', 'candle'] } } }} now={NOW} onObjects={onObjects} />);
    const placed = [...document.querySelectorAll('.companion-hub__home .belonging')].map((e) => e.getAttribute('data-id'));
    expect(placed).toEqual(['tea', 'candle']);
    const group = screen.getByRole('group', { name: 'An seiner Seite' });
    expect(within(group).getByRole('button', { name: 'Teetasse' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(group).getByRole('button', { name: 'Pflanze' }));
    expect(onObjects).toHaveBeenCalledWith(['tea', 'candle', 'plant']);
    fireEvent.click(within(group).getByRole('button', { name: 'Teetasse' }));
    expect(onObjects).toHaveBeenLastCalledWith(['candle']);
  });
});

describe('his things, remembered', () => {
  it('keeps known things once each and drops anything else', () => {
    const base = emptyState();
    const load = (objects: unknown) =>
      parseState(JSON.stringify({ ...base, settings: { ...base.settings, companion: { ...base.settings.companion, objects } } }))?.settings.companion.objects;
    expect(load(['tea', 'book', 'tea', 'sofa'])).toEqual(['tea', 'book']);
    expect(load('tea')).toEqual([]);
    expect(emptyState().settings.companion.objects).toEqual([]);
  });
});
