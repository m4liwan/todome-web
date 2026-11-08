'use strict';
/**
 * Datensafe: rotating, atomic backups of the app state as plain JSON files in
 * `<userData>/backups`. Only the main process writes here; the renderer sends
 * the serialized state (validated IPC in main.cjs).
 *
 *  - daily       one file per local day (overwritten during the day), 14 days
 *  - pre-update  right before an update installs, last 3
 *  - pre-import  right before a backup replaces the data, last 5
 *  - unreadable  data the app could not read at start (never thrown away), last 5
 *
 * Writes go to a temp file first and are renamed into place, so a crash or a
 * power cut never leaves half a backup. A snapshot identical to the newest of
 * its kind is skipped, so an app that keeps failing to start cannot rotate
 * the good copies away.
 */
const fs = require('node:fs');
const path = require('node:path');

const KEEP = Object.freeze({ daily: 14, 'pre-update': 3, 'pre-import': 5, unreadable: 5 });
const KINDS = Object.keys(KEEP);
const MAX_BYTES = 50 * 1024 * 1024;
const NAME = /^(daily|pre-update|pre-import|unreadable)-(\d{4}-\d{2}-\d{2}(?:T\d{2}-\d{2}-\d{2}-\d{3}Z)?)\.json$/;

const pad = (n) => String(n).padStart(2, '0');
const localDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * @typedef {'daily' | 'pre-update' | 'pre-import' | 'unreadable'} VaultKind
 * @typedef {{ name: string, kind: VaultKind, at: number, size: number }} VaultEntry
 */

/** @param {string} dir */
function createVault(dir) {
  const names = () => {
    try {
      return fs.readdirSync(dir).filter((f) => NAME.test(f));
    } catch {
      return [];
    }
  };
  const ofKind = (kind) =>
    names()
      .filter((f) => f.startsWith(`${kind}-`))
      .sort()
      .reverse();

  function writeAtomic(file, data) {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, data, 'utf8');
    try {
      fs.renameSync(tmp, file);
    } catch (err) {
      fs.rmSync(tmp, { force: true });
      throw err;
    }
  }

  function prune(kind) {
    for (const f of ofKind(kind).slice(KEEP[kind])) fs.rmSync(path.join(dir, f), { force: true });
  }

  return {
    dir,
    /**
     * @param {VaultKind} kind
     * @param {string} json
     * @returns {string | null} the file name, or null when nothing was written
     */
    save(kind, json, now = new Date()) {
      if (!KINDS.includes(kind) || typeof json !== 'string' || json.length === 0 || json.length > MAX_BYTES) return null;
      fs.mkdirSync(dir, { recursive: true });
      const newest = ofKind(kind)[0];
      const name = kind === 'daily' ? `daily-${localDay(now)}.json` : `${kind}-${now.toISOString().replace(/[:.]/g, '-')}.json`;
      if (newest && newest !== name) {
        try {
          if (fs.readFileSync(path.join(dir, newest), 'utf8') === json) return newest;
        } catch {
          /* unreadable old copy: write a new one */
        }
      }
      writeAtomic(path.join(dir, name), json);
      prune(kind);
      return name;
    },
    /** @returns {VaultEntry[]} newest first */
    list() {
      const out = [];
      for (const name of names()) {
        try {
          const st = fs.statSync(path.join(dir, name));
          out.push({ name, kind: /** @type {VaultKind} */ (NAME.exec(name)[1]), at: st.mtimeMs, size: st.size });
        } catch {
          /* vanished meanwhile */
        }
      }
      return out.sort((a, b) => b.at - a.at);
    },
    /** @returns {string | null} */
    read(name) {
      if (typeof name !== 'string' || !NAME.test(name)) return null;
      try {
        return fs.readFileSync(path.join(dir, name), 'utf8');
      } catch {
        return null;
      }
    },
  };
}

module.exports = { createVault, KEEP };
