import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServicesContext, type Services } from '../app/services';
import { applyUiScale } from '../app/theme';
import { Cockpit } from '../components/Cockpit';
import { CompanionHub } from '../components/CompanionHub';
import { Dock } from '../components/Dock';
import { fanPositions } from '../components/QuickOrb';
import { Splash } from '../components/Splash';
import { WeekView } from '../components/WeekView';
import { SettingsDialog } from '../components/dialogs/SettingsDialog';
import { nextStroll, ROOM_THINGS } from '../domain/roomObjects';
import type { AppState } from '../domain/types';
import { createMemoryStore } from '../lib/storage';
import { emptyState } from '../state/defaults';
import { createStore, parseState } from '../state/store';

const require = createRequire(import.meta.url);
const NOW = new Date(2026, 10, 16, 10, 0).getTime();
const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8');
const IDS = ['greet', 'focus', 'hub', 'plan', 'tl', 'anchors', 'water', 'weather', 'times', 'week', 'impulse', 'thoughts', 'routines'];
const stubs = Object.fromEntries(IDS.map((id) => [id, <p key={id}>{id}</p>]));

function services(state: AppState) {
  const store = createStore({ storage: createMemoryStore(), key: 'k', initial: state, persistDelayMs: 0 });
  return { store, value: { store, announce: () => {}, clock: { now: () => NOW, speed: 1 }, deps: () => ({ now: NOW, newId: () => 'x' }), run: () => true } as unknown as Services };
}

afterEach(() => vi.useRealTimers());

