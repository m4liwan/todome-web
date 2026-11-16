// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss, { type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

const controls = postcss.parse(readFileSync(join(process.cwd(), 'src', 'styles', 'components', 'controls.css'), 'utf8'));
const rule = (selector: string) => {
  let found: Rule | undefined;
  controls.walkRules((r: Rule) => {
    if (r.selector.replace(/\s+/g, ' ') === selector) found = r;
  });
  return found;
};
const decl = (r: Rule | undefined, prop: string) => {
  let v: string | undefined;
  r?.walkDecls(prop, (d) => {
    v = d.value;
  });
  return v;
};

/**
 * One soul for every button: the same corner, the same hairline, the same
 * calm reaction to the pointer and the keyboard.
 */
describe('the button system', () => {
  const base = rule('.btn, .round-btn, .icon-btn, .icon-ghost, .play-btn');

  it('shares one corner, one hairline language and one motion across every kind of button', () => {
    expect(base, 'shared base rule').toBeDefined();
    expect(decl(base, 'border-radius')).toBe('var(--radius)');
    const transition = decl(base, 'transition') ?? '';
    for (const prop of ['border-color', 'background-color', 'color', 'transform', 'box-shadow']) expect(transition, prop).toContain(prop);
    expect(decl(rule('.btn'), 'border')).toBe('1px solid var(--line-strong)');
  });

  it('answers the pointer: a brighter hairline, a sheen that passes once, a soft press', () => {
    const hover = rule(':is(.btn, .round-btn, .icon-btn, .icon-ghost, .play-btn):hover:not(:disabled)');
    expect(decl(hover, 'color')).toBe('var(--ink)');
    expect(decl(rule('.btn::after'), 'transform')).toMatch(/translateX\(-/);
    expect(decl(rule('.btn:hover:not(:disabled)::after'), 'transform')).toMatch(/translateX\(/);
    expect(decl(rule(':is(.btn, .round-btn, .icon-btn, .icon-ghost, .play-btn):active:not(:disabled)'), 'transform')).toMatch(/scale\(0\.9\d\)/);
  });

  it('shows the keyboard where it is, in the light colour', () => {
    const focus = rule(':is(.btn, .round-btn, .icon-btn, .icon-ghost, .play-btn, .chip, .link-btn):focus-visible');
    expect(decl(focus, 'box-shadow')).toContain('--accent-rgb');
  });
});
