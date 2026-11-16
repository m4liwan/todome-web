import { fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ServicesContext, type Services } from '../app/services';
import { HorizonView } from '../components/HorizonView';
import { CompanionBubble } from '../components/CompanionBubble';
import { QuickOrb } from '../components/QuickOrb';
import { WinterMagic, winterWaiting } from '../components/Winter';
import { SettingsDialog } from '../components/dialogs/SettingsDialog';
import { dueReminder, eventAt, reminderAt, reminderMessage, sanitizeEvents } from '../domain/calendar';
import { roomLife, roomPhase, roomWeather } from '../domain/companionRoom';
import { LIGHTS } from '../domain/lights';
import { isQuickShortcut, quickShortcut } from '../domain/quickOrb';
import type { AppState, CalendarEvent } from '../domain/types';
import { createMemoryStore } from '../lib/storage';
import { emptyState } from '../state/defaults';
import { reducer } from '../state/reducer';
import { createStore, parseState } from '../state/store';

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();
const tokens = readFileSync(join(process.cwd(), 'src', 'styles', 'base', 'tokens.css'), 'utf8');
const css = (...p: string[]) => readFileSync(join(process.cwd(), 'src', 'styles', ...p), 'utf8');

function mount(state: AppState, ui: (s: AppState) => JSX.Element) {
  let id = 0;
  const store = createStore({ storage: createMemoryStore(), key: 'k', initial: state, persistDelayMs: 0 });
  const services = {
    store,
    announce: () => {},
    clock: { now: () => at(16, 10), speed: 1 },
    deps: () => ({ now: at(16, 10), newId: () => `id${++id}` }),
    run: () => true,
  } as unknown as Services;
  const view = () => <ServicesContext.Provider value={services}>{ui(store.getState())}</ServicesContext.Provider>;
  const r = render(view());
  return { store, rerender: () => r.rerender(view()) };
}

const meeting = (patch: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'e1',
  title: 'Team-Meeting',
  kind: 'meeting',
  day: '2026-11-20',
  time: '10:00',
  remind: ['3d', '1d', '1h'],
  sent: [],
  createdAt: 0,
  ...patch,
});

describe('the calendar and the companion who reminds', () => {
  it('reminds days ahead in the morning and hours ahead before the date', () => {
    const e = meeting();
    expect(eventAt(e)).toBe(at(20, 10));
    expect(reminderAt(e, '3d')).toBe(at(17, 9));
    expect(reminderAt(e, '1d')).toBe(at(19, 9));
    expect(reminderAt(e, '1h')).toBe(at(20, 9));
  });

  it('gives each reminder once, the latest one due, and nothing after the date', () => {
    const e = meeting();
    expect(dueReminder([e], at(17, 8))).toBeNull();
    // The app was closed for days: one reminder, which covers the missed one too.
    expect(dueReminder([e], at(19, 12))).toMatchObject({ reminder: '1d', covers: ['3d', '1d'] });
    expect(dueReminder([{ ...e, sent: ['3d', '1d'] }], at(19, 12))).toBeNull();
    expect(dueReminder([e], at(20, 11))).toBeNull();
  });

  it('speaks calmly, by kind, and offers the calendar', () => {
    const msg = reminderMessage('m', meeting({ kind: 'exam', title: 'Klausur Statistik' }), '1d', at(19, 9));
    expect(msg.kind).toBe('reminder');
    expect(msg.text).toMatch(/^Morgen um 10:00: „Klausur Statistik“/);
    expect(msg.text).toMatch(/kleines Stück/);
    expect(msg.options.map((o) => o.id)).toEqual(['ok', 'open']);
  });

  it('keeps sound dates only and remembers them', () => {
    expect(sanitizeEvents([meeting(), { id: 'x', title: '', day: '2026-11-20' }, { id: 'y', title: 'A', day: 'morgen' }, meeting()])).toHaveLength(1);
    const base = emptyState();
    const s = parseState(JSON.stringify({ ...base, calendar: [meeting({ remind: ['1h', '3d', 'nie'] as never })] }));
    expect(s?.calendar[0]?.remind).toEqual(['3d', '1h']);
    expect(parseState(JSON.stringify({ ...base, calendar: undefined }))?.calendar).toEqual([]);
  });

  it('adds, marks and removes dates in the reducer', () => {
    let s = reducer(emptyState(), { type: 'event/upsert', event: meeting() });
    s = reducer(s, { type: 'event/reminded', id: 'e1', reminders: ['1d', '3d'] });
    expect(s.calendar[0]?.sent).toEqual(['3d', '1d']);
    s = reducer(s, { type: 'event/remove', id: 'e1' });
    expect(s.calendar).toEqual([]);
  });

  it('maps the first kinds to their successors', () => {
    const [a, b] = sanitizeEvents([meeting({ id: 'a', kind: 'work' as never }), meeting({ id: 'b', kind: 'study' as never })]);
    expect([a?.kind, b?.kind]).toEqual(['appointment', 'exam']);
  });

  it('opens the Horizont: his words, seven calm days, and a form with a kind and reminders', () => {
    const base = emptyState();
    const state = { ...base, calendar: [meeting({ day: '2026-11-17' })] };
    const { store, rerender } = mount(state, (s) => <HorizonView state={s} now={at(16, 10)} day="2026-11-20" />);
    expect(document.querySelector('.horizon__line')?.textContent).toMatch(/Als Nächstes: „Team-Meeting“, morgen um 10:00/);
    expect(document.querySelectorAll('.horizon__day')).toHaveLength(7);
    expect(document.querySelectorAll('.horizon__day.is-free').length).toBe(6);
    fireEvent.change(screen.getByRole('textbox', { name: /Was steht an/ }), { target: { value: 'Klausur Statistik' } });
    fireEvent.click(screen.getByRole('combobox', { name: 'Art des Eintrags' }));
    fireEvent.click(screen.getByRole('option', { name: 'Prüfung / Klausur' }));
    fireEvent.click(screen.getByRole('button', { name: '3 Tage vorher' }));
    fireEvent.click(screen.getByRole('button', { name: /In den Kalender/ }));
    const added = store.getState().calendar.find((e) => e.title === 'Klausur Statistik');
    expect(added).toMatchObject({ kind: 'exam', day: '2026-11-20', time: '10:00', remind: ['3d', '1d', '3h'] });
    rerender();
    expect(screen.getAllByText('Klausur Statistik', { exact: false }).length).toBeGreaterThan(0);
  });
});

