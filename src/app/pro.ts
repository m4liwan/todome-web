import { useSyncExternalStore } from 'react';
import type { AppearanceSettings, AppState, AvatarId, LayoutId, PaletteId } from '../domain/types';
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
export type ProFeature = 'reports' | 'clients' | 'avatars' | 'palettes' | 'flow' | 'stats' | 'workspace';

export const PRO_AVATARS: ReadonlySet<AvatarId> = new Set<AvatarId>(['keimi', 'woody']);
export const PRO_PALETTES: ReadonlySet<PaletteId> = new Set<PaletteId>(['pulse', 'matrix']);
export const PRO_LAYOUTS: ReadonlySet<LayoutId> = new Set<LayoutId>(['flow']);

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
  workspace: {
    title: 'Workspace-Editor in Pro',
    text: 'Ordne deine Karten frei an und gib ihnen die Größe, die zu deinem Tag passt. Ziehen, ablegen, fertig. Free behält die ruhigen, sorgfältig abgestimmten Standard-Layouts.',
  },
  avatars: {
    title: 'Mehr Begleiter in Pro',
    text: 'Keimi wächst mit jedem Schritt mit dir, Woody bringt Ruhe in jeden Tag. Die beiden ziehen mit Pro bei dir ein.',
  },
  palettes: {
    title: 'Mehr Farbwelten in Pro',
    text: 'Neon Pulse und Matrix Frost: zwei ruhige Nachtwelten für späte Stunden, augenschonend und tief. Ab Level 15 deines Begleiters sind sie auch ohne Pro für dich frei.',
  },
  flow: {
    title: 'Flow & Focus in Pro',
    text: 'Deine Bereiche als sanfter Slider, Seite für Seite. Immer nur ein Gedanke auf dem Bildschirm.',
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
/** Locked night world? `themesUnlocked`: the companion reached the "Exklusive Themes" level. */
export const isProPalette = (id: PaletteId, themesUnlocked = false) => !hasPro() && !themesUnlocked && PRO_PALETTES.has(id);

/** The companion level opens some Pro features on its own (see domain/companionProgression). */
export const themesUnlocked = (state: Pick<AppState, 'progression'>) => isFeatureUnlocked(state.progression.stats, 'exclusive_themes');
export const isProLayout = (id: LayoutId) => !hasPro() && PRO_LAYOUTS.has(id);

/** Free fallbacks so a locked choice from an older version never sticks. */
export function freeAppearance(a: AppearanceSettings, pro = hasPro(), themes = false): AppearanceSettings {
  const lockedPalette = !themes && PRO_PALETTES.has(a.palette);
  if (pro || (!lockedPalette && !PRO_LAYOUTS.has(a.layout))) return a;
  return {
    ...a,
    palette: lockedPalette ? 'neon' : a.palette,
    layout: PRO_LAYOUTS.has(a.layout) ? 'hub' : a.layout,
  };
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
