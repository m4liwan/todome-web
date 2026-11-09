'use strict';
/**
 * Local diagnostics log (`<logs>/todome.log`, e.g. %APPDATA%\ToDoMe\logs).
 *
 *  - technical lines only: lifecycle, warnings, errors with stack traces.
 *    Never task titles, notes or other content (callers pass fixed messages;
 *    renderer errors are length-limited).
 *  - rotates at 1 MB into todome.log.1, so it never grows without bound
 *  - stays on the device. It leaves only when the user ticks "Protokoll
 *    anhängen" in "Problem melden", and even then the home folder and mail
 *    addresses are replaced first (`tail`)
 *  - writing must never throw: a broken log can never break the app
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MAX_BYTES = 1_000_000;
const MAX_LINE = 4000;
const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;

/** Replaces the user's home folder and mail addresses (for anything that leaves the device). */
function redact(text, home = os.homedir()) {
  let out = String(text);
  if (home) {
    for (const variant of new Set([home, home.replace(/\\/g, '/'), home.replace(/\\/g, '\\\\')])) out = out.split(variant).join('~');
  }
  return out.replace(EMAIL, '<email>');
}

function describe(part) {
  if (part instanceof Error) return part.stack || `${part.name}: ${part.message}`;
  if (typeof part === 'string') return part;
  try {
    return JSON.stringify(part);
  } catch {
    return String(part);
  }
}

/**
 * @param {string} dir
 * @param {{ now?: () => Date, maxBytes?: number }} [opts]
 */
function createLog(dir, { now = () => new Date(), maxBytes = MAX_BYTES } = {}) {
  const file = path.join(dir, 'todome.log');
  let ready = false;

  function write(level, parts) {
    try {
      if (!ready) {
        fs.mkdirSync(dir, { recursive: true });
        ready = true;
      }
      try {
        if (fs.statSync(file).size > maxBytes) fs.renameSync(file, `${file}.1`);
      } catch {
        /* no file yet */
      }
      const text = parts.map(describe).join(' ').slice(0, MAX_LINE).replace(/\r?\n\s*/g, '\n    ');
      fs.appendFileSync(file, `${now().toISOString()} ${level.padEnd(5)} ${text}\n`, 'utf8');
    } catch {
      /* logging never breaks the app */
    }
  }

  return {
    file,
    info: (...parts) => write('INFO', parts),
    warn: (...parts) => write('WARN', parts),
    error: (...parts) => write('ERROR', parts),
    /** The last `lines` lines (both files), redacted, for "Problem melden". */
    tail(lines = 200, maxChars = 20_000) {
      let text = '';
      for (const f of [`${file}.1`, file]) {
        try {
          text += fs.readFileSync(f, 'utf8');
        } catch {
          /* missing */
        }
      }
      const out = text.split('\n').filter(Boolean).slice(-lines).join('\n');
      return redact(out.length > maxChars ? out.slice(-maxChars) : out);
    },
    /** console.warn / console.error also land in the file (keeps every existing call site). */
    captureConsole(target = console) {
      for (const level of ['warn', 'error']) {
        const original = target[level].bind(target);
        target[level] = (...parts) => {
          write(level.toUpperCase(), parts);
          original(...parts);
        };
      }
    },
  };
}

/** Crash dumps written in the last `days` days (Electron crashReporter, local only). */
function recentCrashDumps(dir, days = 7, now = Date.now()) {
  const found = [];
  const walk = (d, depth) => {
    let entries = [];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory() && depth < 2) walk(p, depth + 1);
      else if (e.isFile() && e.name.endsWith('.dmp')) {
        try {
          const at = fs.statSync(p).mtimeMs;
          if (now - at < days * 24 * 60 * 60_000) found.push(at);
        } catch {
          /* vanished */
        }
      }
    }
  };
  walk(dir, 0);
  return found.sort((a, b) => b - a);
}

module.exports = { createLog, redact, recentCrashDumps };
