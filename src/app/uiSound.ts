import { bloom, focusTone } from '../lib/chimes';
import type { AppState } from '../domain/types';

/** Plays a soft UI sound if "Sanfte Interaktions-Klänge" is on. */
export function uiSound(state: Pick<AppState, 'settings'>, kind: 'bloom' | 'focus'): void {
  if (!state.settings.uiSounds) return;
  if (kind === 'bloom') bloom();
  else focusTone();
}
