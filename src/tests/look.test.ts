import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import postcss, { type Declaration, type Rule } from 'postcss';
import { afterEach, describe, expect, it } from 'vitest';
import { toggledAmbient, writeAmbient } from '../app/theme';

/*
 * Always dark on #050505. The ambient light strength and the corner setting
 * stay in the settings and on <html>.
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

  // "Kantig / Präzise / Weich" only works if every corner comes from --radius.
  // Pills (999px) and circles (50%) stay round; hairline radii up to 2px stay.
  it('takes every corner radius from the corner setting', () => {
    const offenders = cssFiles.flatMap((file) => {
      const found: string[] = [];
      postcss.parse(readFileSync(file, 'utf8')).walkDecls(/radius$/, (d: Declaration) => {
        if (d.prop.startsWith('--')) return;
        const raw = d.value.replace(/var\(--radius[^)]*\)/g, '');
        const fixed = [...raw.matchAll(/(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1])).filter((n) => n > 2 && n < 99);
        if (fixed.length || /var\(--rs\)|var\(--r0\)/.test(d.value)) found.push(`${(d.parent as Rule).selector} { ${d.prop}: ${d.value} }`);
      });
      return found;
    });
    expect(offenders).toEqual([]);
  });

  it('defines the hairline, float surface, corner and motion tokens', () => {
    const t = readFileSync(join(styles, 'base', 'tokens.css'), 'utf8');
    expect(t).toMatch(/--line:\s*rgba\(255,\s*255,\s*255,\s*0\.05\)/);
    expect(t).toMatch(/--bg-raised:\s*#0b0b0c/);
    expect(t).toMatch(/--ease:\s*cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\)/);
    expect(t).toMatch(/\[data-corners='precise'\][^}]*--radius:\s*6px/);
    expect(t).toMatch(/\[data-corners='sharp'\][^}]*--radius:\s*0/);
    expect(t).toMatch(/\[data-corners='soft'\][^}]*--radius:\s*10px/);
  });

  // Calm motion: only the compositor's properties move. onboard-out keeps its
  // blur (the setup's farewell; its end is awaited via animationend).
  it('animates only transform and opacity', () => {
    const allowed = new Set(['transform', 'opacity']);
    const exceptions = new Set(['onboard-out']);
    const offenders: string[] = [];
    postcss.parse(readFileSync(join(styles, 'base', 'animations.css'), 'utf8')).walkAtRules(/keyframes$/, (k) => {
      if (exceptions.has(k.params)) return;
      k.walkDecls((d) => {
        if (!allowed.has(d.prop)) offenders.push(`${k.params}: ${d.prop}`);
      });
    });
    expect(offenders).toEqual([]);
  });

  it('loads Geist and no retired fonts', () => {
    const main = readFileSync(join(process.cwd(), 'src', 'main.tsx'), 'utf8');
    expect(main).toMatch(/@fontsource-variable\/geist\//);
    expect(main).toMatch(/@fontsource-variable\/geist-mono\//);
    expect(main).not.toMatch(/manrope|urbanist/i);
  });

  it('paints the page in one deep black', () => {
    const tokens = readFileSync(join(styles, 'base', 'tokens.css'), 'utf8');
    expect(tokens).toMatch(/--bg:\s*#050505;/);
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
