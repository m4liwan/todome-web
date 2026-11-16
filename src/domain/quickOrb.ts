import { ROOM_LABELS } from './rooms';
import { LIGHTS } from './lights';
import type { AmbienceId, LayoutId, PaletteId, Settings } from './types';

/**
 * The quick-shortcut orb: 2–5 favourite switches, one click away on the home
 * screen. Each shortcut knows its name, whether it is "on" right now, and the
 * settings change it makes. Pure; the orb (components/QuickOrb) dispatches.
 */

export const MIN_ORB_ITEMS = 2;
export const MAX_ORB_ITEMS = 5;

export type ShortcutGroup = 'Licht & Look' | 'Lichtfarbe' | 'Atmosphäre' | 'Raum';

export interface QuickShortcut {
  id: string;
  label: string;
  group: ShortcutGroup;
  /** A colour dot for light colours; otherwise an icon by kind. */
  swatch?: [string, string];
  icon: 'light' | 'theme' | 'winter' | 'sound' | 'palette' | 'ambience' | 'room';
  isOn: (s: Settings) => boolean;
  patch: (s: Settings) => Partial<Settings>;
}

const AMBIENCE_LABELS: Array<[Exclude<AmbienceId, 'none'>, string]> = [
  ['hearth', 'Kaminfeuer'],
  ['rain', 'Regen'],
  ['snow', 'Schnee'],
  ['clouds', 'Wolken'],
  ['leaves', 'Herbstlaub'],
  ['live', 'Wie draußen'],
];

/** The default strength the light switch returns to when nothing else was remembered. */
const LIGHT_ON = 0.55;

export const QUICK_SHORTCUTS: ReadonlyArray<QuickShortcut> = [
  {
    id: 'light',
    label: 'Licht an / aus',
    group: 'Licht & Look',
    icon: 'light',
    isOn: (s) => s.appearance.ambient > 0,
    patch: (s) => ({ appearance: { ...s.appearance, ambient: s.appearance.ambient > 0 ? 0 : LIGHT_ON } }),
  },
  {
    id: 'theme',
    label: 'Nacht / Tageslicht',
    group: 'Licht & Look',
    icon: 'theme',
    isOn: (s) => s.theme === 'light',
    patch: (s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' }),
  },
  {
    id: 'winter',
    label: 'Winterzauber',
    group: 'Licht & Look',
    icon: 'winter',
    isOn: (s) => s.appearance.xmas === 'always',
    patch: (s) => ({ appearance: { ...s.appearance, xmas: s.appearance.xmas === 'always' ? 'off' : 'always' } }),
  },
  {
    id: 'sound',
    label: 'Klang an / aus',
    group: 'Atmosphäre',
    icon: 'sound',
    isOn: (s) => s.appearance.sound,
    patch: (s) => ({ appearance: { ...s.appearance, sound: !s.appearance.sound } }),
  },
  ...AMBIENCE_LABELS.map(
    ([id, label]): QuickShortcut => ({
      id: `ambience:${id}`,
      label,
      group: 'Atmosphäre',
      icon: 'ambience',
      isOn: (s) => s.appearance.ambience === id,
      // On: the picture and its sound together; off again: back to calm.
      patch: (s) => ({ appearance: s.appearance.ambience === id ? { ...s.appearance, ambience: 'none' } : { ...s.appearance, ambience: id, sound: true } }),
    }),
  ),
  ...LIGHTS.map(
    (l): QuickShortcut => ({
      id: `palette:${l.id}`,
      label: l.label,
      group: 'Lichtfarbe',
      icon: 'palette',
      swatch: [l.color, l.color2],
      isOn: (s) => s.appearance.palette === l.id,
      patch: (s) => ({ appearance: { ...s.appearance, palette: l.id as PaletteId } }),
    }),
  ),
  ...(Object.entries(ROOM_LABELS) as Array<[LayoutId, string]>).map(
    ([id, label]): QuickShortcut => ({
      id: `layout:${id}`,
      label: `Raum ${label}`,
      group: 'Raum',
      icon: 'room',
      isOn: (s) => s.appearance.layout === id,
      patch: (s) => ({ appearance: { ...s.appearance, layout: id } }),
    }),
  ),
];

const BY_ID = new Map(QUICK_SHORTCUTS.map((q) => [q.id, q]));
export const quickShortcut = (id: string): QuickShortcut | undefined => BY_ID.get(id);
export const isQuickShortcut = (id: string): boolean => BY_ID.has(id);
