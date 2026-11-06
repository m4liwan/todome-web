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
