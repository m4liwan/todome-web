// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss, { type Rule } from 'postcss';

/**
 * Guards the modular style structure (src/styles):
 * every class block is styled by exactly one module, keyframes live in one
 * place with unique names, and index.css loads every module once.
 * This is what keeps collisions like the old ".breathe" clash from returning.
 */
const dir = fileURLToPath(new URL('../styles/', import.meta.url));
const files = (function walk(d: string): string[] {
  return readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : f.endsWith('.css') ? [join(d, f)] : []));
})(dir);
const mod = (f: string) => relative(dir, f).replace(/\\/g, '/').replace(/\.css$/, '');

/** Context classes only say where a rule applies, they never own it. */
const CONTEXT = /^(shell|is-|fs-|has-modal$|theme-fade$|lbl-)/;
const OWNERS_ANYWHERE = new Set(['is-companion', 'is-overlay', 'is-archived']);

function ownerOf(selector: string): string | null {
  for (const m of selector.split(',')[0]!.matchAll(/\.([a-zA-Z][\w-]*)/g)) {
    const c = m[1]!;
    if (CONTEXT.test(c) && !OWNERS_ANYWHERE.has(c)) continue;
    return c.split('__')[0]!.split('--')[0]!;
  }
  return null;
}

const parsed = files.map((f) => ({ file: f, module: mod(f), root: postcss.parse(readFileSync(f, 'utf8')) }));

describe('style modules', () => {
  it('index.css loads every module exactly once: tokens first, late and the accessibility layer last', () => {
    const index = readFileSync(join(dir, 'index.css'), 'utf8');
    const imports = [...index.matchAll(/@import '\.\/(.+?)\.css';/g)].map((m) => m[1]!);
    const modules = parsed.map((p) => p.module).filter((m) => m !== 'index');
    expect([...imports].sort()).toEqual([...modules].sort());
    expect(new Set(imports).size).toBe(imports.length);
    expect(imports[0]).toBe('base/tokens');
    expect(imports.slice(-2)).toEqual(['base/late', 'base/accessibility']);
  });

  it('styles every class block in exactly one module', () => {
    const owners = new Map<string, Set<string>>();
    for (const { module, root } of parsed) {
      if (module.startsWith('base/')) continue;
      root.walkRules((rule: Rule) => {
        if (rule.parent?.type === 'atrule' && /keyframes$/.test((rule.parent as postcss.AtRule).name)) return;
        const prev = rule.prev();
        if (prev?.type === 'comment' && prev.text.startsWith('order-pinned')) return;
        const block = ownerOf(rule.selector);
        if (!block) return;
        if (!owners.has(block)) owners.set(block, new Set());
        owners.get(block)!.add(module);
      });
    }
    const shared = [...owners].filter(([, m]) => m.size > 1).map(([b, m]) => `${b}: ${[...m].join(', ')}`);
    expect(shared).toEqual([]);
  });

  it('keeps all keyframes in base/animations with unique names', () => {
    const names: string[] = [];
    for (const { module, root } of parsed) {
      root.walkAtRules(/keyframes$/, (a) => {
        expect(module).toBe('base/animations');
        names.push(a.params);
      });
    }
    expect(names.length).toBeGreaterThan(50);
    expect(new Set(names).size).toBe(names.length);
  });

  it('keeps the old version files gone', () => {
    expect(files.map(mod).filter((m) => /^(app|v\d+)$/.test(m))).toEqual([]);
  });
});