/** Hue (0–360), saturation and lightness (0–1) of a hex colour. */
function hsl(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

describe('Ambient Light 5.0', () => {
  it('sets every colour clearly apart: by hue within a family, by hue, depth or softness across them', () => {
    const colours = LIGHTS.filter((l) => l.id !== 'mono' && l.id !== 'rainbow');
    for (const a of colours) {
      for (const b of colours) {
        if (a.id >= b.id) continue;
        const [h1, s1, l1] = hsl(a.color);
        const [h2, s2, l2] = hsl(b.color);
        const hue = Math.min(Math.abs(h1 - h2), 360 - Math.abs(h1 - h2));
        const pair = `${a.label} / ${b.label}`;
        if (a.family === b.family) expect(hue, pair).toBeGreaterThanOrEqual(20);
        else expect(hue >= 20 || Math.abs(l1 - l2) >= 0.15 || Math.abs(s1 - s2) >= 0.5, pair).toBe(true);
      }
    }
  });

  it('orders the colours by family, a rainbow among them, the exclusive ones together at the end', () => {
    expect(LIGHTS.map((l) => l.family)).toEqual([...LIGHTS.map((l) => l.family)].sort((a, b) => ['strong', 'soft', 'special', 'exclusive'].indexOf(a) - ['strong', 'soft', 'special', 'exclusive'].indexOf(b)));
    expect(LIGHTS.filter((l) => l.family === 'exclusive').map((l) => l.id)).toEqual(['violet', 'rose']);
    expect(LIGHTS.find((l) => l.id === 'rainbow')?.label).toBe('Regenbogen');
    for (const l of ['Mitternachts-Kobalt', 'Smaragd-Wald', 'Elektrisches Cyan', 'Tiefes Rubin', 'Soft Rose', 'Sakura-Pink', 'Lavendel-Nebel', 'Flieder-Aura']) expect(LIGHTS.map((x) => x.label)).toContain(l);
    for (const l of LIGHTS.filter((x) => x.id !== 'lime')) {
      expect(tokens, l.id).toMatch(new RegExp(String.raw`:root\[data-palette='${l.id}'\]`));
      expect(tokens, l.id).toMatch(new RegExp(String.raw`:root\[data-theme='light'\]\[data-palette='${l.id}'\]`));
    }
    // The rainbow paints its own turning circle of every colour.
    expect(css('components', 'ambient-light.css')).toMatch(/:root\[data-palette='rainbow'\] \.light__rainbow/);
  });

  it('moves in five ways, each its own while nothing runs', () => {
    const light = css('components', 'ambient-light.css');
    for (const m of ['breathe', 'aurora', 'center', 'corners']) expect(light, m).toMatch(new RegExp(`:root\\[data-light='${m}'\\] \\.shell:not\\(\\.is-focusing\\)`));
    const base = emptyState();
    const load = (lightMode: unknown) => parseState(JSON.stringify({ ...base, settings: { ...base.settings, appearance: { ...base.settings.appearance, lightMode } } }))?.settings.appearance.lightMode;
    expect(load('aurora')).toBe('aurora');
    expect(load('disco')).toBe('drift');
  });

  it('is chosen in the settings: the colour families, how it moves, and his size', () => {
    const { store } = mount(emptyState(), () => <SettingsDialog open onClose={() => {}} initialTab="design" />);
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Wie sich das Licht bewegt', hidden: true })).getByRole('radio', { name: /Ecken-Glow/, hidden: true }));
    expect(store.getState().settings.appearance.lightMode).toBe('corners');
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Größe deines Begleiters', hidden: true })).getByRole('radio', { name: /Groß/, hidden: true }));
    expect(store.getState().settings.appearance.companionSize).toBe('large');
    fireEvent.click(screen.getByRole('radio', { name: /Tiefes Rubin/, hidden: true }));
    expect(store.getState().settings.appearance.palette).toBe('ruby');
  });

  it('scales the companion in every room by the chosen size', () => {
    expect(tokens).toMatch(/\[data-buddy='large'\][^}]*--buddy-k/);
    expect(css('layout', 'cockpit.css')).toMatch(/\.cockpit--duo \.cockpit__partner \.home-hub__house \{\s*zoom: calc\([\d.]+ \* var\(--buddy-k\)\)/);
  });

  it('brings a crackling fireplace, in picture and in sound: the wood in front, the roar far back', () => {
    const sound = readFileSync(join(process.cwd(), 'src', 'lib', 'soundscape.ts'), 'utf8');
    const hearth = sound.slice(sound.indexOf("kind === 'hearth'"), sound.indexOf('// Autumn'));
    expect(hearth).toMatch(/Crackle/);
    expect(hearth).toMatch(/Wood snapping/);
    expect(Number(/const breath = bed\(\[[^\]]*\], ([\d.]+)\)/.exec(hearth)?.[1])).toBeLessThanOrEqual(0.2);
    expect(css('layout', 'shell.css')).toMatch(/\.ambience--hearth/);
  });
});

