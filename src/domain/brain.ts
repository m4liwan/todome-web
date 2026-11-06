import type { BrainProfile, FocusStyle, Settings } from './types';

/**
 * "Wie tickt dein Kopf am liebsten?" Four ways a mind can work, each with a
 * calm set of defaults. Nothing is a diagnosis; everything stays changeable.
 */
export interface BrainInfo {
  id: BrainProfile;
  label: string;
  /** One line in the user's words. */
  feel: string;
  /** What ToDoMe. does for it. */
  does: string[];
}

export const BRAIN_PROFILES: BrainInfo[] = [
  {
    id: 'overload',
    label: 'Overload',
    feel: 'Schnell zu viel auf einmal. Dann geht gar nichts mehr.',
    does: ['Nur ein Schritt auf dem Bildschirm', 'Stumme Benachrichtigungen, weniger Nachfragen'],
  },
  {
    id: 'adhd',
    label: 'ADHS / sprunghafte Energie',
    feel: 'Viele Ideen, wechselnde Energie, lange Blöcke sind zäh.',
    does: ['15-Minuten-Blöcke mit Bewegungspausen', 'Mikro-Schritt-Modus: Aufgaben in drei Häppchen'],
  },
  {
    id: 'procrastination',
    label: 'Aufschieben',
    feel: 'Der Anfang ist das Schwerste, Perfektion bremst.',
    does: ['80-%-Prinzip: gut genug ist fertig', 'Sanft-Modus: kleine Blöcke, viel Luft'],
  },
  {
    id: 'creative',
    label: 'Kreatives Chaos',
    feel: 'Ideen kommen, wann sie wollen. Störungen reißen raus.',
    does: ['Ein ruhiger Raum: keine Besuche während eines Blocks', 'Atmender Fokus, alles andere tritt zurück'],
  },
];

/** The settings a profile brings along (applied once when chosen). */
export function brainPatch(settings: Settings, profile: BrainProfile): Partial<Settings> {
  const focus = (focusStyle: FocusStyle) => ({ appearance: { ...settings.appearance, focusStyle } });
  switch (profile) {
    case 'overload':
      return { brain: profile, oneStep: true, systemNotifications: false, maxPromptsPerHour: 1, ...focus('cocoon') };
    case 'adhd':
      return { brain: profile, oneStep: false, focusBudgetMin: Math.min(settings.focusBudgetMin, 30), ...focus('micro') };
    case 'procrastination':
      return { brain: profile, oneStep: false, ...focus('breathe') };
    case 'creative':
      return { brain: profile, oneStep: false, companion: { ...settings.companion, visitIntervalMin: 0 }, ...focus('breathe') };
  }
}
