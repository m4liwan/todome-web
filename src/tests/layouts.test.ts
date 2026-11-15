// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import postcss, { type AtRule, type Declaration, type Node as CssNode, type Rule } from 'postcss';

/**
 * Guards the hand-tuned home grids (hub, sanctuary). A panel whose grid-area
 * names an area the effective template does not have gets implicit tracks,
 * and the whole grid collapses into a narrow strip (happened with the
 * Tages-Anker in sanctuary: a later rule replaced the template).
 */
const shell = readFileSync(fileURLToPath(new URL('../styles/layout/shell.css', import.meta.url)), 'utf8');
const app = readFileSync(fileURLToPath(new URL('../app/App.tsx', import.meta.url)), 'utf8');
const root = postcss.parse(shell);

const inMedia = (node: Declaration) => {
  for (let p: CssNode | undefined = node.parent; p; p = p.parent) {
    if (p.type === 'atrule' && (p as AtRule).name === 'media') return true;
  }
  return false;
};

/** The template that applies on wide windows: the last one outside media queries wins. */
function effectiveAreas(layout: string): string[][] {
  let value = '';
  root.walkDecls('grid-template-areas', (d) => {
    if (!inMedia(d) && (d.parent as Rule).selector.trim() === `.home--${layout}`) value = d.value;
  });
  return [...value.matchAll(/'([^']*)'/g)].map((m) => (m[1] ?? '').trim().split(/\s+/));
}

/** grid-area of each panel (wide windows). */
function panelAreas(layout: string): Map<string, string> {
  const out = new Map<string, string>();
  root.walkDecls('grid-area', (d) => {
    if (inMedia(d)) return;
    for (const sel of (d.parent as Rule).selectors) {
      const m = sel.trim().match(new RegExp(`^\\.home--${layout} \\.panel--([a-z]+)$`));
      if (m?.[1]) out.set(m[1], d.value.trim());
    }
  });
  return out;
}

/** Standard panel orders from App.tsx: hub, sanctuary, classic. */
const orders = [...app.matchAll(/\[('greet'[^\]]*)\]/g)].map((m) => [...(m[1] ?? '').matchAll(/'([a-z]+)'/g)].map((x) => x[1] ?? ''));

describe('home layouts', () => {
  it('finds the three standard orders in App.tsx', () => {
    expect(orders).toHaveLength(3);
  });

  for (const [layout, index] of [
    ['hub', 0],
    ['sanctuary', 1],
  ] as const) {
    it(`${layout}: every panel has an area the effective template knows`, () => {
      const rows = effectiveAreas(layout);
      const names = new Set(rows.flat());
      const areas = panelAreas(layout);
      for (const id of orders[index] ?? []) {
        expect(areas.get(id), `${layout}: .panel--${id} has no grid-area`).toBeDefined();
        expect(names.has(areas.get(id) ?? ''), `${layout}: area "${areas.get(id)}" of .panel--${id} is not in the template`).toBe(true);
      }
    });

    it(`${layout}: the template is a clean grid of rectangles`, () => {
      const rows = effectiveAreas(layout);
      const width = rows[0]?.length ?? 0;
      expect(width).toBe(3);
      for (const row of rows) expect(row).toHaveLength(width);
      for (const name of new Set(rows.flat())) {
        if (name === '.') continue;
        const cells = rows.flatMap((row, r) => row.map((n, c) => (n === name ? [r, c] : null)).filter((x): x is number[] => x !== null));
        const rs = cells.map(([r]) => r ?? 0);
        const cs = cells.map(([, c]) => c ?? 0);
        const h = Math.max(...rs) - Math.min(...rs) + 1;
        const w = Math.max(...cs) - Math.min(...cs) + 1;
        expect(cells.length, `${layout}: area "${name}" is not a rectangle`).toBe(h * w);
      }
    });
  }
});
