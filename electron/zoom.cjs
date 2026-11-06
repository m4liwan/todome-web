'use strict';
/**
 * Page zoom for people who need larger text (accessibility). The packaged app
 * has no menu, so Chromium's zoom shortcuts would do nothing: Ctrl + Plus,
 * Ctrl + Minus and Ctrl + 0 are handled here, Ctrl + mouse wheel too, and the
 * level is remembered across restarts. Windows display scaling (125 %, 150 % …)
 * works on top of this automatically.
 */
const STEPS = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

const nearest = (factor) => STEPS.reduce((best, s) => (Math.abs(s - factor) < Math.abs(best - factor) ? s : best), 1);

/** Next zoom step for a key, or null when the key is not a zoom key. */
function zoomFor(input, current) {
  if (input.type !== 'keyDown' || !(input.control || input.meta) || input.alt) return null;
  const i = STEPS.indexOf(nearest(current));
  const key = input.key;
  if (key === '+' || key === '=' || input.code === 'NumpadAdd') return STEPS[Math.min(STEPS.length - 1, i + 1)];
  if (key === '-' || input.code === 'NumpadSubtract') return STEPS[Math.max(0, i - 1)];
  if (key === '0' || input.code === 'Numpad0') return 1;
  return null;
}

/**
 * @param {import('electron').WebContents} contents
 * @param {{ read: () => number, write: (factor: number) => void }} store
 */
function attachZoom(contents, store) {
  const apply = (factor) => {
    const f = nearest(factor);
    contents.setZoomFactor(f);
    store.write(f);
  };
  contents.on('did-finish-load', () => contents.setZoomFactor(nearest(store.read() || 1)));
  contents.on('before-input-event', (event, input) => {
    const next = zoomFor(input, contents.getZoomFactor());
    if (next === null) return;
    event.preventDefault();
    apply(next);
  });
  contents.on('zoom-changed', (_event, direction) => {
    const i = STEPS.indexOf(nearest(contents.getZoomFactor()));
    apply(STEPS[Math.max(0, Math.min(STEPS.length - 1, i + (direction === 'in' ? 1 : -1)))]);
  });
}

module.exports = { attachZoom, zoomFor, STEPS };
