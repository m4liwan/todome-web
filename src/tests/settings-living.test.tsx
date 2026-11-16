import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ServicesContext, type Services } from '../app/services';
import { SettingsDialog } from '../components/dialogs/SettingsDialog';
import { createMemoryStore } from '../lib/storage';
import { emptyState } from '../state/defaults';
import { createStore } from '../state/store';

function open() {
  const store = createStore({ storage: createMemoryStore(), key: 'k', initial: emptyState(), persistDelayMs: 0 });
  const services = { store, announce: () => {} } as unknown as Services;
  render(
    <ServicesContext.Provider value={services}>
      <SettingsDialog open onClose={() => {}} initialTab="design" />
    </ServicesContext.Provider>,
  );
}

const panel = () => document.getElementById('settings-panel')!;
const tab = (name: string) => screen.getByRole('tab', { name, hidden: true });

describe('the living settings', () => {
  it('gives every tab an icon and the panel a large title with one line about it', () => {
    open();
    for (const t of screen.getAllByRole('tab', { hidden: true })) expect(t.querySelector('svg'), t.textContent ?? '').not.toBeNull();
    expect(panel().querySelector('.settings__title')?.textContent).toBe('Design');
    expect(panel().querySelector('.settings__lead')?.textContent).toBeTruthy();
  });

  it('floats its navigation above the content, the lens gliding to the chosen tab', () => {
    open();
    const bar = document.querySelector<HTMLElement>('.settings__bar')!;
    expect(bar.querySelector('[role="tablist"]')).not.toBeNull();
    // The bar is not part of the scrolling panel: the content runs beneath it.
    expect(panel().contains(bar)).toBe(false);
    const sheet = document.querySelector<HTMLElement>('.settings')!;
    expect(sheet.style.getPropertyValue('--tab')).toBe('2');
    fireEvent.click(tab('Daten'));
    expect(sheet.style.getPropertyValue('--tab')).toBe('5');
    expect(bar.querySelector('.settings__lens')).not.toBeNull();
  });

  it('moves the panel in the direction you travel along the bar', () => {
    open();
    fireEvent.click(tab('Daten'));
    expect(panel().dataset.dir).toBe('forward');
    fireEvent.click(tab('Allgemein'));
    expect(panel().dataset.dir).toBe('back');
  });

  it('opens out of the navigation bar, below it or above it', () => {
    const css = readFileSync(join(process.cwd(), 'src', 'styles', 'components', 'dialogs.css'), 'utf8');
    // Below the bar by default; above it when the bar sits at the bottom.
    expect(css).toMatch(/\.dialog--settings\[open\]\s*\{[^}]*inset: calc\(var\(--dock-inset\) \+ var\(--dock-size\)/);
    expect(css).toMatch(/\[data-dock='bottom'\][^{]*\.dialog--settings\[open\]/);
    expect(css).not.toMatch(/data-dock='(left|right)'/);
    expect(css).toMatch(/\.dialog--settings\[open\][^}]*animation: settings-in/);
  });
});
