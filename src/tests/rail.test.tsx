import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss, { type AtRule, type Rule } from 'postcss';
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

describe('final review fixes', () => {
  it('names the day end in the header like its button, for every context', () => {
    for (const userContext of ['study', 'work', 'allround'] as const) {
      const base = emptyState();
      const state = { ...base, settings: { ...base.settings, userContext } };
      const store = createStore({ storage: createMemoryStore(), key: 'k', initial: state, persistDelayMs: 0 });
      const services = { store, announce: () => {}, mode: 'live', clock: { now: () => NOW, speed: 1 } } as unknown as Services;
      const { unmount } = render(
        <ServicesContext.Provider value={services}>
          <Topbar state={state} view="closing" onView={() => {}} onOpen={() => {}} onResume={() => {}} />
        </ServicesContext.Provider>,
      );
      expect(document.querySelector('.topbar__view')?.textContent).toBe(contextLabels(userContext).dayEnd);
      unmount();
    }
  });

  // The app zooms up to 200 % and the window may be 640 px high: the rail
  // (header 48 + padding + 3 stations + 3 tools) must still fit in 320 CSS px.
  it('keeps every rail tool on screen in a short, zoomed window', () => {
    const css = postcss.parse(readFileSync(join(process.cwd(), 'src', 'styles', 'components', 'rail.css'), 'utf8'));
    const tokens = readFileSync(join(process.cwd(), 'src', 'styles', 'base', 'tokens.css'), 'utf8');
    const resolve = (value: string) => value.replace(/var\((--[\w-]+)\)/, (_, name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(tokens)?.[1] ?? 'NaN');
    let total = Infinity;
    css.walkAtRules('media', (m: AtRule) => {
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
      const pad = px('.rail', 'padding-top') * 2;
      total = 48 + pad + 3 * px('.rail__stations', 'grid-auto-rows') + 3 * px('.rail__tools', 'grid-auto-rows');
    });
    expect(total).toBeLessThanOrEqual(320);
  });

  it('lets the ambient veil stand still while a block runs', () => {
    const css = postcss.parse(readFileSync(join(process.cwd(), 'src', 'styles', 'base', 'accessibility.css'), 'utf8'));
    const still: string[] = [];
    css.walkRules((r: Rule) => {
      r.walkDecls('animation', (d) => {
        if (d.value === 'none') still.push(...r.selectors);
      });
    });
    expect(still).toContain('.shell.is-focusing .veil');
  });
});
