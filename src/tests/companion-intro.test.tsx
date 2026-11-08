import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServicesContext, type Services } from '../app/services';
import { CompanionHub, INTRO_DELAY_MS } from '../components/CompanionHub';
import { INTRO_LEAVE_MS, introSteps } from '../components/CompanionIntro';
import { SettingsDialog } from '../components/dialogs/SettingsDialog';
import type { AppState } from '../domain/types';
import { createMemoryStore } from '../lib/storage';
import { emptyState } from '../state/defaults';
import { createStore, parseState } from '../state/store';
import { T0 } from '../test/helpers';

function fresh(seen = false, companionFx = true): AppState {
  const s = emptyState();
  s.settings = { ...s.settings, userName: 'Rocco', companionIntroSeen: seen, appearance: { ...s.settings.appearance, companionFx } };
  return s;
}

/** The hub as the app shows it: reports "seen" into a real store. */
function hub(state: AppState, ready = true) {
  const store = createStore({ storage: createMemoryStore(), key: 'k', initial: state, persistDelayMs: 0 });
  const onIntroSeen = vi.fn(() => store.dispatch({ type: 'settings/update', patch: { companionIntroSeen: true } }));
  const ui = (r: boolean) => <CompanionHub state={store.getState()} now={T0} introReady={r} onIntroSeen={onIntroSeen} />;
  const view = render(ui(ready));
  const rerender = (r = ready) => view.rerender(ui(r));
  return { store, onIntroSeen, view, rerender };
}

const dialog = () => document.querySelector('dialog.hub-intro');
const introTitle = () => document.getElementById('hub-intro-title')?.textContent;
const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

/**
 * Timers and frames our own code has pending. jsdom starts internal timers
 * of its own (e.g. on focus()); those are not ours to clean up.
 */
let pending: () => number;
function trackTimers() {
  const live = new Set<string>();
  const pairs = [
    ['setTimeout', 'clearTimeout'],
    ['requestAnimationFrame', 'cancelAnimationFrame'],
  ] as const;
  for (const [start, stop] of pairs) {
    const begin = window[start].bind(window) as (fn: (...a: unknown[]) => void, ...rest: unknown[]) => number;
    const end = window[stop].bind(window) as (id: number) => void;
    vi.spyOn(window, start).mockImplementation(((fn: (...a: unknown[]) => void, ...rest: unknown[]) => {
      // Who called: the first frame past this spy. Only jsdom's own calls are skipped.
      const frames = (new Error().stack ?? '').split('\n').slice(2);
      const caller = frames.find((l) => !/vitest|tinyspy|companion-intro\.test/.test(l)) ?? '';
      const ours = !/node_modules.jsdom/.test(caller);
      let key = '';
      const id = begin((...a: unknown[]) => {
        live.delete(key);
        fn(...a);
      }, ...rest);
      key = `${start}:${id}`;
      if (ours) live.add(key);
      return id;
    }) as never);
    vi.spyOn(window, stop).mockImplementation(((id: number) => {
      live.delete(`${start}:${id}`);
      end(id);
    }) as never);
  }
  return () => live.size;
}

