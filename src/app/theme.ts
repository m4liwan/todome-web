import { useEffect, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import type { PaletteId, ThemePreference } from '../domain/types';
import { desktop } from '../lib/desktop';

const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function subscribeSystem(listener: () => void) {
  media?.addEventListener('change', listener);
  return () => media?.removeEventListener('change', listener);
}

export function systemPrefersDark(): boolean {
  return media?.matches ?? false;
}

export function resolveTheme(pref: ThemePreference): 'light' | 'dark' {
  if (pref === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return pref;
}

/** Resolved theme that also follows OS changes while on "system". */
export function useResolvedTheme(pref: ThemePreference): 'light' | 'dark' {
  const systemDark = useSyncExternalStore(subscribeSystem, systemPrefersDark, () => false);
  return pref === 'system' ? (systemDark ? 'dark' : 'light') : pref;
}

/*
 * The accent of the current colour world, as JS sees it (for WebGL and canvas,
 * which cannot read CSS variables). Follows palette and theme switches: the
 * tokens hang on <html data-palette / data-theme> and the system colour scheme.
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
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-palette', 'data-theme'] });
  media?.addEventListener('change', listener);
  return () => {
    observer.disconnect();
    media?.removeEventListener('change', listener);
  };
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

/** Remembers theme and colour world for public/boot.js (first frame, before React). */
export function rememberBoot(theme: ThemePreference, palette: PaletteId): void {
  try {
    window.localStorage.setItem('todome:boot', JSON.stringify({ theme, palette }));
  } catch {
    /* ignore */
  }
}

function writeTheme(pref: ThemePreference) {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
}

/**
 * Applies the theme: `data-theme` for explicit choices (CSS tokens follow),
 * nothing for "system" (prefers-color-scheme decides). The desktop shell
 * follows (title bar, window background).
 */
export function useApplyTheme(pref: ThemePreference, palette: PaletteId): void {
  useEffect(() => rememberBoot(pref, palette), [pref, palette]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('theme-fade');
    writeTheme(pref);
    desktop?.setTheme(pref);
    const id = window.setTimeout(() => root.classList.remove('theme-fade'), 700);
    return () => window.clearTimeout(id);
  }, [pref]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('theme-fade');
    root.setAttribute('data-palette', palette);
    const id = window.setTimeout(() => root.classList.remove('theme-fade'), 700);
    return () => window.clearTimeout(id);
  }, [palette]);
}

type ViewTransitionDoc = Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> } };

/**
 * Warm theme switch: the new theme grows as a soft circle out of the button
 * (View Transitions API), like light being switched on or dimmed. Falls back
 * to a calm cross-fade where unsupported or when reduced motion is set.
 */
export function switchTheme(next: ThemePreference, apply: () => void, origin?: { x: number; y: number }): void {
  const doc = document as ViewTransitionDoc;
  const commit = () => {
    flushSync(apply);
    writeTheme(next);
  };
  if (!doc.startViewTransition || prefersReducedMotion()) {
    document.documentElement.classList.add('theme-fade');
    commit();
    window.setTimeout(() => document.documentElement.classList.remove('theme-fade'), 700);
    return;
  }
  const x = origin?.x ?? window.innerWidth - 120;
  const y = origin?.y ?? 40;
  const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  document.documentElement.classList.add('is-theme-switching');
  const t = doc.startViewTransition(commit);
  t.ready
    .then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 1100, easing: 'cubic-bezier(0.22, 0.8, 0.24, 1)', pseudoElement: '::view-transition-new(root)' },
      );
    })
    .catch(() => undefined);
  t.finished.finally(() => document.documentElement.classList.remove('is-theme-switching')).catch(() => undefined);
}
