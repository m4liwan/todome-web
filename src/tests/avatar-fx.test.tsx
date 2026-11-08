import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Avatar } from '../components/Avatar';
import { AvatarFx, DUST_COUNT, DUST_MS, DUST_WAVES, dustWave, holoFor } from '../components/AvatarFx';
import { connectProgression } from '../app/progression';
import type { AppState } from '../domain/types';
import { createMemoryStore } from '../lib/storage';
import { emptyState } from '../state/defaults';
import { createStore } from '../state/store';
import { T0 } from '../test/helpers';

/** Turns the system's reduced-motion preference on or off for the effects monitor. */
function reducedMotion(on: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: on && query.includes('reduce'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

const fx = (level: number) => (
  <AvatarFx level={level}>
    <Avatar id="spike" size={120} holo={holoFor(level)} />
  </AvatarFx>
);

describe('companion looks by level', () => {
  beforeEach(() => reducedMotion(false));

  it('keeps the standard companion untouched below level 10', () => {
    const { container } = render(fx(9));
    expect(container.querySelector('.avatar-fx')).toBeNull();
    expect(container.querySelector('.avatar__holo')).toBeNull();
  });

  it('adds the sparkle at 10, the aura at 25 and the holofoil at 50', () => {
    const at = (level: number) => {
      const { container, unmount } = render(fx(level));
      const root = container.querySelector('.avatar-fx')!;
      const out = { tier: [...root.classList].find((c) => /^is-(sparkle|aura|shiny)$/.test(c)), aura: !!root.querySelector('.avatar-fx__aura'), holo: !!root.querySelector('.avatar__holo') };
      unmount();
      return out;
    };
    expect(at(10)).toEqual({ tier: 'is-sparkle', aura: false, holo: false });
    expect(at(25)).toEqual({ tier: 'is-aura', aura: true, holo: false });
    expect(at(50)).toEqual({ tier: 'is-shiny', aura: true, holo: true });
  });

  it('clips the holofoil to the figure with an alpha mask of the figure itself', () => {
    const { container } = render(<Avatar id="kiki" holo />);
    const holo = container.querySelector('.avatar__holo')!;
    const maskId = /url\(#(.+)\)/.exec(holo.getAttribute('mask') ?? '')![1]!;
    const mask = container.querySelector(`[id="${maskId}"]`)!;
    expect((mask as SVGElement).style.maskType).toBe('alpha');
    const figure = mask.querySelector('use')!.getAttribute('href')!.slice(1);
    expect(container.querySelector(`[id="${figure}"]`)?.closest('.avatar__body')).toBe(holo.closest('.avatar__body'));
  });
});

describe('sparkle burst', () => {
  beforeEach(() => {
    reducedMotion(false);
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('bursts eight sparks on a tap and clears them again', () => {
    const { container } = render(fx(12));
    fireEvent.pointerDown(container.querySelector('.avatar-fx')!);
    expect(container.querySelectorAll('.avatar-fx__burst > i')).toHaveLength(8);
    act(() => void vi.advanceTimersByTime(1000));
    expect(container.querySelector('.avatar-fx__burst')).toBeNull();
  });

  it('ignores rapid taps (no spark storm)', () => {
    const { container } = render(fx(12));
    const root = container.querySelector('.avatar-fx')!;
    fireEvent.pointerDown(root);
    const first = container.querySelector('.avatar-fx__burst');
    vi.advanceTimersByTime(100);
    fireEvent.pointerDown(root);
    expect(container.querySelector('.avatar-fx__burst')).toBe(first);
  });

  it('leaves no timer behind on unmount', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container, unmount } = render(fx(12));
    fireEvent.pointerDown(container.querySelector('.avatar-fx')!);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    errors.mockRestore();
  });
});

describe('performance guard', () => {
  afterEach(() => reducedMotion(false));

  it('goes calm with reduced motion: looks stay, nothing loops or bursts', () => {
    reducedMotion(true);
    const { container } = render(fx(50));
    const root = container.querySelector('.avatar-fx')!;
    expect(root.classList.contains('is-calm')).toBe(true);
    expect(root.querySelector('.avatar-fx__aura')).not.toBeNull();
    expect(root.querySelector('.avatar__holo')).not.toBeNull();
    fireEvent.pointerDown(root);
    expect(container.querySelector('.avatar-fx__burst')).toBeNull();
  });

  it('runs fully otherwise', () => {
    const { container } = render(fx(50));
    expect(container.querySelector('.avatar-fx')!.classList.contains('is-full')).toBe(true);
  });
});

describe('layered aura', () => {
  beforeEach(() => reducedMotion(false));

  it('lights three layers from level 25: a wash on the card, a halo and a core', () => {
    const { container } = render(fx(25));
    const layers = [...container.querySelectorAll('.avatar-fx__aura > i')].map((i) => i.className);
    expect(layers).toEqual(['avatar-fx__wash', 'avatar-fx__halo', 'avatar-fx__core']);
  });
});

describe('light that follows the pointer', () => {
  const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
  const box = (left: number, top: number, size: number) => ({ left, top, right: left + size, bottom: top + size, width: size, height: size, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
  const move = (clientX: number, clientY: number, pointerType = 'mouse') =>
    window.dispatchEvent(Object.assign(new MouseEvent('pointermove', { clientX, clientY }), { pointerType }));

  /** A card (0…400) with the companion (100…220, centre 160) inside. */
  function onCard(level: number) {
    const utils = render(<div className="card">{fx(level)}</div>);
    const card = utils.container.querySelector<HTMLElement>('.card')!;
    const root = utils.container.querySelector<HTMLElement>('.avatar-fx')!;
    card.getBoundingClientRect = () => box(0, 0, 400);
    root.getBoundingClientRect = () => box(100, 100, 120);
    return { ...utils, root };
  }

  beforeEach(() => reducedMotion(false));
  afterEach(() => reducedMotion(false));

  it('moves the holofoil light with the mouse over the card and lets go when it leaves', async () => {
    const { root } = onCard(50);
    move(160 + 108, 160 - 54); // right edge of the reach, half up
    await frame();
    expect(root.hasAttribute('data-lit')).toBe(true);
    expect(root.style.getPropertyValue('--fx-x')).toBe('1.000');
    expect(root.style.getPropertyValue('--fx-y')).toBe('-0.500');
    move(900, 900); // off the card
    await frame();
    expect(root.hasAttribute('data-lit')).toBe(false);
    expect(root.style.getPropertyValue('--fx-x')).toBe('');
  });

  it('ignores a finger (no hover on touch)', async () => {
    const { root } = onCard(50);
    move(200, 200, 'touch');
    await frame();
    expect(root.hasAttribute('data-lit')).toBe(false);
  });

  it('stays still in calm mode and below the aura', async () => {
    reducedMotion(true);
    const calm = onCard(50);
    move(200, 200);
    await frame();
    expect(calm.root.hasAttribute('data-lit')).toBe(false);
    calm.unmount();

    reducedMotion(false);
    const sparkle = onCard(12);
    move(200, 200);
    await frame();
    expect(sparkle.root.hasAttribute('data-lit')).toBe(false);
  });

  it('rests during a focus block', async () => {
    const { container } = render(
      <div className="shell is-focusing">
        <div className="card">{fx(50)}</div>
      </div>,
    );
    const root = container.querySelector<HTMLElement>('.avatar-fx')!;
    container.querySelector<HTMLElement>('.card')!.getBoundingClientRect = () => box(0, 0, 400);
    root.getBoundingClientRect = () => box(100, 100, 120);
    move(200, 200);
    await frame();
    expect(root.hasAttribute('data-lit')).toBe(false);
  });

  it('removes every listener and its marks on unmount', async () => {
    const added = vi.spyOn(window, 'addEventListener');
    const removed = vi.spyOn(window, 'removeEventListener');
    const { root, unmount } = onCard(50);
    move(200, 200);
    await frame();
    expect(root.hasAttribute('data-lit')).toBe(true);
    unmount();
    const types = (spy: typeof added) => spy.mock.calls.map(([type]) => type).filter((t) => t === 'pointermove' || t === 'blur');
    expect(types(removed).sort()).toEqual(types(added).sort());
    expect(root.hasAttribute('data-lit')).toBe(false);
    added.mockRestore();
    removed.mockRestore();
  });
});

describe('star dust (level 50+)', () => {
  const motes = (c: HTMLElement) => c.querySelectorAll('.avatar-fx__dust > i').length;
  const tap = (c: HTMLElement) => fireEvent.pointerDown(c.querySelector('.avatar-fx')!);

  beforeEach(() => {
    reducedMotion(false);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    reducedMotion(false);
  });

  it('rises on a tap and is gone from the DOM once it has landed', () => {
    const { container } = render(fx(50));
    tap(container);
    expect(motes(container)).toBe(DUST_COUNT);
    act(() => void vi.advanceTimersByTime(DUST_MS - 1));
    expect(motes(container)).toBe(DUST_COUNT);
    act(() => void vi.advanceTimersByTime(1));
    expect(container.querySelector('.avatar-fx__dust')).toBeNull();
  });

  it('keeps at most three waves in the air and never cuts one off', () => {
    const { container } = render(fx(50));
    for (let i = 0; i < 6; i++) {
      tap(container);
      act(() => void vi.advanceTimersByTime(400));
    }
    expect(container.querySelectorAll('.avatar-fx__dust')).toHaveLength(DUST_WAVES);
    act(() => void vi.advanceTimersByTime(DUST_MS));
    expect(container.querySelector('.avatar-fx__dust')).toBeNull();
  });

  it('rises when XP comes in, too', () => {
    const state = emptyState();
    state.tasks.t = { id: 't', status: 'planned', checklist: [] } as unknown as AppState['tasks'][string];
    const store = createStore({ storage: createMemoryStore(), key: 'k', initial: state, persistDelayMs: 0 });
    const disconnect = connectProgression(store);
    const { container } = render(fx(50));
    act(() => store.dispatch({ type: 'task/update', id: 't', patch: { status: 'done' }, at: T0 }));
    expect(motes(container)).toBe(DUST_COUNT);
    disconnect();
  });

  it('belongs to level 50: the aura only sparkles', () => {
    const { container } = render(fx(25));
    tap(container);
    expect(container.querySelector('.avatar-fx__burst')).not.toBeNull();
    expect(container.querySelector('.avatar-fx__dust')).toBeNull();
  });

  it('stays down in calm mode, when switched off and during a focus block', () => {
    reducedMotion(true);
    const calm = render(fx(50));
    tap(calm.container);
    expect(calm.container.querySelector('.avatar-fx__dust')).toBeNull();
    calm.unmount();
    reducedMotion(false);

    const off = render(
      <AvatarFx level={50} enabled={false}>
        <Avatar id="spike" />
      </AvatarFx>,
    );
    expect(off.container.querySelector('.avatar-fx')).toBeNull();
    off.unmount();

    const focus = render(<div className="shell is-focusing">{fx(50)}</div>);
    tap(focus.container);
    expect(focus.container.querySelector('.avatar-fx__dust')).toBeNull();
  });

  it('leaves no timer behind on unmount, even with dust in the air', () => {
    const { container, unmount } = render(fx(50));
    tap(container);
    act(() => void vi.advanceTimersByTime(400));
    tap(container);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('draws each wave the same way from its seed, and every mote lands in time', () => {
    expect(dustWave(7)).toEqual(dustWave(7));
    expect(dustWave(7)).not.toEqual(dustWave(8));
    for (let seed = 1; seed <= 200; seed++) {
      for (const m of dustWave(seed)) expect(m.delay + m.dur).toBeLessThan(DUST_MS);
    }
  });
});
