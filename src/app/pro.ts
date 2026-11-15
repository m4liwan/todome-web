import { useSyncExternalStore } from 'react';
import type { AppearanceSettings, AppState, AvatarId, PaletteId } from '../domain/types';
import { DEFAULT_AVATAR } from '../domain/companion';
import { isFeatureUnlocked } from '../domain/companionProgression';

/**
 * ToDoMe Pro (paywall markers for the MVP).
 *
 * Nothing is sold yet: locked features show a small lock and open a calm
 * preview ("bald in Pro"). Everything that keeps a workday running stays free.
 * For internal testing Pro can be previewed with
 * `localStorage.setItem('todome:pro-preview', '1')` and a restart.
 */
export type ProFeature = 'reports' | 'clients' | 'avatars' | 'palettes' | 'stats';

export const PRO_AVATARS: ReadonlySet<AvatarId> = new Set<AvatarId>(['keimi', 'woody']);
export const PRO_PALETTES: ReadonlySet<PaletteId> = new Set<PaletteId>(['violet', 'rose']);
/** Where a locked light colour falls back to without Pro or level 15: the closest free one. */
const FREE_LIGHT: Partial<Record<PaletteId, PaletteId>> = { violet: 'cyan', rose: 'amber' };

export const PRO_COPY: Record<ProFeature, { title: string; text: string }> = {
  reports: {
    title: 'Zeitberichte in Pro',
    text: 'Jede Session im Detail, Tag für Tag zurückblättern und als CSV für deine Rechnungen exportieren. Deine Zeiten pro Kunde siehst du weiterhin kostenlos.',
  },
  clients: {
    title: 'Kunden anlegen in Pro',
    text: 'Lege Kunden mit Stundensatz und Rundung an, damit jede Minute beim richtigen Auftrag landet. Bereits angelegte Kunden bleiben voll nutzbar.',
  },
  stats: {
    title: 'Anti-Hustle-Statistiken in Pro',
    text: 'Statt Aufgaben zu zählen, zeigt ToDoMe. dir, was du geschützt hast: ungestörte Fokuszeit, deinen längsten ruhigen Block, geparkte Gedanken und jedes bewusste Durchatmen. Ab Level 5 deines Begleiters sind sie auch ohne Pro für dich frei.',
  },
  avatars: {
    title: 'Mehr Begleiter in Pro',
    text: 'Keimi wächst mit jedem Schritt mit dir, Woody bringt Ruhe in jeden Tag. Die beiden ziehen mit Pro bei dir ein.',
  },
  palettes: {
    title: 'Exklusive Lichtfarben in Pro',
    text: 'Tiefes Violett und gedämpftes Rosé: zwei leise Lichter für späte Stunden, augenschonend und tief. Ab Level 15 deines Begleiters sind sie auch ohne Pro für dich frei.',
  },
};

export function hasPro(): boolean {
  try {
    return window.localStorage.getItem('todome:pro-preview') === '1';
  } catch {
    return false;
  }
}

export const isProAvatar = (id: AvatarId) => !hasPro() && PRO_AVATARS.has(id);
/** Locked light colour? `themesUnlocked`: the companion reached the "Exklusive Lichtfarben" level. */
export const isProPalette = (id: PaletteId, themesUnlocked = false) => !hasPro() && !themesUnlocked && PRO_PALETTES.has(id);

/** The companion level opens some Pro features on its own (see domain/companionProgression). */
export const themesUnlocked = (state: Pick<AppState, 'progression'>) => isFeatureUnlocked(state.progression.stats, 'exclusive_themes');

/** Free fallbacks so a locked choice from an older version never sticks. */
export function freeAppearance(a: AppearanceSettings, pro = hasPro(), themes = false): AppearanceSettings {
  const lockedPalette = !themes && PRO_PALETTES.has(a.palette);
  if (pro || !lockedPalette) return a;
  return { ...a, palette: FREE_LIGHT[a.palette] ?? 'lime' };
}

export function freeState(state: AppState, pro = hasPro()): AppState {
  if (pro) return state;
  const appearance = freeAppearance(state.settings.appearance, pro, themesUnlocked(state));
  const avatar = PRO_AVATARS.has(state.settings.companion.avatar) ? DEFAULT_AVATAR : state.settings.companion.avatar;
  if (appearance === state.settings.appearance && avatar === state.settings.companion.avatar) return state;
  return { ...state, settings: { ...state.settings, appearance, companion: { ...state.settings.companion, avatar } } };
}

/* ---------- the one Pro preview dialog, openable from anywhere ---------- */

let current: ProFeature | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function openPro(feature: ProFeature) {
  current = feature;
  emit();
}
export function closePro() {
  current = null;
  emit();
}
export function useProPrompt(): ProFeature | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => null,
  );
}
