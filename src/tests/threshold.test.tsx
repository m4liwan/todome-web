import { act, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Splash } from '../components/Splash';
import { emptyState } from '../state/defaults';

const NOW = new Date(2026, 10, 16, 9, 0).getTime();

function welcome(manual = true) {
  const s = emptyState();
  const state = { ...s, settings: { ...s.settings, onboarded: true, userName: 'Lena' } };
  const onDone = vi.fn();
  render(<Splash state={state} now={NOW} onDone={onDone} manual={manual} />);
  return { onDone };
}

describe('the mental login (a threshold)', () => {
  afterEach(() => vi.useRealTimers());

  it('greets monumentally above a slit of light, without the old neon or HUD', () => {
    welcome();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Guten Morgen, Lena.');
    expect(document.querySelector('.splash__light .splash__slit')).not.toBeNull();
    expect(document.querySelector('canvas, .electric-logo, .splash__frame, .splash__grid, .splash__hero')).toBeNull();
  });

  it('draws two hairlines in towards the way in, once the briefing has spoken', () => {
    vi.useFakeTimers();
    welcome();
    const enter = document.querySelector('.splash__enter')!;
    expect(enter.classList.contains('is-ready')).toBe(false);
    expect(enter.querySelectorAll('.splash__rail')).toHaveLength(2);
    act(() => vi.advanceTimersByTime(10_000));
    expect(enter.classList.contains('is-ready')).toBe(true);
    expect(screen.getByRole('button', { name: 'Ich bin angekommen' })).not.toBeNull();
  });

  it('is entered with Enter (or Esc) as before', () => {
    vi.useFakeTimers();
    const { onDone } = welcome();
    fireEvent.keyDown(window, { key: 'Enter' });
    act(() => vi.advanceTimersByTime(1000));
    expect(onDone).toHaveBeenCalled();
  });

  it('opens the light with transform and opacity only, in the one place for keyframes', () => {
    const css = readFileSync(join(process.cwd(), 'src', 'styles', 'base', 'animations.css'), 'utf8');
    for (const k of ['splash-slit', 'splash-glow', 'splash-rise']) expect(css, k).toContain(`@keyframes ${k}`);
  });
});
