// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss, { type Declaration, type Rule } from 'postcss';

/**
 * Guards the window's drag regions (desktop app): a click with a little
 * wobble must never move the window from the content. Only the header and
 * the title bar strip of full-screen views (WindowDrag) may be drag regions.
 */
const styles = fileURLToPath(new URL('../styles/', import.meta.url));
const components = fileURLToPath(new URL('../components/', import.meta.url));
const cssFiles = (function walk(d: string): string[] {
  return readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : f.endsWith('.css') ? [join(d, f)] : []));
})(styles);

const regions = (value: string) =>
  cssFiles.flatMap((file) => {
    const found: string[] = [];
    postcss.parse(readFileSync(file, 'utf8')).walkDecls('-webkit-app-region', (d: Declaration) => {
      if (d.value === value) found.push((d.parent as Rule).selector);
    });
    return found;
  });

describe('window drag regions', () => {
  it('lets only the header and the title bar strip move the window', () => {
    const drag = regions('drag').map((s) => s.replace(/\s+/g, ' '));
    expect(drag.sort()).toEqual(['html.is-desktop .topbar-wrap', 'html.is-desktop .window-drag'].sort());
  });

  it('keeps every kind of control inside the header a control', () => {
    const header = regions('no-drag').find((s) => s.includes('.topbar-wrap :is('));
    expect(header).toBeDefined();
    for (const control of ['button', 'a', 'input', 'select', 'textarea', 'label', "[role='slider']", "[role='button']", '[tabindex]']) {
      expect(header).toContain(control);
    }
  });

  it('switches the surface of the full-screen views off, also over the hidden header', () => {
    const off = regions('no-drag').join('\n');
    for (const view of ['.splash', '.onboard', '.standby', '.pause-room']) expect(off).toContain(`html.is-desktop ${view}`);
  });

  it('gives each full-screen view its title bar strip', () => {
    for (const [file, mark] of [
      ['Splash.tsx', 'className={`splash'],
      ['Onboarding.tsx', 'className={`onboard'],
      ['Standby.tsx', 'className={`standby'],
      ['HomeExtras.tsx', 'className="pause-room"'],
    ] as const) {
      const src = readFileSync(join(components, file), 'utf8');
      const view = src.indexOf(mark);
      expect(view, file).toBeGreaterThan(-1);
      // The strip is the view's first child.
      expect(src.slice(view, view + 600), file).toMatch(/>\s*<WindowDrag \/>/);
    }
  });
});
