import { describe, expect, it } from 'vitest';
import { resolveAmbience } from '../components/Ambience';
import { isWinterActive } from '../components/Winter';
import { demoWeather } from '../domain/weather';
import { volumeToGain } from '../lib/soundscape';
import { T0 } from '../test/helpers';

const at = (h: number, m = 0, month = 10, day = 4) => new Date(2026, month, day, h, m).getTime();

describe('ambience volume', () => {
  it('scales the ambience volume logarithmically', () => {
    expect(volumeToGain(0)).toBe(0);
    expect(volumeToGain(0.05)).toBeLessThan(0.002);
    expect(volumeToGain(0.5)).toBeCloseTo(volumeToGain(1) / 4);
  });
});

describe('ambience', () => {
  it('follows the weather in live mode', () => {
    const w = demoWeather(T0);
    expect(resolveAmbience('none', w)).toBeNull();
    expect(resolveAmbience('snow', null)).toBe('snow');
    expect(resolveAmbience('live', null)).toBeNull();
    expect(resolveAmbience('live', { ...w, current: { ...w.current, code: 63 } })).toBe('rain');
    expect(resolveAmbience('live', { ...w, current: { ...w.current, code: 73 } })).toBe('snow');
    expect(resolveAmbience('live', { ...w, current: { ...w.current, code: 0 } })).toBeNull();
  });
});

describe('winter mode', () => {
  it('is active from 1 to 26 December only, unless set to always or off', () => {
    expect(isWinterActive('december', at(10, 0, 11, 1))).toBe(true);
    expect(isWinterActive('december', at(10, 0, 11, 26))).toBe(true);
    expect(isWinterActive('december', at(10, 0, 11, 27))).toBe(false);
    expect(isWinterActive('december', at(10, 0, 10, 30))).toBe(false);
    expect(isWinterActive('always', at(10, 0, 6, 1))).toBe(true);
    expect(isWinterActive('off', at(10, 0, 11, 24))).toBe(false);
  });
});
