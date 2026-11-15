import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss, { type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';
import { AmbientLight } from '../components/AmbientLight';
import { FOCUS_STYLES } from '../components/FocusStyle';

const read = (...p: string[]) => readFileSync(join(process.cwd(), 'src', ...p), 'utf8');
const rules = (...p: string[]) => {
  const out: Rule[] = [];
  postcss.parse(read('styles', ...p)).walkRules((r: Rule) => {
    out.push(r);
  });
  return out;
};
const decl = (r: Rule, prop: string) => {
  let v: string | undefined;
  r.walkDecls(prop, (d) => {
    v = d.value;
  });
  return v;
};

describe('the ambient light', () => {
  it('is a few soft light sources and a fine grain, never in the way', () => {
    render(<AmbientLight />);
    const light = document.querySelector('.light')!;
    expect(light.getAttribute('aria-hidden')).toBe('true');
    expect(light.querySelectorAll('.light__source')).toHaveLength(3);
    expect(light.querySelector('.light__halo')).not.toBeNull();
    expect(light.querySelector('.light__grain')).not.toBeNull();
  });

  it('replaces the old veil and follows the strength setting', () => {
    expect(read('app', 'App.tsx')).toMatch(/<AmbientLight \/>/);
    expect(read('app', 'App.tsx')).not.toMatch(/className="veil"/);
    const light = rules('components', 'ambient-light.css').find((r) => r.selector === '.light')!;
    expect(decl(light, 'opacity')).toContain('var(--ambient)');
  });

  it('wanders across the whole background while nothing runs', () => {
    const drift = rules('components', 'ambient-light.css').filter((r) => /^\.light__source--[abc]$/.test(r.selector));
    expect(drift).toHaveLength(3);
    for (const r of drift) expect(decl(r, 'animation'), r.selector).toMatch(/light-drift-[abc] \d+s/);
  });

  // Peripheral movement pulls attention: during a block the wandering light
  // holds its place (paused, so it never jumps back), and so it does in calm
  // motion. Only the focus style's own halo may breathe.
  it('stands still while a block runs and in calm motion', () => {
    const still = rules('base', 'accessibility.css')
      .filter((r) => decl(r, 'animation-play-state') === 'paused')
      .flatMap((r) => r.selectors);
    expect(still).toContain('.shell.is-focusing .light__source');
    expect(still).toContain('.shell.is-fx-calm .light__source');
  });

  it('gives every focus style a light profile of its own', () => {
    const css = read('styles', 'components', 'ambient-light.css');
    for (const f of FOCUS_STYLES) expect(css, f.id).toMatch(new RegExp(`\\.shell[^{]*\\.fs-${f.id}[^{]*\\.light`));
  });
});

describe('the focus styles feel different', () => {
  const cockpit = read('styles', 'layout', 'cockpit.css');

  it('arranges the cockpit differently for every style', () => {
    for (const id of ['breathe', 'tunnel', 'cocoon', 'micro', 'pomodoro']) expect(cockpit, id).toMatch(new RegExp(`\\.fs-${id}[^{]*\\.cockpit`));
  });

  it('marks the step into a style with its own entrance', () => {
    const entrances = rules('layout', 'cockpit.css')
      .filter((r) => /\.fs-/.test(r.selector) && /cockpit__stage/.test(r.selector))
      .map((r) => decl(r, 'animation'))
      .filter(Boolean);
    expect(new Set(entrances).size).toBeGreaterThanOrEqual(3);
  });

  it('names the style for a moment when a block starts', () => {
    const app = read('app', 'App.tsx');
    expect(app).toMatch(/className="focus-cue"/);
    expect(app).toMatch(/key=\{focusStyle\}/);
  });
});