describe('the settings studio', () => {
  it('offers the interface size like a phone, 90 to 120 %, remembered', () => {
    const { store, value } = services(emptyState());
    render(
      <ServicesContext.Provider value={value}>
        <SettingsDialog open onClose={() => {}} initialTab="design" />
      </ServicesContext.Provider>,
    );
    const group = screen.getByRole('radiogroup', { name: 'Größe der Oberfläche', hidden: true });
    expect(within(group).getAllByRole('radio', { hidden: true }).map((r) => r.querySelector('strong')?.textContent)).toEqual(['Kompakt', 'Standard', 'Groß', 'Komfort']);
    fireEvent.click(within(group).getByRole('radio', { name: /Kompakt/, hidden: true }));
    expect(store.getState().settings.appearance.uiScale).toBe(0.9);
    const base = emptyState();
    const load = (uiScale: unknown) => parseState(JSON.stringify({ ...base, settings: { ...base.settings, appearance: { ...base.settings.appearance, uiScale } } }))?.settings.appearance.uiScale;
    expect(load(1.1)).toBe(1.1);
    expect(load(3)).toBe(1);
  });

  it('scales the whole window on the desktop through its own zoom, only to the offered sizes', () => {
    const { attachZoom } = require('../../electron/zoom.cjs');
    let factor = 1;
    const contents = { on: () => {}, setZoomFactor: (f: number) => (factor = f), getZoomFactor: () => factor };
    const zoom = attachZoom(contents, { read: () => 1, write: () => {} });
    expect(zoom.setScale(1.2)).toBe(true);
    expect(factor).toBe(1.2);
    expect(zoom.setScale(5)).toBe(false);
    expect(factor).toBe(1.2);
    expect(read('electron', 'main.cjs')).toMatch(/ipcMain\.on\('todome:set-ui-scale', \(event, factor\) => \{\s*if \(!fromApp\(event\)/);
    // In a browser the page zoom stands in for it (jsdom does not keep `zoom`, so the call is watched).
    const set = vi.spyOn(document.documentElement.style, 'setProperty');
    applyUiScale(1.1);
    expect(set).toHaveBeenLastCalledWith('zoom', '1.1');
    applyUiScale(1);
    expect(set).toHaveBeenLastCalledWith('zoom', '');
    set.mockRestore();
  });

  it('lists the exclusive light colours together at the end, their lock and badge centred', () => {
    const { value } = services(emptyState());
    render(
      <ServicesContext.Provider value={value}>
        <SettingsDialog open onClose={() => {}} initialTab="design" />
      </ServicesContext.Provider>,
    );
    const colours = [...document.querySelectorAll<HTMLElement>('.palettes .palette')].map((p) => p.classList.contains('is-pro'));
    const firstPro = colours.indexOf(true);
    expect(firstPro).toBeGreaterThan(0);
    expect(colours.slice(firstPro).every(Boolean)).toBe(true);
    const settings = read('src', 'styles', 'components', 'settings.css');
    expect(settings).toMatch(/\.palette \.pro-lock \{[^}]*position: static;[^}]*justify-self: center/);
    expect(settings).toMatch(/\.option\.focus-style-opt \.pro-lock \{[^}]*justify-content: center/);
  });
});

describe('the Horizont in the navigation', () => {
  it('has its own place in the bar, between Heute and Rückblick', () => {
    const { value } = services(emptyState());
    render(
      <ServicesContext.Provider value={value}>
        <Dock state={emptyState()} view="today" onView={() => {}} onOpen={() => {}} onResume={() => {}} />
      </ServicesContext.Provider>,
    );
    const bar = document.querySelector<HTMLElement>('.pill-nav__bar')!;
    const names = [...bar.querySelectorAll('.pill-nav__face')].map((f) => f.textContent);
    expect(names.slice(0, 4)).toEqual(['Heute', 'Horizont', 'Rückblick', 'Begleiter']);
  });
});

describe('his living room', () => {
  const withThings = (objects: AppState['settings']['companion']['objects']) => {
    const s = emptyState();
    return { ...s, settings: { ...s.settings, companion: { ...s.settings.companion, objects } } };
  };

  it('walks to a thing you click and uses it', () => {
    vi.useFakeTimers();
    render(<CompanionHub state={withThings(['tea', 'instrument'])} now={NOW} />);
    const room = document.querySelector<HTMLElement>('.companion-hub__home')!;
    fireEvent.click(screen.getByRole('button', { name: /Teekanne: Spike hingehen lassen/ }));
    expect(room.style.getPropertyValue('--mark-x')).toBe(`${ROOM_THINGS.find((t) => t.id === 'tea')!.x}%`);
    expect(room.querySelector('.mark-room__caption')?.textContent).toMatch(/Tee/);
    expect(document.querySelector('.companion-hub__stage')?.classList.contains('is-walking')).toBe(true);
    act(() => void vi.advanceTimersByTime(2300));
    expect(document.querySelector('.companion-hub__stage')?.classList.contains('is-walking')).toBe(false);
    expect(document.querySelector('.room-thing--tea')?.classList.contains('is-used')).toBe(true);
  });

  it('strolls on his own: to the window, a seat or one of his things, never where he already stands', () => {
    for (let seed = 0; seed < 20; seed++) {
      const n = nextStroll(56, ['plant'], seed);
      expect(n.x).not.toBe(56);
    }
    const spots = new Set(Array.from({ length: 20 }, (_, i) => nextStroll(10, ['plant'], i).doing));
    expect([...spots].some((d) => /Fenster/.test(d))).toBe(true);
    expect([...spots].some((d) => /Pflanze/.test(d))).toBe(true);
  });

  it('is furnished beneath the room; the bond and the path lie horizontally', () => {
    const onThings = vi.fn();
    render(<CompanionHub state={withThings(['tea'])} now={NOW} onThings={onThings} />);
    fireEvent.click(within(screen.getByRole('group', { name: 'Einrichtung' })).getByRole('button', { name: 'Kamin' }));
    expect(onThings).toHaveBeenCalledWith(['tea', 'hearth']);
    expect(read('src', 'styles', 'components', 'companion-hub.css')).toMatch(/\.reward-path \{[^}]*grid-auto-flow: column/);
    const base = emptyState();
    expect(parseState(JSON.stringify({ ...base, settings: { ...base.settings, companion: { ...base.settings.companion, objects: ['hearth', 'instrument', 'sofa'] } } }))?.settings.companion.objects).toEqual(['hearth', 'instrument']);
  });
});

describe('the quick-shortcut orb fans out', () => {
  it('lays up to five shortcuts on an arc that opens towards the middle', () => {
    const right = fanPositions(5, { x: 0.97, y: 0.5 });
    expect(right).toHaveLength(5);
    for (const p of right) expect(Math.round(Math.hypot(p.x, p.y))).toBeGreaterThanOrEqual(90);
    // Near the right edge, the fan opens to the left.
    expect(right.every((p) => p.x < 30)).toBe(true);
    expect(right[2]!.x).toBeLessThan(-80);
    const css = read('src', 'styles', 'components', 'quick-orb.css');
    expect(css).toMatch(/\.quick-orb\.is-open \.quick-orb__petal \{[^}]*translate\(var\(--x\), var\(--y\)\)/);
  });
});

describe('the home, polished', () => {
  it('keeps the thought of the day in view in Classic, Hub and Flow, and behind the switch elsewhere', () => {
    for (const layout of ['classic', 'hub', 'flow', 'sanctuary', 'duo'] as const) {
      const { unmount } = render(<Cockpit panels={stubs} layout={layout} />);
      const impulse = document.querySelector('.panel--impulse')!;
      const inAreas = Boolean(impulse.closest('.cockpit__areas'));
      expect(inAreas, layout).toBe(layout === 'sanctuary' || layout === 'duo');
      expect(document.querySelectorAll('.panel--impulse'), layout).toHaveLength(1);
      unmount();
    }
    const css = read('src', 'styles', 'layout', 'cockpit.css');
    // Hub: the Tages-Anker get the whole width below "Danach" and the thought.
    expect(css).toMatch(/\.cockpit--hub \{[^}]*'next thought'\s*'anchors anchors'/);
  });

  it('greets larger, and keeps the day on its timeline inside its edges, half-hourly and calm', () => {
    expect(read('src', 'styles', 'components', 'greeting.css')).toMatch(/\.hello h1 \{[^}]*font-size: clamp\(44px/);
    const tl = read('src', 'styles', 'components', 'timeline.css');
    expect(tl).toMatch(/\.timeline__canvas \{[^}]*margin: 0 var\(--s4\)/);
    expect(tl).toMatch(/\.plan-pin\.is-end \{/);
    expect(read('src', 'components', 'Timeline.tsx')).toMatch(/t \+= 30 \* MIN/);
  });

  it('lets the parked thought placeholder run as a calm marquee instead of being cut off', () => {
    const css = read('src', 'styles', 'components', 'home-extras.css');
    expect(css).toMatch(/\.ticker-field\.is-empty \.ticker-field__text/);
    expect(css).toMatch(/\.ticker-field__track \{[^}]*animation: ticker-run/);
    expect(read('src', 'components', 'HomeExtras.tsx')).toMatch(/const shown = value \|\| placeholder;/);
  });

  it('makes the area switch a clear point of interaction', () => {
    render(<Cockpit panels={stubs} />);
    expect(document.querySelector('.orbit__current .orbit__kicker')?.textContent).toBe('Bereich');
    expect(read('src', 'styles', 'layout', 'cockpit.css')).toMatch(/\.orbit \{[^}]*border: 1px solid rgb\(var\(--accent-rgb\)/);
  });

  it('lets the look back arrive without scores: three calm sentences, no ring, no gauge', () => {
    const { value } = services(emptyState());
    render(
      <ServicesContext.Provider value={value}>
        <WeekView state={emptyState()} projections={[]} now={NOW} />
      </ServicesContext.Provider>,
    );
    expect(document.querySelector('.gauge, .care__ring, .care__parts')).toBeNull();
    expect(screen.queryByText('Pausen-Index')).toBeNull();
    expect(document.querySelectorAll('.weekview__care .care__word')).toHaveLength(3);
  });

  it('shows the way in at the login much sooner, under a larger wordmark', () => {
    vi.useFakeTimers();
    render(<Splash state={emptyState()} now={NOW} onDone={() => {}} manual />);
    const enter = document.querySelector('.splash__enter')!;
    act(() => void vi.advanceTimersByTime(2000));
    expect(enter.classList.contains('is-ready')).toBe(true);
    expect(read('src', 'components', 'Splash.tsx')).toMatch(/<Logo height=\{24\} \/>/);
  });
});
