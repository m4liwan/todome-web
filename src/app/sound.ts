import { useEffect, useRef } from 'react';
import { setSoundscape, setSoundVolume, unlockSound, type SoundKind } from '../lib/soundscape';

/**
 * Plays the ambience sound for the visible atmosphere while it is switched
 * on. Volume changes glide; switching the atmosphere crossfades.
 */
export function useAmbienceSound(kind: SoundKind | null, enabled: boolean, volume: number): void {
  const vol = useRef(volume);
  vol.current = volume;

  useEffect(() => {
    setSoundscape(enabled ? kind : null, vol.current);
  }, [kind, enabled]);

  useEffect(() => {
    if (enabled) setSoundVolume(volume);
  }, [volume, enabled]);

  // Stop cleanly when the app goes away.
  useEffect(() => () => setSoundscape(null, 0), []);

  // Browsers allow audio only after the first gesture.
  useEffect(() => {
    if (!enabled) return;
    const unlock = () => unlockSound();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [enabled]);
}