describe('the quick-shortcut orb', () => {
  it('knows its shortcuts and keeps 2 to 5 of them', () => {
    expect(isQuickShortcut('ambience:hearth')).toBe(true);
    expect(isQuickShortcut('palette:sakura')).toBe(true);
    expect(isQuickShortcut('rm -rf')).toBe(false);
    const base = emptyState();
    const load = (quickOrb: unknown) => parseState(JSON.stringify({ ...base, settings: { ...base.settings, quickOrb } }))?.settings.quickOrb;
    expect(load({ enabled: true, items: ['light', 'winter', 'light', 'nope', 'theme', 'sound', 'palette:lime'], x: 3, y: -1 })).toEqual({
      enabled: true,
      items: ['light', 'winter', 'theme', 'sound', 'palette:lime'],
      x: 1,
      y: 0,
    });
    expect(load({ items: ['light'] })?.items.length).toBeGreaterThanOrEqual(2);
  });

  it('turns the fireplace on with its sound, and off again', () => {
    const s = emptyState().settings;
    const hearth = quickShortcut('ambience:hearth')!;
    const on = { ...s, ...hearth.patch(s) };
    expect(on.appearance).toMatchObject({ ambience: 'hearth', sound: true });
    expect(hearth.isOn(on)).toBe(true);
    expect({ ...on, ...hearth.patch(on) }.appearance.ambience).toBe('none');
  });

  it('unfolds its shortcuts on a click and runs them', () => {
    const base = emptyState();
    const state = { ...base, settings: { ...base.settings, quickOrb: { enabled: true, items: ['winter', 'palette:emerald'], x: 0.5, y: 0.3 } } };
    const { store, rerender } = mount(state, (s) => <QuickOrb state={s} />);
    const core = screen.getByRole('button', { name: 'Schnellzugriff' });
    expect(document.getElementById('quick-orb-menu')?.hasAttribute('inert')).toBe(true);
    fireEvent.pointerDown(core, { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(core, { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
    rerender();
    expect(core.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Smaragd-Wald/ }));
    expect(store.getState().settings.appearance.palette).toBe('emerald');
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Winterzauber/ }));
    expect(store.getState().settings.appearance.xmas).toBe('always');
  });

  it('is switched on and filled in its own settings area', () => {
    const { store } = mount(emptyState(), () => <SettingsDialog open onClose={() => {}} initialTab="shortcuts" />);
    fireEvent.click(screen.getByRole('switch', { hidden: true }));
    expect(store.getState().settings.quickOrb.enabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /^Raum Duo/, hidden: true }));
    expect(store.getState().settings.quickOrb.items).toContain('layout:duo');
  });
});