beforeEach(() => {
  vi.useFakeTimers();
  pending = trackTimers();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('companion intro: data', () => {
  it('has never been seen by new users and by people updating, and a real "seen" survives', () => {
    expect(emptyState().settings.companionIntroSeen).toBe(false);
    const base = emptyState();
    const raw = (companionIntroSeen: unknown) => JSON.stringify({ ...base, settings: { ...base.settings, companionIntroSeen } });
    expect(parseState(raw(undefined))!.settings.companionIntroSeen).toBe(false);
    expect(parseState(raw('yes'))!.settings.companionIntroSeen).toBe(false);
    expect(parseState(raw(true))!.settings.companionIntroSeen).toBe(true);
  });

  it('tells three steps: welcome, relaxed XP and streaks, rewards, without any guilt', () => {
    const steps = introSteps('Spike', 'Rocco');
    expect(steps.map((s) => s.spot)).toEqual(['hero', 'stats', 'path']);
    expect(steps[0]!.text).toMatch(/^Hallo, Rocco! Ich bin Spike/);
    expect(steps[1]!.text).toMatch(/Wochenenden nie gegen dich/);
    expect(steps[1]!.text).toMatch(/XP und Level bleiben dir immer/);
    expect(steps[2]!.text).toMatch(/ab Level 5 erweiterte Statistiken, ab Level 15 exklusive Themes/);
    expect(steps.map((s) => s.text).join(' ')).not.toMatch(/verloren|verpasst|leider|schade|musst/i);
    expect(introSteps('Spike', '')[0]!.text).toMatch(/^Hallo! Ich bin Spike/);
  });
});

describe('companion intro: when it shows', () => {
  it('starts by itself on the first visit, after the hub has settled', () => {
    hub(fresh());
    expect(dialog()).toBeNull();
    wait(INTRO_DELAY_MS - 1);
    expect(dialog()).toBeNull();
    wait(1);
    expect(dialog()?.hasAttribute('open')).toBe(true);
    expect(introTitle()).toBe('Hier wachsen wir zusammen');
    expect(document.activeElement?.textContent).toBe('Weiter');
  });

  it('waits while something else asks for attention, and never comes back once seen', () => {
    const { rerender } = hub(fresh(), false);
    wait(INTRO_DELAY_MS * 3);
    expect(dialog()).toBeNull();
    rerender(true);
    wait(INTRO_DELAY_MS);
    expect(dialog()).not.toBeNull();

    document.body.innerHTML = '';
    hub(fresh(true));
    wait(INTRO_DELAY_MS * 3);
    expect(dialog()).toBeNull();
  });

  it('starts by itself only once per visit, even if saving "seen" did not stick', () => {
    const view = render(<CompanionHub state={fresh()} now={T0} introReady />);
    wait(INTRO_DELAY_MS);
    fireEvent.keyDown(dialog()!, { key: 'Escape' });
    wait(INTRO_LEAVE_MS);
    expect(dialog()).toBeNull();
    view.rerender(<CompanionHub state={fresh()} now={T0} introReady />);
    wait(INTRO_DELAY_MS * 3);
    expect(dialog()).toBeNull();
  });
});

describe('companion intro: walking through', () => {
  it('walks three steps, lights up the part it talks about and hands the keyboard back to the "?"', () => {
    const { onIntroSeen, store } = hub(fresh());
    wait(INTRO_DELAY_MS);
    const hubEl = document.querySelector('.companion-hub')!;
    const spot = () => hubEl.querySelector(':scope > .is-spot')?.className;
    expect(hubEl.classList.contains('is-touring')).toBe(true);
    expect(spot()).toMatch(/companion-hub__hero/);
    expect(screen.getByText('1 von 3')).toBeTruthy();

    press('Weiter');
    expect(introTitle()).toBe('XP und Serie, ganz entspannt');
    expect(spot()).toMatch(/companion-hub__stats/);

    fireEvent.keyDown(dialog()!, { key: 'ArrowRight' });
    expect(introTitle()).toBe('Belohnungen auf eurem Pfad');
    expect(spot()).toMatch(/companion-hub__path/);
    expect(screen.queryByRole('button', { name: 'Überspringen' })).toBeNull();

    press('Los geht’s');
    expect(onIntroSeen).toHaveBeenCalledTimes(1);
    expect(store.getState().settings.companionIntroSeen).toBe(true);
    wait(INTRO_LEAVE_MS);
    expect(dialog()).toBeNull();
    expect(hubEl.classList.contains('is-touring')).toBe(false);
    expect(hubEl.querySelector('.is-spot')).toBeNull();
    expect(document.activeElement?.classList.contains('companion-hub__help')).toBe(true);
  });

  it('counts skipping as seen, with the button or with Escape', () => {
    const first = hub(fresh());
    wait(INTRO_DELAY_MS);
    press('Überspringen');
    expect(first.onIntroSeen).toHaveBeenCalledTimes(1);
    wait(INTRO_LEAVE_MS);
    expect(dialog()).toBeNull();

    document.body.innerHTML = '';
    const second = hub(fresh());
    wait(INTRO_DELAY_MS);
    press('Weiter');
    fireEvent.keyDown(dialog()!, { key: 'Escape' });
    fireEvent(dialog()!, new Event('cancel', { cancelable: true }));
    expect(second.onIntroSeen).toHaveBeenCalledTimes(1);
    wait(INTRO_LEAVE_MS);
    expect(dialog()).toBeNull();
  });

  it('replays from the "?" at any time, without reporting "seen" twice', () => {
    const { onIntroSeen } = hub(fresh(true));
    const help = screen.getByRole('button', { name: /Was ist hier los\? Spike erklärt es dir/ });
    expect(help.getAttribute('aria-haspopup')).toBe('dialog');
    fireEvent.click(help);
    expect(introTitle()).toBe('Hier wachsen wir zusammen');
    press('Überspringen');
    wait(INTRO_LEAVE_MS);
    expect(dialog()).toBeNull();
    expect(onIntroSeen).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(help);
  });

  it('just appears and goes without fades when the effects are off', () => {
    hub(fresh(true, false));
    wait(100);
    fireEvent.click(screen.getByRole('button', { name: /Was ist hier los/ }));
    expect(dialog()?.classList.contains('is-still')).toBe(true);
    press('Überspringen');
    expect(dialog()).toBeNull();
    expect(pending()).toBe(0);
  });
});

describe('companion intro: clean-up', () => {
  it('leaves nothing behind when the tab is left mid-intro, and that does not count as seen', () => {
    const { view, onIntroSeen } = hub(fresh());
    wait(INTRO_DELAY_MS);
    press('Weiter');
    view.unmount();
    expect(dialog()).toBeNull();
    expect(pending()).toBe(0);
    expect(onIntroSeen).not.toHaveBeenCalled();
  });

  it('clears its pending start and its fade-out when the hub goes away', () => {
    const early = hub(fresh());
    wait(INTRO_DELAY_MS / 2);
    expect(pending()).toBeGreaterThan(0);
    early.view.unmount();
    expect(pending()).toBe(0);

    const late = hub(fresh());
    wait(INTRO_DELAY_MS);
    press('Überspringen');
    wait(0); // the test store saves "seen" right away
    expect(pending()).toBe(1); // only the fade-out is left
    late.view.unmount();
    expect(pending()).toBe(0);
    expect(late.onIntroSeen).toHaveBeenCalledTimes(1);
  });
});

describe('companion intro: settings', () => {
  it('replays it from the help section and switches to the companion tab', () => {
    const store = createStore({ storage: createMemoryStore(), key: 'k', initial: fresh(true), persistDelayMs: 0 });
    const services = { store } as unknown as Services;
    const onClose = vi.fn();
    const onShowCompanion = vi.fn();
    render(
      <ServicesContext.Provider value={services}>
        <SettingsDialog open onClose={onClose} onShowCompanion={onShowCompanion} />
      </ServicesContext.Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Begleiter-Intro erneut zeigen', hidden: true }));
    expect(store.getState().settings.companionIntroSeen).toBe(false);
    expect(onShowCompanion).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

