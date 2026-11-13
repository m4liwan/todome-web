'use strict';
/**
 * Size of the mini overlay window, as pure functions (no Electron here).
 *
 * The overlay is a frameless, transparent window: Windows gives it no
 * reliable resize border, so the overlay draws its own grips in the
 * transparent margin around the glass box and reports pointer deltas.
 *
 *  - Auto size (nothing saved): the default width, exactly as tall as the
 *    content needs.
 *  - User size (saved after a resize): kept across restarts, but never
 *    narrower than the content's minimum and never shorter than the content,
 *    so nothing is squeezed or cut off.
 */

/** Transparent margin around the glass box (room for its glow and the grips). */
const MARGIN = 14;
const AVATAR = { small: 56, medium: 76, large: 100 };
/** Default window width: the classic 362 px glass box plus the margins. */
const DEFAULT_WIDTH = 362 + MARGIN * 2;
/** Smallest content there is (only the media row) plus the margins. */
const MIN_HEIGHT = 88;
const MAX = { width: 720, height: 480 };
const EDGES = new Set(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']);

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/**
 * Narrowest window that still fits the anchor row (avatar, two lines of
 * title, progress ring) and the media row (title, three buttons) side by side.
 */
function minWidth(cfg) {
  const avatar = AVATAR[(cfg && cfg.avatarSize) || 'medium'] || AVATAR.medium;
  const modules = (cfg && cfg.modules) || {};
  // Box padding 32 + ring 34 + gaps 24 + room for the title (~150).
  const row = (modules.avatar === false ? 0 : avatar) + 32 + 34 + 24 + 150;
  // Box padding 32 + media row: icon, ~80 px of title, buttons, paddings.
  const media = 32 + 18 + 8 + 80 + 8 + 94 + 14;
  return Math.max(row, media) + MARGIN * 2;
}

/** A saved user size, or null when it is missing or broken. */
function savedSize(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const width = Number(raw.width);
  const height = Number(raw.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width: Math.round(width), height: Math.round(height) };
}

/** Window height the content needs, from the box height the overlay measured. */
function contentHeight(boxHeight) {
  const h = Math.ceil(Number(boxHeight) || 0) + MARGIN * 2;
  return clamp(h, MIN_HEIGHT, MAX.height);
}

/**
 * The window size to show: the user's size if there is one, else the
 * default width; in both cases at least as tall as the content.
 */
function fitSize(cfg, user, needHeight) {
  const need = clamp(needHeight || MIN_HEIGHT, MIN_HEIGHT, MAX.height);
  const width = clamp(user ? user.width : DEFAULT_WIDTH, minWidth(cfg), MAX.width);
  const height = user ? clamp(Math.max(user.height, need), need, MAX.height) : need;
  return { width, height };
}

/**
 * New bounds while a grip is dragged. `edge` is a compass direction
 * (n, s, e, w, ne, nw, se, sw); the opposite side stays where it is.
 */
function resizeBounds(origin, edge, dx, dy, cfg, needHeight) {
  if (!EDGES.has(edge)) return null;
  const minW = minWidth(cfg);
  const minH = clamp(needHeight || MIN_HEIGHT, MIN_HEIGHT, MAX.height);
  let width = origin.width;
  let height = origin.height;
  if (edge.includes('e')) width = origin.width + dx;
  if (edge.includes('w')) width = origin.width - dx;
  if (edge.includes('s')) height = origin.height + dy;
  if (edge.includes('n')) height = origin.height - dy;
  width = Math.round(clamp(width, minW, MAX.width));
  height = Math.round(clamp(height, minH, MAX.height));
  const x = edge.includes('w') ? origin.x + origin.width - width : origin.x;
  const y = edge.includes('n') ? origin.y + origin.height - height : origin.y;
  return { x, y, width, height };
}

module.exports = { MARGIN, DEFAULT_WIDTH, MIN_HEIGHT, MAX, EDGES, minWidth, savedSize, contentHeight, fitSize, resizeBounds };
