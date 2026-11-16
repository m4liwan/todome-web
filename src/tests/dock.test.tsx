import { fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss, { type Rule } from 'postcss';
import { describe, expect, it, vi } from 'vitest';
import { ServicesContext, type Services } from '../app/services';
import { Dock } from '../components/Dock';
import { PillNav } from '../components/PillNav';
import { Topbar, type View } from '../components/Topbar';
import type { AppState } from '../domain/types';
import { contextLabels } from '../domain/userContext';
import { createMemoryStore } from '../lib/storage';
import { dayKey } from '../lib/time';
import { emptyState } from '../state/defaults';
import { createStore, parseState } from '../state/store';

const NOW = new Date(2026, 10, 15, 10, 0).getTime();

function servicesFor(state: AppState) {
  const store = createStore({ storage: createMemoryStore(), key: 'k', initial: state, persistDelayMs: 0 });
  return { store, services: { store, announce: () => {}, mode: 'live', clock: { now: () => NOW, speed: 1 } } as unknown as Services };
}

function mount(view: View = 'today', state: AppState = emptyState()) {
  const { store, services } = servicesFor(state);
  const onView = vi.fn();
  const onOpen = vi.fn();
  const onResume = vi.fn();
  const ui = (s: AppState) => (
    <ServicesContext.Provider value={services}>
      <Dock state={s} view={view} onView={onView} onOpen={onOpen} onResume={onResume} />
    </ServicesContext.Provider>
  );
  const r = render(ui(state));
  return { store, onView, onOpen, onResume, rerender: () => r.rerender(ui(store.getState())) };
}

const css = (file: string) => postcss.parse(readFileSync(join(process.cwd(), 'src', 'styles', ...file.split('/')), 'utf8'));

describe('the navigation bar', () => {
  it('marks the current station for screen readers', () => {
    mount('times');
    expect(screen.getByRole('button', { name: /Rückblick/ }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: /Heute/ }).hasAttribute('aria-current')).toBe(false);
  });

  it('switches views, the day end included', () => {
    const { onView } = mount();
    fireEvent.click(screen.getByRole('button', { name: /Begleiter/ }));
    expect(onView).toHaveBeenCalledWith('companion');
    fireEvent.click(screen.getByRole('button', { name: contextLabels(emptyState().settings.userContext).dayEnd }));
    expect(onView).toHaveBeenCalledWith('closing');
  });

  it('offers the second shift once the day is closed', () => {
    const base = emptyState();
    const { onResume, onView } = mount('today', { ...base, coach: { ...base.coach, closedDay: dayKey(NOW) } });
    fireEvent.click(screen.getByRole('button', { name: 'Fokus wieder aufnehmen' }));
    expect(onResume).toHaveBeenCalled();
    expect(onView).not.toHaveBeenCalled();
  });

  it('toggles do-not-disturb and the light', () => {
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

  it('names every view in the bar, each with its icon', () => {
    mount();
    const bar = document.querySelector<HTMLElement>('.pill-nav__bar')!;
    for (const name of ['Heute', 'Rückblick', 'Begleiter']) {
      const button = within(bar).getByRole('button', { name });
      expect(button.querySelector('.pill-nav__face svg')).not.toBeNull();
      expect(button.querySelector('.pill-nav__face')?.textContent).toBe(name);
    }
  });

  it('closes the bar with the day end, set apart as the anchor of the day', () => {
    mount();
    const end = screen.getByRole('button', { name: contextLabels(emptyState().settings.userContext).dayEnd });
    const slots = [...document.querySelectorAll('.pill-nav__bar .pill-nav__slot')];
    expect(slots.at(-1)?.contains(end)).toBe(true);
    expect(slots.at(-1)?.hasAttribute('data-anchor')).toBe(true);
    expect(end.className).toContain('pill-nav__item--anchor');
    // Softly lit in the light colour, so it stands out from the views.
    expect(readFileSync(join(process.cwd(), 'src', 'styles', 'components', 'pill-nav.css'), 'utf8')).toMatch(/\.pill-nav__item--anchor\s*\{[^}]*box-shadow:[^}]*accent-rgb/);
  });

  it('carries the ToDoMe mark in the slot left of the bar', () => {
    mount();
    const slot = document.querySelector('.pill-nav__logo')!;
    expect(slot.nextElementSibling?.classList.contains('pill-nav__bar')).toBe(true);
    expect(slot.querySelector('.dock__mark img')).not.toBeNull();
    expect(slot.querySelector('.dock__mark-dot')).not.toBeNull();
  });

  it('shows no level in the navigation', () => {
    const base = emptyState();
    mount('today', { ...base, progression: { ...base.progression, stats: { ...base.progression.stats, level: 5 } } });
    expect(document.querySelector('.dock')?.textContent).not.toMatch(/Lv\./);
    expect(document.querySelector('.level-badge')).toBeNull();
  });

  it('marks the day end as current while the day is being closed', () => {
    mount('closing');
    expect(screen.getByRole('button', { name: contextLabels(emptyState().settings.userContext).dayEnd }).getAttribute('aria-current')).toBe('page');
  });
});

describe('the bar in the OLED look', () => {
  const nav = css('components/pill-nav.css');
  const dock = css('components/dock.css');

  it('takes every corner from the corner setting: no pill shape left', () => {
    const offenders: string[] = [];
    for (const sheet of [nav, dock]) {
      sheet.walkDecls(/radius$/, (d) => {
        if (!/var\(--radius\)|^50%$|^2px$|^inherit$/.test(d.value)) offenders.push(`${(d.parent as Rule).selector}: ${d.value}`);
      });
    }
    expect(offenders).toEqual([]);
    for (const sel of ['.pill-nav__bar', '.pill-nav__logo', '.pill-nav__item', '.dock__tools']) {
      let radius = '';
      for (const sheet of [nav, dock])
        sheet.walkRules((r: Rule) => {
          if (r.selector === sel)
            r.walkDecls('border-radius', (d) => {
              radius = d.value;
            });
        });
      expect(radius, sel).toBe('var(--radius)');
    }
  });

  it('colours the hover fill, the lit label and the focus ring with the light colour, the current mark stays tone in tone', () => {
    const vars: Record<string, string> = {};
    nav.walkRules((r: Rule) => {
      if (r.selector !== '.pill-nav') return;
      r.walkDecls(/^--pn-/, (d) => {
        vars[d.prop] = d.value;
      });
    });
    for (const v of ['--pn-pill', '--pn-pill-ink', '--pn-ring']) expect(vars[v], v).toMatch(/var\(--accent-rgb\)/);
    // The current view is marked tone in tone: a fine hairline in the ink, no coloured dot.
    expect(vars['--pn-dot']).not.toMatch(/accent/);
    // Hairlines instead of grey surfaces: the edge is the app's hairline, the surface the page's black.
    expect(vars['--pn-edge']).toBe('var(--line)');
    expect(vars['--pn-surface']).toMatch(/^rgb\(var\(--bg-rgb\) \//);
    // No fixed colour anywhere else: no hex, no grey.
    const fixed: string[] = [];
    nav.walkDecls((d) => {
      if (/#[0-9a-f]{3,8}\b/i.test(d.value)) fixed.push(`${(d.parent as Rule).selector}: ${d.value}`);
    });
    expect(fixed).toEqual([]);
  });
});

describe('the mark of the current view', () => {
  it('is a fine hairline under the name, not a dot', () => {
    let rule: Rule | undefined;
    css('components/pill-nav.css').walkRules((r: Rule) => {
      if (r.selector === '.pill-nav__dot') rule = r;
    });
    const decl = (prop: string) => {
      let v = '';
      rule?.walkDecls(prop, (d) => {
        v = d.value;
      });
      return v;
    };
    expect(parseFloat(decl('height'))).toBe(1);
    expect(parseFloat(decl('width'))).toBeGreaterThanOrEqual(12);
    expect(decl('box-shadow')).toBe('');
    expect(decl('border-radius')).toBe('');
  });
});

describe('the bar when it is too narrow', () => {
  const items = [
    { id: 'a', label: 'Eins' },
    { id: 'b', label: 'Zwei', anchor: true },
  ];

  it('folds the items into a menu behind a toggle and closes it after a choice', () => {
    const onSelect = vi.fn();
    render(<PillNav items={items} activeId="a" onSelect={onSelect} collapse="always" />);
    expect(document.querySelector('.pill-nav__bar')).toBeNull();
    const toggle = screen.getByRole('button', { name: 'Menü öffnen' });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Eins' }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(screen.getByRole('button', { name: 'Zwei' }));
    expect(onSelect).toHaveBeenCalledWith(items[1]);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('the dock position', () => {
  it('keeps top or bottom and falls back to the top centre for anything else', () => {
    const base = emptyState();
    const load = (dock: unknown) =>
      parseState(JSON.stringify({ ...base, settings: { ...base.settings, appearance: { ...base.settings.appearance, dock } } }))?.settings.appearance.dock;
    expect(load('bottom')).toBe('bottom');
    expect(load('top')).toBe('top');
    // The sides from before the bar land at the top.
    expect(load('right')).toBe('top');
    expect(load('left')).toBe('top');
    expect(load('diagonal')).toBe('top');
    expect(load(undefined)).toBe('top');
  });

  it('frames the content on the side the dock sits on', () => {
    const frame: Record<string, string[]> = {};
    css('base/tokens.css').walkRules((r: Rule) => {
      const pos = /\[data-dock='(\w+)'\]/.exec(r.selector)?.[1];
      if (!pos) return;
      r.walkDecls(/^--frame-/, (d) => {
        (frame[pos] ??= []).push(`${d.prop}:${d.value}`);
      });
    });
    expect(Object.keys(frame).sort()).toEqual(['bottom', 'top']);
    expect(frame.top).toContain('--frame-t:var(--dock-space)');
    expect(frame.bottom).toContain('--frame-b:var(--dock-space)');
  });
});

describe('the minimal header', () => {
  it('is only the drag strip: no navigation, no day-end button', () => {
    const state = emptyState();
    const { services } = servicesFor(state);
    render(
      <ServicesContext.Provider value={services}>
        <Topbar state={state} />
      </ServicesContext.Provider>,
    );
    expect(document.querySelector('.topbar-wrap')).not.toBeNull();
    expect(document.querySelectorAll('.topbar-wrap button')).toHaveLength(0);
  });
});