describe('the companion drops by in a corner', () => {
  it('comes to the bottom right of the main screen for everyone once; a chosen corner stays', () => {
    const base = emptyState();
    const load = (companion: object) => parseState(JSON.stringify({ ...base, settings: { ...base.settings, companion: { ...base.settings.companion, ...companion } } }))?.settings.companion.position;
    expect(base.settings.companion.position).toBe('bottom-right');
    expect(load({ position: 'center', positionRev: 2 })).toBe('bottom-right');
    expect(load({ position: 'left', positionRev: 2 })).toBe('bottom-left');
    expect(load({ position: 'top-left', positionRev: 3 })).toBe('top-left');
  });

  it('speaks in a bubble whose tail points at him; every other corner follows the setting', () => {
    render(
      <CompanionBubble
        message={{ id: 'm', kind: 'hello', title: 'Hallo', text: 'Schön, dich zu sehen.', mood: 'happy', options: [{ id: 'ok', label: 'Danke', primary: true }], ttlMs: 10_000 }}
        avatar="mark"
        position="top-left"
        variant="inline"
        onReply={() => {}}
        onClosed={() => {}}
      />,
    );
    expect(document.querySelector('.buddy--top-left .buddy__bubble')).not.toBeNull();
    const companion = css('components', 'companion.css');
    expect(/\.buddy__bubble \{([^}]*)\}/.exec(companion)?.[1]).toMatch(/border-radius: var\(--radius\)/);
    for (const c of ['bottom-right', 'bottom-left', 'top-right', 'top-left']) expect(companion, c).toMatch(new RegExp(String.raw`\.buddy--${c} \.buddy__bubble \{[^}]*radius: min\(2px, var\(--radius\)\)`));
    const main = readFileSync(join(process.cwd(), 'electron', 'main.cjs'), 'utf8');
    expect(main).toMatch(/\['bottom-right', 'bottom-left', 'top-right', 'top-left'\]\.includes\(payload\.position\)/);
  });
});

describe('his room', () => {
  it('shows the time of day and the weather in his window', () => {
    expect([roomPhase(at(16, 6)), roomPhase(at(16, 12)), roomPhase(at(16, 19)), roomPhase(at(16, 23))]).toEqual(['dawn', 'day', 'dusk', 'night']);
    expect(roomWeather(null)).toBe('clear');
    expect(roomWeather({ current: { code: 63 } } as never)).toBe('rain');
    expect(roomWeather({ current: { code: 73 } } as never)).toBe('snow');
  });

  it('lets him live along with you', () => {
    const s = emptyState();
    expect(roomLife(s, [], at(16, 23)).activity).toBe('sleeping');
    expect(roomLife(s, [], at(16, 7)).activity).toBe('tea');
    expect(roomLife({ ...s, coach: { ...s.coach, closedDay: '2026-11-16' } }, [], at(16, 18)).activity).toBe('reading');
  });
});

describe('Winterzauber', () => {
  it('shows a hairline garland and a frost light, and says when it waits for December', () => {
    render(<WinterMagic />);
    expect(document.querySelectorAll('.winter__bulb').length).toBeGreaterThan(10);
    expect(document.querySelector('.winter__frost')).not.toBeNull();
    expect(css('components', 'winter.css')).not.toMatch(/display:\s*none/);
    expect(winterWaiting('december', at(16, 10))).toBe(true);
    expect(winterWaiting('always', at(16, 10))).toBe(false);
  });
});
