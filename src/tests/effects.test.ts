import { createEffectsMonitor, effectsMode, LOW_BATTERY } from '../lib/effects';

/** A tiny event target with listener bookkeeping (for leak checks). */
function target<T extends object>(props: T) {
  const listeners = new Map<string, Set<() => void>>();
  return Object.assign(props, {
    addEventListener: (type: string, l: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(l);
    },
    removeEventListener: (type: string, l: () => void) => listeners.get(type)?.delete(l),
    fire: (type: string) => listeners.get(type)?.forEach((l) => l()),
    count: () => [...listeners.values()].reduce((n, s) => n + s.size, 0),
  });
}

function env(opts: { reduce?: boolean; battery?: { charging: boolean; level: number } | null } = {}) {
  const mq = target({ matches: opts.reduce ?? false });
  const battery = opts.battery === null ? null : target({ charging: true, level: 1, ...opts.battery });
  return {
    mq,
    battery,
    win: {
      matchMedia: () => mq,
      navigator: battery ? { getBattery: () => Promise.resolve(battery) } : {},
    },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('effects mode', () => {
  it('runs everything by default', () => {
    expect(effectsMode({ reducedMotion: false, battery: null })).toBe('full');
    expect(effectsMode({ reducedMotion: false, battery: { charging: false, level: 0.8 } })).toBe('full');
    expect(effectsMode({ reducedMotion: false, battery: { charging: true, level: 0.05 } })).toBe('full');
  });

  it('turns calm with reduced motion or a low battery (Windows battery saver threshold)', () => {
    expect(LOW_BATTERY).toBe(0.2);
    expect(effectsMode({ reducedMotion: true, battery: null })).toBe('calm');
    expect(effectsMode({ reducedMotion: false, battery: { charging: false, level: 0.2 } })).toBe('calm');
  });
});

describe('effects monitor', () => {
  it('follows the reduced-motion setting live', () => {
    const e = env();
    const m = createEffectsMonitor(e.win);
    const seen: string[] = [];
    const off = m.subscribe(() => seen.push(m.get()));
    expect(m.get()).toBe('full');
    e.mq.matches = true;
    e.mq.fire('change');
    expect(m.get()).toBe('calm');
    expect(seen).toEqual(['calm']);
    off();
  });

  it('calms down when the battery runs low and recovers when plugged in', async () => {
    const e = env({ battery: { charging: false, level: 0.5 } });
    const m = createEffectsMonitor(e.win);
    const off = m.subscribe(() => {});
    await flush();
    expect(m.get()).toBe('full');
    e.battery!.level = 0.15;
    e.battery!.fire('levelchange');
    expect(m.get()).toBe('calm');
    e.battery!.charging = true;
    e.battery!.fire('chargingchange');
    expect(m.get()).toBe('full');
    off();
  });

  it('removes every listener when the last subscriber leaves (no leak)', async () => {
    const e = env({ battery: { charging: false, level: 0.5 } });
    const m = createEffectsMonitor(e.win);
    const a = m.subscribe(() => {});
    const b = m.subscribe(() => {});
    await flush();
    expect(e.mq.count()).toBe(1);
    expect(e.battery!.count()).toBe(2);
    a();
    expect(e.mq.count()).toBe(1);
    b();
    expect(e.mq.count()).toBe(0);
    expect(e.battery!.count()).toBe(0);
  });

  it('never attaches battery listeners when everyone left before the battery answered', async () => {
    const e = env({ battery: { charging: false, level: 0.1 } });
    const m = createEffectsMonitor(e.win);
    m.subscribe(() => {})();
    await flush();
    expect(e.battery!.count()).toBe(0);
  });

  it('works without matchMedia or the battery API (old engines, tests)', () => {
    const m = createEffectsMonitor({ navigator: {} });
    const off = m.subscribe(() => {});
    expect(m.get()).toBe('full');
    off();
    expect(createEffectsMonitor(undefined).get()).toBe('full');
  });
});
