import { fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isProPalette } from '../app/pro';
import { ServicesContext, type Services } from '../app/services';
import { SettingsDialog } from '../components/dialogs/SettingsDialog';
import type { PaletteId } from '../domain/types';
import { createMemoryStore } from '../lib/storage';
import { emptyState } from '../state/defaults';
import { createStore, parseState } from '../state/store';

const SOFT: Array<[PaletteId, string]> = [
  ['blush', 'Soft Rose'],
  ['lavender', 'Lavendel-Nebel'],
  ['peach', 'Pfirsich-Seide'],
  ['sakura', 'Sakura-Pink'],
  ['lilac', 'Flieder-Aura'],
];
const tokens = readFileSync(join(process.cwd(), 'src', 'styles', 'base', 'tokens.css'), 'utf8');

describe('the soft palettes', () => {
  it('colour the accents and the light in two tones, at night and in daylight', () => {
    for (const [id] of SOFT) {
      for (const sel of [`:root[data-palette='${id}']`, `:root[data-theme='light'][data-palette='${id}']`]) {
        const body = new RegExp(sel.replace(/[[\]]/g, '\\$&') + String.raw`\s*\{([^}]*)\}`).exec(tokens)?.[1] ?? '';
        expect(body, sel).toMatch(/--accent-rgb:\s*\d+ \d+ \d+;/);
        expect(body, sel).toMatch(/--accent-2-rgb:\s*\d+ \d+ \d+;/);
      }
    }
  });

  it('are offered in the settings with a gradient swatch, all free', () => {
    const store = createStore({ storage: createMemoryStore(), key: 'k', initial: emptyState(), persistDelayMs: 0 });
    render(
      <ServicesContext.Provider value={{ store, announce: () => {} } as unknown as Services}>
        <SettingsDialog open onClose={() => {}} initialTab="design" />
      </ServicesContext.Provider>,
    );
    for (const [id, label] of SOFT) {
      expect(isProPalette(id)).toBe(false);
      const option = screen.getByRole('radio', { name: new RegExp(label), hidden: true });
      expect(option.querySelector<HTMLElement>('.palette__swatch')?.style.getPropertyValue('--swatch-2')).toMatch(/^#/);
    }
    fireEvent.click(screen.getByRole('radio', { name: /Sakura-Pink/, hidden: true }));
    expect(store.getState().settings.appearance.palette).toBe('sakura');
    expect(within(document.body).queryAllByText('Flieder-Aura').length).toBeGreaterThan(0);
  });

  it('are remembered', () => {
    const base = emptyState();
    for (const [id] of SOFT) {
      const s = parseState(JSON.stringify({ ...base, settings: { ...base.settings, appearance: { ...base.settings.appearance, palette: id } } }));
      expect(s?.settings.appearance.palette).toBe(id);
    }
  });
});
