'use strict';
/**
 * Crash-loop guard for the renderer: a crashed window reloads, but after
 * `limit` crashes within `windowMs` it opens the recovery screen instead of
 * reloading forever (which would also burn CPU on a laptop in the tray).
 */
function createCrashGuard({ limit = 3, windowMs = 60_000, now = () => Date.now() } = {}) {
  const crashes = [];
  return {
    /** Records a crash. Returns 'reload' or 'recover'. */
    record() {
      const t = now();
      crashes.push(t);
      while (crashes.length && t - crashes[0] > windowMs) crashes.shift();
      return crashes.length >= limit ? 'recover' : 'reload';
    },
    reset() {
      crashes.length = 0;
    },
  };
}

module.exports = { createCrashGuard };
