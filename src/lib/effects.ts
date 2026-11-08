import { useSyncExternalStore } from 'react';

/**
 * Performance guard and user switch for decorative companion effects
 * (sparkle, aura, holofoil, and later their glow in the app).
 *
 * "full": everything moves. "calm": nothing loops and nothing bursts; the
 * looks stay, but still. Calm when the system asks for reduced motion, or
 * when the battery is low and discharging (20 %, the Windows default for
 * the battery saver). "off": the user switched the effects off in the
 * settings; the plain companion everywhere. The user's choice always wins.
 * The monitor only listens while someone with effects on subscribes.
 */
export type SystemEffectsMode = 'full' | 'calm';
export type EffectsMode = SystemEffectsMode | 'off';

export const LOW_BATTERY = 0.2;

export interface BatteryReading {
  charging: boolean;
  level: number;
}

export interface PowerSignals {
  reducedMotion: boolean;
  battery: BatteryReading | null;
}

export function effectsMode(s: PowerSignals): SystemEffectsMode {
  if (s.reducedMotion) return 'calm';
  if (s.battery && !s.battery.charging && s.battery.level <= LOW_BATTERY) return 'calm';
  return 'full';
}

/* ---------- the live monitor (injected window for tests) ---------- */

interface Listenable {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}
type MediaQuery = Listenable & { matches: boolean };
type Battery = Listenable & BatteryReading;

export interface EffectsWindow {
  matchMedia?: (query: string) => MediaQuery;
  navigator?: { getBattery?: () => Promise<Battery> };
}

export interface EffectsMonitor {
  get(): SystemEffectsMode;
  subscribe(listener: () => void): () => void;
}

const REDUCED = '(prefers-reduced-motion: reduce)';

export function createEffectsMonitor(win: EffectsWindow | undefined): EffectsMonitor {
  const listeners = new Set<() => void>();
  let signals: PowerSignals = { reducedMotion: false, battery: null };
  let mode: SystemEffectsMode = 'full';
  let stop: (() => void) | null = null;

  const readMotion = (): MediaQuery | null => {
    try {
      return win?.matchMedia?.(REDUCED) ?? null;
    } catch {
      return null;
    }
  };

  const update = (patch: Partial<PowerSignals>) => {
    signals = { ...signals, ...patch };
    const next = effectsMode(signals);
    if (next === mode) return;
    mode = next;
    listeners.forEach((l) => l());
  };

  const start = () => {
    let active = true;
    const cleanups: Array<() => void> = [];

    const mq = readMotion();
    if (mq) {
      const onMotion = () => update({ reducedMotion: mq.matches });
      onMotion();
      mq.addEventListener('change', onMotion);
      cleanups.push(() => mq.removeEventListener('change', onMotion));
    }

    const getBattery = win?.navigator?.getBattery;
    if (typeof getBattery === 'function') {
      getBattery
        .call(win!.navigator)
        .then((b) => {
          if (!active) return; // everyone left while we waited
          const onBattery = () => update({ battery: { charging: b.charging, level: b.level } });
          onBattery();
          b.addEventListener('levelchange', onBattery);
          b.addEventListener('chargingchange', onBattery);
          cleanups.push(() => {
            b.removeEventListener('levelchange', onBattery);
            b.removeEventListener('chargingchange', onBattery);
          });
        })
        .catch(() => {
          /* no battery info: stay with what we know */
        });
    }

    return () => {
      active = false;
      cleanups.splice(0).forEach((c) => c());
      // Nobody listens any more: forget readings that can go stale.
      signals = { reducedMotion: false, battery: null };
      mode = 'full';
    };
  };

  return {
    get: () => (stop ? mode : effectsMode({ ...signals, reducedMotion: readMotion()?.matches ?? false })),
    subscribe(listener) {
      listeners.add(listener);
      if (!stop) stop = start();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && stop) {
          stop();
          stop = null;
        }
      };
    },
  };
}

const monitor = createEffectsMonitor(typeof window === 'undefined' ? undefined : (window as unknown as EffectsWindow));

/** The user's switch first, then what the system allows. */
export function resolveEffects(enabled: boolean, system: SystemEffectsMode): EffectsMode {
  return enabled ? system : 'off';
}

const idle = () => () => {};
const offMode = (): EffectsMode => 'off';
const fullMode = (): EffectsMode => 'full';

/**
 * Current effects mode for the setting `enabled` (appearance.companionFx);
 * re-renders when the motion preference or the battery change. Switched off,
 * it does not listen to the system at all.
 */
export function useEffectsMode(enabled = true): EffectsMode {
  return useSyncExternalStore(enabled ? monitor.subscribe : idle, enabled ? monitor.get : offMode, enabled ? fullMode : offMode);
}
