import type { CompanionSize, LightMode, PaletteId, UiScale } from './types';

/**
 * Ambient Light 5.0: the light colours, each unmistakably its own (hue and
 * depth set them apart, so no two of them read alike), in families: deep and
 * strong tones, soft and tender ones, a rainbow, and the exclusive ones (Pro
 * or companion level 15), always together at the end. Two tones each; the
 * swatch shows their gradient. The token values for the page live in
 * styles/base/tokens.css (night and Tageslicht).
 */
export type LightFamily = 'strong' | 'soft' | 'special' | 'exclusive';

export interface LightColour {
  id: PaletteId;
  label: string;
  color: string;
  color2: string;
  family: LightFamily;
}

export const LIGHTS: ReadonlyArray<LightColour> = [
  { id: 'lime', label: 'Fokus-Lime', color: '#a3e635', color2: '#84cc16', family: 'strong' },
  { id: 'emerald', label: 'Smaragd-Wald', color: '#10d98a', color2: '#05875a', family: 'strong' },
  { id: 'cyan', label: 'Elektrisches Cyan', color: '#19e3ff', color2: '#0aa8ff', family: 'strong' },
  { id: 'cobalt', label: 'Mitternachts-Kobalt', color: '#3d5bff', color2: '#1a2bd4', family: 'strong' },
  { id: 'ruby', label: 'Tiefes Rubin', color: '#ff2d55', color2: '#b0122f', family: 'strong' },
  { id: 'amber', label: 'Warmes Bernstein', color: '#ffb000', color2: '#ff6d00', family: 'strong' },
  { id: 'mono', label: 'Reines Weiß', color: '#e6e8ee', color2: '#a7acb8', family: 'strong' },
  { id: 'blush', label: 'Soft Rose', color: '#ff8fb1', color2: '#ff6b9a', family: 'soft' },
  { id: 'sakura', label: 'Sakura-Pink', color: '#ff6be6', color2: '#e040fb', family: 'soft' },
  { id: 'peach', label: 'Pfirsich-Seide', color: '#ffb38a', color2: '#ff9466', family: 'soft' },
  { id: 'lavender', label: 'Lavendel-Nebel', color: '#8fa8ff', color2: '#6f86ff', family: 'soft' },
  { id: 'lilac', label: 'Flieder-Aura', color: '#c49cff', color2: '#a066ff', family: 'soft' },
  { id: 'rainbow', label: 'Regenbogen', color: '#ff6ec7', color2: '#6ad3ff', family: 'special' },
  { id: 'violet', label: 'Tiefes Violett', color: '#7a3cff', color2: '#4b17d6', family: 'exclusive' },
  { id: 'rose', label: 'Gedämpftes Rosé', color: '#c99aa8', color2: '#956274', family: 'exclusive' },
];

export const LIGHT_FAMILIES: ReadonlyArray<{ id: LightFamily; label: string }> = [
  { id: 'strong', label: 'Kraftvoll & tief' },
  { id: 'soft', label: 'Zart & weich' },
  { id: 'special', label: 'Besonders' },
  { id: 'exclusive', label: 'Exklusiv' },
];

export const lightLabel = (id: PaletteId) => LIGHTS.find((l) => l.id === id)?.label ?? 'Licht';

export const LIGHT_MODES: ReadonlyArray<{ id: LightMode; label: string; text: string }> = [
  { id: 'drift', label: 'Schwebende Drift', text: 'Weiche Lichtwolken wandern langsam durch den Raum.' },
  { id: 'breathe', label: 'Sanftes Atmen', text: 'Drei klare Lichter stehen still und atmen ein und aus.' },
  { id: 'aurora', label: 'Polarlichter', text: 'Leuchtende Bänder ziehen wie Nordlicht über den Himmel.' },
  { id: 'center', label: 'Fokus-Aura', text: 'Eine deutliche Aura in der Mitte, hinter deinem nächsten Schritt.' },
  { id: 'corners', label: 'Ecken-Glow', text: 'Licht sammelt sich kräftig in den Ecken, die Mitte bleibt klar.' },
];

export const COMPANION_SIZES: ReadonlyArray<{ id: CompanionSize; label: string; text: string }> = [
  { id: 'compact', label: 'Kompakt', text: 'Klein und leise am Rand' },
  { id: 'standard', label: 'Standard', text: 'So, wie er gedacht ist' },
  { id: 'large', label: 'Groß', text: 'Er bekommt mehr Raum' },
];

/** The size of the whole interface, like the display zoom of a phone. */
export const UI_SCALES: ReadonlyArray<{ id: UiScale; label: string; text: string }> = [
  { id: 0.9, label: 'Kompakt', text: '90 %, mehr auf einen Blick' },
  { id: 1, label: 'Standard', text: '100 %, wie gedacht' },
  { id: 1.1, label: 'Groß', text: '110 %, etwas mehr Ruhe' },
  { id: 1.2, label: 'Komfort', text: '120 %, groß und gelassen' },
];
