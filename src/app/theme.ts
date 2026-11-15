import { useEffect, useSyncExternalStore } from 'react';
import type { AppearanceSettings, ThemePreference } from '../domain/types';
import { desktop } from '../lib/desktop';

/** ToDoMe is always dark (OLED redesign): kept as a function so callers stay simple. */
export function resolveTheme(_pref: ThemePreference): 'dark' {
  return 'dark';
}

/** Always dark; the hook form keeps the call sites of the former theme switch working. */
export function useResolvedTheme(_pref: ThemePreference): 'dark' {
  return 'dark';
}

/*
 * The accent of the current light colour, as JS sees it (for WebGL and canvas,
 * which cannot read CSS variables). Follows light switches: the tokens hang on
 * <html data-palette>.
 */
const ACCENT_VARS = ['--accent-2', '--accent-mesh'] as const;
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function readAccent(): string {
  if (typeof document === 'undefined') return '';
  const style = getComputedStyle(document.documentElement);
  return ACCENT_VARS.map((name) => style.getPropertyValue(name).trim()).join(' ');
}

function subscribeAccent(listener: () => void) {
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-palette'] });
  return () => observer.disconnect();
}

/** Strong accent (`--accent-2`) and light accent (`--accent-mesh`) as hex, live. */
export function useAccentColors(fallback: { strong: string; light: string }): { strong: string; light: string } {
  const [strong = '', light = ''] = useSyncExternalStore(subscribeAccent, readAccent, () => '').split(' ');
  return {
    strong: HEX.test(strong) ? strong : fallback.strong,
    light: HEX.test(light) ? light : fallback.light,
  };
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

type Look = Pick<AppearanceSettings, 'palette' | 'ambient' | 'corners'>;

/** Remembers light and corners for public/boot.js (first frame, before React). */
export function rememberBoot(look: Look): void {
  try {
    window.localStorage.setItem('todome:boot', JSON.stringify({ theme: 'dark', palette: look.palette, ambient: look.ambient, corners: look.corners }));
  } catch {
    /* ignore */
  }
}

/** `--ambient` on <html>: every light alpha in the tokens scales with it. */
export function writeAmbient(ambient: number): void {
  document.documentElement.style.setProperty('--ambient', String(Math.min(1, Math.max(0, ambient))));
}

/**
 * Applies the look: always dark, the ambient light colour (`data-palette`),
 * its strength (`--ambient`) and the corner rounding (`data-corners`). Light
 * changes fade softly; the desktop shell follows (title bar, window background).
 */
export function useApplyTheme(look: Look): void {
  const { palette, ambient, corners } = look;
  useEffect(() => rememberBoot({ palette, ambient, corners }), [palette, ambient, corners]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    desktop?.setTheme('dark');
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('theme-fade');
    root.setAttribute('data-palette', palette);
    const id = window.setTimeout(() => root.classList.remove('theme-fade'), 700);
    return () => window.clearTimeout(id);
  }, [palette]);

  useEffect(() => writeAmbient(ambient), [ambient]);

  useEffect(() => {
    document.documentElement.setAttribute('data-corners', corners);
  }, [corners]);
}

const LAST_LIGHT = 'todome:ambient:last';

/**
 * The header's light switch: dims to absolute stillness (0) and brings back
 * the strength from before (remembered on this device), or the default.
 */
export function toggledAmbient(current: number, fallback: number): number {
  try {
    if (current > 0) {
      window.localStorage.setItem(LAST_LIGHT, String(current));
      return 0;
    }
    const last = Number(window.localStorage.getItem(LAST_LIGHT));
    return Number.isFinite(last) && last > 0 && last <= 1 ? last : fallback;
  } catch {
    return current > 0 ? 0 : fallback;
  }
}
