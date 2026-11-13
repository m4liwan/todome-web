// @vitest-environment node
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ob = require('../../electron/overlay-bounds.cjs');

const cfg = (avatarSize: 'small' | 'medium' | 'large' = 'medium') => ({ avatarSize, modules: { avatar: true, anchor: true, progress: true, media: true } });

describe('mini overlay size', () => {
  it('is never narrower than the anchor row and the media row need, per avatar size', () => {
    expect(ob.minWidth(cfg('small'))).toBe(324);
    expect(ob.minWidth(cfg('medium'))).toBe(344);
    expect(ob.minWidth(cfg('large'))).toBe(368);
    // Without the avatar the media row sets the limit.
    expect(ob.minWidth({ avatarSize: 'large', modules: { avatar: false } })).toBe(282);
    expect(ob.DEFAULT_WIDTH).toBeGreaterThanOrEqual(ob.minWidth(cfg('large')));
  });

  it('starts at the default width and exactly the content height', () => {
    expect(ob.fitSize(cfg(), null, 176)).toEqual({ width: 390, height: 176 });
  });

  it('keeps the size the user chose, but never shorter than the content or narrower than the minimum', () => {
    expect(ob.fitSize(cfg(), { width: 600, height: 300 }, 176)).toEqual({ width: 600, height: 300 });
    expect(ob.fitSize(cfg(), { width: 600, height: 120 }, 176)).toEqual({ width: 600, height: 176 });
    expect(ob.fitSize(cfg('large'), { width: 300, height: 300 }, 176)).toEqual({ width: 368, height: 300 });
    expect(ob.fitSize(cfg(), { width: 5000, height: 5000 }, 176)).toEqual({ width: ob.MAX.width, height: ob.MAX.height });
  });

  it('reads a saved size only when it is sound', () => {
    expect(ob.savedSize({ width: 512.4, height: 240.6 })).toEqual({ width: 512, height: 241 });
    for (const bad of [null, undefined, 'big', {}, { width: 'x', height: 200 }, { width: -5, height: 200 }, { width: 400, height: Infinity }]) {
      expect(ob.savedSize(bad)).toBeNull();
    }
  });

  it('turns the measured box height into the window height the content needs', () => {
    expect(ob.contentHeight(148)).toBe(176);
    expect(ob.contentHeight(147.2)).toBe(176);
    expect(ob.contentHeight(10)).toBe(ob.MIN_HEIGHT);
    expect(ob.contentHeight(9999)).toBe(ob.MAX.height);
    expect(ob.contentHeight('nonsense')).toBe(ob.MIN_HEIGHT);
  });

  describe('dragging a grip', () => {
    const origin = { x: 100, y: 100, width: 400, height: 200 };
    const drag = (edge: string, dx: number, dy: number, need = 176) => ob.resizeBounds(origin, edge, dx, dy, cfg(), need);

    it('moves only the dragged sides; the opposite side stays put', () => {
      expect(drag('se', 50, 30)).toEqual({ x: 100, y: 100, width: 450, height: 230 });
      expect(drag('e', 50, 30)).toEqual({ x: 100, y: 100, width: 450, height: 200 });
      expect(drag('s', 50, 30)).toEqual({ x: 100, y: 100, width: 400, height: 230 });
      expect(drag('w', -40, 0)).toEqual({ x: 60, y: 100, width: 440, height: 200 });
      expect(drag('n', 0, -40)).toEqual({ x: 100, y: 60, width: 400, height: 240 });
      expect(drag('nw', -10, -20)).toEqual({ x: 90, y: 80, width: 410, height: 220 });
    });

    it('stops at the minimum width and at the content height, without the far edge jumping', () => {
      expect(drag('e', -300, 0)).toEqual({ x: 100, y: 100, width: 344, height: 200 });
      expect(drag('w', 300, 0)).toEqual({ x: 156, y: 100, width: 344, height: 200 });
      expect(drag('n', 0, 100)).toEqual({ x: 100, y: 124, width: 400, height: 176 });
      expect(drag('s', 0, -100, 230)).toEqual({ x: 100, y: 100, width: 400, height: 230 });
    });

    it('ignores anything that is not a grip', () => {
      expect(drag('center', 10, 10)).toBeNull();
      expect(drag('', 10, 10)).toBeNull();
    });
  });
});
