import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss, { type AtRule, type Rule } from 'postcss';
import { describe, expect, it, vi } from 'vitest';
import { ServicesContext, type Services } from '../app/services';
import { Dock } from '../components/Dock';
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
const tokens = readFileSync(join(process.cwd(), 'src', 'styles', 'base', 'tokens.css'), 'utf8');
const resolve = (value: string) => value.replace(/var\((--[\w-]+)\)/, (_, name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(tokens)?.[1] ?? 'NaN');

describe('the floating dock', () => {
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

  it('shows icons only and reveals each name as a label', () => {
    mount();
    for (const name of ['Heute', 'Rückblick', 'Begleiter', 'Einstellungen']) {
      const button = screen.getByRole('button', { name: new RegExp(name) });
      expect(button.querySelector('svg')).not.toBeNull();
      expect(button.querySelector('.dock__label')?.textContent).toContain(name);
    }
  });

  it('sets the day end apart from the views, as the anchor of the day', () => {
    mount();
    const end = screen.getByRole('button', { name: contextLabels(emptyState().settings.userContext).dayEnd });
    expect(end.closest('.dock__stations')).toBeNull();
    expect(end.className).toContain('dock__item--closing');
    const css = readFileSync(join(process.cwd(), 'src', 'styles', 'components', 'dock.css'), 'utf8');
    // In the top bar it is named and softly lit, not just an icon.
    expect(css).toMatch(/\.dock__item--closing[^{]*\{[^}]*box-shadow:[^}]*accent/);
  });

  it('carries the wordmark', () => {
    mount();
    expect(document.querySelector('.dock .dock__brand')).not.toBeNull();
  });

  // The app zooms up to 200 % and the window may be 640 px high: a side dock
  // (insets + padding + 4 stations + 3 tools) must still fit in 320 CSS px.
  it('keeps every item of a side dock on screen in a short, zoomed window', () => {
    let left = Infinity;
    let right = Infinity;
    css('components/dock.css').walkAtRules('media', (m: AtRule) => {
      const max = /max-height:\s*(\d+)px/.exec(m.params);
      if (!max || Number(max[1]) < 320) return;
      const px = (sel: string, prop: string) => {
        let v = NaN;
        m.walkRules((r: Rule) => {
          if (r.selector !== sel) return;
          r.walkDecls(prop, (d) => {
            v = parseFloat(resolve(d.value));
          });
        });
        return v;
      };
      const inset = px(':root', '--dock-inset');
      // Padding, 3 stations + 3 tools, the day end, the separator and the gaps between the groups.
      const body = px('.dock', 'padding-top') * 2 + 6 * px('.dock', '--cell') + px('.dock', '--item') + 1 + 3 * px('.dock', 'row-gap');
      left = inset * 2 + body;
      right = px(":root[data-dock='right'] .dock", 'top') + inset + body;
    });
    expect(left).toBeLessThanOrEqual(320);
    expect(right).toBeLessThanOrEqual(320);
  });
});

describe('the dock position', () => {
  it('keeps a known position and falls back to the top centre for anything else', () => {
    const base = emptyState();
    const load = (dock: unknown) =>
      parseState(JSON.stringify({ ...base, settings: { ...base.settings, appearance: { ...base.settings.appearance, dock } } }))?.settings.appearance.dock;
    expect(load('bottom')).toBe('bottom');
    expect(load('right')).toBe('right');
    expect(load('left')).toBe('left');
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
    expect(frame.right).toContain('--frame-r:var(--dock-space)');
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
