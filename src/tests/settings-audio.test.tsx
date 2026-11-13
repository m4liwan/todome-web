import { act, fireEvent, render, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServicesContext, type Services } from '../app/services';
import { SettingsDialog, type SettingsTab } from '../components/dialogs/SettingsDialog';
import { createMemoryStore } from '../lib/storage';
import { emptyState } from '../state/defaults';
import { createStore, parseState } from '../state/store';

function open(tab: SettingsTab) {
  const storage = createMemoryStore();
  const store = createStore({ storage, key: 'k', initial: emptyState(), persistDelayMs: 0 });
  const services = { store, announce: () => {} } as unknown as Services;
  render(
    <ServicesContext.Provider value={services}>
      <SettingsDialog open onClose={() => {}} initialTab={tab} />
    </ServicesContext.Provider>,
  );
  return { store, storage };
}

const panel = () => document.getElementById('settings-panel')!;
const inPanel = () => within(panel());
const soundToggle = () => inPanel().queryByRole('checkbox', { name: /Hintergrundklang abspielen/, hidden: true });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('settings: the atmosphere sound lives under "Audio"', () => {
  it('"Design" keeps the picture of the atmosphere and points to Audio for the sound', () => {
    open('design');
    expect(inPanel().getByRole('radiogroup', { name: 'Atmosphäre im Hintergrund', hidden: true })).toBeTruthy();
    expect(soundToggle()).toBeNull();
    expect(inPanel().queryByRole('slider', { hidden: true })).toBeNull();
    expect(panel().textContent).toMatch(/Den Klang dazu stellst du unter Audio ein/);
  });

  it('"Audio" has the sound switch, the volume and the same atmosphere picker', () => {
    open('media');
    expect(inPanel().getByRole('heading', { name: 'Klang der Atmosphäre', hidden: true })).toBeTruthy();
    expect(inPanel().getByRole('radiogroup', { name: 'Atmosphäre (Klang und Bild)', hidden: true })).toBeTruthy();
    expect(soundToggle()).not.toBeNull();
    // Interaction sounds and the media section stay where they were.
    expect(inPanel().getByRole('heading', { name: 'Sanfte Interaktions-Klänge', hidden: true })).toBeTruthy();
  });

  it('turns the sound on, sets the volume and picks the atmosphere, all saved as before', () => {
    const { store, storage } = open('media');
    fireEvent.click(soundToggle()!);
    expect(store.getState().settings.appearance.sound).toBe(true);

    fireEvent.change(inPanel().getByRole('slider', { hidden: true }), { target: { value: '30' } });
    act(() => void vi.advanceTimersByTime(200));
    expect(store.getState().settings.appearance.soundVolume).toBe(0.3);

    fireEvent.click(inPanel().getByRole('radio', { name: 'Regen', hidden: true }));
    expect(store.getState().settings.appearance.ambience).toBe('rain');

    act(() => void vi.advanceTimersByTime(10));
    const saved = parseState(storage.get('k')!)!;
    expect(saved.settings.appearance).toMatchObject({ sound: true, soundVolume: 0.3, ambience: 'rain' });
  });

  it('both pickers show one and the same setting', () => {
    const { store } = open('media');
    fireEvent.click(inPanel().getByRole('radio', { name: 'Schnee', hidden: true }));
    fireEvent.click(inPanel().getByRole('button', { name: 'Zum Bild unter Design', hidden: true }));
    const design = inPanel().getByRole('radiogroup', { name: 'Atmosphäre im Hintergrund', hidden: true });
    expect(within(design).getByRole('radio', { name: 'Schnee', hidden: true }).getAttribute('aria-checked')).toBe('true');
    expect(store.getState().settings.appearance.ambience).toBe('snow');
  });

  it('the links switch tabs and keep the keyboard on the tab they lead to', () => {
    open('design');
    fireEvent.click(inPanel().getByRole('button', { name: 'Zum Klang', hidden: true }));
    expect(soundToggle()).not.toBeNull();
    expect(document.activeElement?.id).toBe('settings-tab-media');

    fireEvent.click(inPanel().getByRole('button', { name: 'Zum Bild unter Design', hidden: true }));
    expect(soundToggle()).toBeNull();
    expect(document.activeElement?.id).toBe('settings-tab-design');
  });
});
