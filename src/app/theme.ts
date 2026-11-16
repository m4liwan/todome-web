import { useEffect, useSyncExternalStore } from 'react';
import type { AppearanceSettings, ThemePreference } from '../domain/types';
import { desktop } from '../lib/desktop';

/** Night (OLED black) unless Tageslicht was chosen in the settings; the system never decides. */
export function resolveTheme(pref: ThemePreference): 'dark' | 'light' {
  return pref === 'light' ? 'light' : 'dark';
}

/** The theme in effect (hook form for components). */
export function useResolvedTheme(pref: ThemePreference): 'dark' | 'light' {
  return resolveTheme(pref);
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

type Look = Pick<AppearanceSettings, 'palette' | 'ambient' | 'corners' | 'dock'> & Partial<Pick<AppearanceSettings, 'lightMode' | 'companionSize' | 'uiScale'>>;

/**
 * The interface size (Settings → Design): on the desktop the window's own
 * zoom, so the whole layout scales cleanly and stays sharp; in a browser
 * (development, demo) the page zoom of the document stands in for it.
 */
export function applyUiScale(factor: number): void {
  if (desktop) desktop.setUiScale(factor as 0.9 | 1 | 1.1 | 1.2);
  else document.documentElement.style.setProperty('zoom', factor === 1 ? '' : String(factor));
}

/** Remembers the theme, light, corners and the dock side for public/boot.js (first frame, before React). */
export function rememberBoot(look: Look, theme: 'dark' | 'light' = 'dark'): void {
  try {
    window.localStorage.setItem(
      'todome:boot',
      JSON.stringify({ theme, palette: look.palette, ambient: look.ambient, corners: look.corners, dock: look.dock, light: look.lightMode ?? 'drift', buddy: look.companionSize ?? 'standard' }),
    );
  } catch {
    /* ignore */
  }
}

/** `--ambient` on <html>: every light alpha in the tokens scales with it. */
export function writeAmbient(ambient: number): void {
  document.documentElement.style.setProperty('--ambient', String(Math.min(1, Math.max(0, ambient))));
}

/**
 * Applies the look: night or Tageslicht (`data-theme`), the ambient light
 * colour (`data-palette`), its strength (`--ambient`), the corner rounding
 * (`data-corners`), the dock side (`data-dock`), how the light moves
 * (`data-light`) and the companion's size (`data-buddy`). Theme and light changes
 * fade softly; the desktop shell follows (title bar, window background).
 */
export function useApplyTheme(look: Look, pref: ThemePreference = 'dark'): void {
  const { palette, ambient, corners, dock, lightMode = 'drift', companionSize = 'standard', uiScale = 1 } = look;
  const theme = resolveTheme(pref);
  useEffect(() => rememberBoot({ palette, ambient, corners, dock, lightMode, companionSize }, theme), [palette, ambient, corners, dock, lightMode, companionSize, theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('theme-fade');
    root.setAttribute('data-theme', theme);
    desktop?.setTheme(theme);
    const id = window.setTimeout(() => root.classList.remove('theme-fade'), 700);
    return () => window.clearTimeout(id);
  }, [theme]);

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

  useEffect(() => {
    document.documentElement.setAttribute('data-dock', dock);
  }, [dock]);

  // Ambient Light 4.0: how the light moves; and how large the companion stands.
  useEffect(() => {
    document.documentElement.setAttribute('data-light', lightMode);
  }, [lightMode]);
  useEffect(() => {
    document.documentElement.setAttribute('data-buddy', companionSize);
  }, [companionSize]);
  useEffect(() => applyUiScale(uiScale), [uiScale]);
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
