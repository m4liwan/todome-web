import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import postcss, { type Declaration, type Rule } from 'postcss';
import { afterEach, describe, expect, it } from 'vitest';
import { toggledAmbient, writeAmbient } from '../app/theme';

/*
 * OLED redesign (1.18): always dark, ambient light instead of colour worlds,
 * and one corner setting for the whole app.
 */
// jsdom gives import.meta.url an http scheme, so resolve from the project root.
const styles = join(process.cwd(), 'src', 'styles');
const cssFiles = readdirSync(styles, { recursive: true, encoding: 'utf8' })
  .filter((f) => f.endsWith('.css'))
  .map((f) => join(styles, f));

describe('design tokens', () => {
  it('has no light theme left anywhere', () => {
    const offenders = cssFiles.flatMap((file) => {
      const css = readFileSync(file, 'utf8');
      return /data-theme=['"]light['"]\]|prefers-color-scheme/.test(css) ? [file] : [];
    });
    expect(offenders).toEqual([]);
  });

  // "Kantig / Präzise / Weich" only works if every corner scales with --rs.
  // Pills (999px) and circles (50%) stay round; hairline radii up to 3px stay.
  it('scales every corner radius with the corner setting', () => {
    const offenders = cssFiles.flatMap((file) => {
      const found: string[] = [];
      postcss.parse(readFileSync(file, 'utf8')).walkDecls(/radius$/, (d: Declaration) => {
        if (d.prop.startsWith('--')) return;
        const raw = d.value.replace(/calc\([^)]*var\(--rs\)\)/g, '').replace(/var\(--radius[^)]*\)/g, '');
        const fixed = [...raw.matchAll(/(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1])).filter((n) => n > 3 && n < 99);
        if (fixed.length) found.push(`${(d.parent as Rule).selector} { ${d.prop}: ${d.value} }`);
      });
      return found;
    });
    // A 4px wide strand is a pill on purpose; the corner previews in the
    // settings show each step itself, whatever is set right now.
    expect(offenders.filter((o) => !o.startsWith('.reward-path__strand') && !o.includes('.corner-opt__shape'))).toEqual([]);
  });

  it('lets the ambient light scale every light it paints', () => {
    const tokens = readFileSync(join(styles, 'base', 'tokens.css'), 'utf8');
    for (const name of ['--bg-tint-a', '--bg-tint-b', '--tint-c', '--spot', '--halo']) {
      expect(tokens, name).toMatch(new RegExp(`${name}:[^;]*var\\(--ambient\\)`));
    }
  });
});

describe('ambient light', () => {
  afterEach(() => {
    window.localStorage.clear();
    document.documentElement.style.removeProperty('--ambient');
  });

  it('writes the strength to <html>, clamped to 0 … 1', () => {
    writeAmbient(0.4);
    expect(document.documentElement.style.getPropertyValue('--ambient')).toBe('0.4');
    writeAmbient(7);
    expect(document.documentElement.style.getPropertyValue('--ambient')).toBe('1');
  });

  it('dims to stillness and brings back the strength from before', () => {
    expect(toggledAmbient(0.8, 0.55)).toBe(0);
    expect(toggledAmbient(0, 0.55)).toBe(0.8);
  });

  it('falls back to the default when nothing was remembered', () => {
    expect(toggledAmbient(0, 0.55)).toBe(0.55);
  });
});
