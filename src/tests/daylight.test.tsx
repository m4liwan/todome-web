import { fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import postcss, { type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';
import { ServicesContext, type Services } from '../app/services';
import { resolveTheme, useApplyTheme } from '../app/theme';
import { SettingsDialog } from '../components/dialogs/SettingsDialog';
import { createMemoryStore } from '../lib/storage';
import { DEFAULT_APPEARANCE, emptyState } from '../state/defaults';
import { createStore, parseState } from '../state/store';

const styles = join(process.cwd(), 'src', 'styles');
const cssFiles = (function walk(d: string): string[] {
  return readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : f.endsWith('.css') ? [join(d, f)] : []));
})(styles);
const tokens = readFileSync(join(styles, 'base', 'tokens.css'), 'utf8');

describe('Tageslicht (the light theme)', () => {
  it('is warm alabaster paper with anthracite type and dark hairlines', () => {
    const day = /:root\[data-theme='light'\]\s*\{([^}]*)\}/.exec(tokens)?.[1] ?? '';
    expect(day).toMatch(/--bg:\s*#f6f5f0;/i);
    expect(day).toMatch(/--ink:\s*#141414;/i);
    expect(day).toMatch(/--line:\s*rgba\(0,\s*0,\s*0,\s*0\.08\);/);
    expect(day).toMatch(/color-scheme:\s*light/);
  });

  it('lives in the tokens only: no component paints its own black or white', () => {
    const offenders: string[] = [];
    for (const file of cssFiles) {
      if (file.endsWith('tokens.css')) continue;
      postcss.parse(readFileSync(file, 'utf8')).walkDecls((d) => {
        // Masks are alpha, not colour; the theme previews show both themes as they are.
        if (d.prop.startsWith('mask') || (d.parent as Rule).selector?.includes('theme-opt__preview')) return;
        if (/rgba?\(255,?\s*255,?\s*255|rgb\(5 5 5|#fff\b|#ffffff|#050505|rgb\(0 0 0 \/ 0\.[1-9]/i.test(d.value)) offenders.push(`${file.split(sep).slice(-2).join('/')}: ${(d.parent as Rule).selector} { ${d.prop} }`);
      });
      if (/data-theme=['"]light|prefers-color-scheme/.test(readFileSync(file, 'utf8'))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('is remembered; anything else loads as the night', () => {
    const base = emptyState();
    const load = (theme: unknown) => parseState(JSON.stringify({ ...base, settings: { ...base.settings, theme } }))?.settings.theme;
    expect(load('light')).toBe('light');
    expect(load('dark')).toBe('dark');
    expect(load('system')).toBe('dark');
    expect(load(undefined)).toBe('dark');
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('is applied to the page by the theme hook', () => {
    const { rerender } = renderHook(({ theme }) => useApplyTheme(DEFAULT_APPEARANCE, theme), { initialProps: { theme: 'light' as 'light' | 'dark' } });
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    rerender({ theme: 'dark' });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('is switched in the settings only, as a quiet choice between night and day', () => {
    const store = createStore({ storage: createMemoryStore(), key: 'k', initial: emptyState(), persistDelayMs: 0 });
    render(
      <ServicesContext.Provider value={{ store, announce: () => {} } as unknown as Services}>
        <SettingsDialog open onClose={() => {}} initialTab="design" />
      </ServicesContext.Provider>,
    );
    const group = screen.getByRole('radiogroup', { name: 'Erscheinungsbild', hidden: true });
    expect(within(group).getAllByRole('radio', { hidden: true }).map((r) => r.querySelector('strong')?.textContent)).toEqual(['Nacht', 'Tageslicht']);
    fireEvent.click(within(group).getByRole('radio', { name: /Tageslicht/, hidden: true }));
    expect(store.getState().settings.theme).toBe('light');
  });
});
