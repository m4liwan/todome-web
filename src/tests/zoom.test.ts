// @vitest-environment node
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { attachZoom, zoomFor, STEPS } = require('../../electron/zoom.cjs');

const key = (key: string, mods: Partial<{ control: boolean; meta: boolean; alt: boolean; code: string }> = { control: true }) => ({ type: 'keyDown', key, code: '', ...mods });

describe('desktop zoom shortcuts', () => {
  it('steps through the zoom levels with Ctrl + Plus / Minus / 0', () => {
    expect(zoomFor(key('+'), 1)).toBe(1.1);
    expect(zoomFor(key('='), 1.1)).toBe(1.25);
    expect(zoomFor(key('-'), 1)).toBe(0.9);
    expect(zoomFor(key('0'), 1.75)).toBe(1);
    expect(zoomFor(key('+'), 2)).toBe(2);
    expect(zoomFor(key('-'), 0.8)).toBe(0.8);
    expect(zoomFor({ type: 'keyDown', key: '', code: 'NumpadAdd', control: true }, 1)).toBe(1.1);
  });

  it('ignores other keys and plain typing', () => {
    expect(zoomFor(key('+', {}), 1)).toBeNull();
    expect(zoomFor(key('a'), 1)).toBeNull();
    expect(zoomFor(key('+', { control: true, alt: true }), 1)).toBeNull();
    expect(zoomFor({ ...key('+'), type: 'keyUp' }, 1)).toBeNull();
  });

  it('applies, remembers and restores the level', () => {
    const handlers: Record<string, (...a: unknown[]) => void> = {};
    let factor = 1;
    let saved = 1.5;
    const contents = { on: (ev: string, fn: (...a: unknown[]) => void) => (handlers[ev] = fn), setZoomFactor: (f: number) => (factor = f), getZoomFactor: () => factor };
    attachZoom(contents, { read: () => saved, write: (f: number) => (saved = f) });
    handlers['did-finish-load']!();
    expect(factor).toBe(1.5);
    let prevented = false;
    handlers['before-input-event']!({ preventDefault: () => (prevented = true) }, key('+'));
    expect(prevented).toBe(true);
    expect([factor, saved]).toEqual([1.75, 1.75]);
    handlers['zoom-changed']!({}, 'out');
    expect(factor).toBe(1.5);
    expect(STEPS).toContain(2);
  });
});
