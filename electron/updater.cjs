'use strict';
/**
 * Calm auto-update (electron-updater, GitHub Releases or any provider set in
 * the release config).
 *
 *  - Only active in a signed release build: the release config bakes
 *    `app-update.yml` into resources. Local test builds have none, so the
 *    updater stays off there and the app says so plainly.
 *  - Checks 90 s after start and then every 6 hours. A found update is only
 *    announced ('available'); it downloads when the user asks for it
 *    (autoDownload off), then installs on the next quit or after the user
 *    confirms a restart. Nothing restarts on its own.
 *  - With a code-signing publisher in the build, electron-updater refuses any
 *    installer that is not signed by that same publisher.
 *  - "Automatisch suchen" can be switched off (privacy); a manual check stays.
 */
const fs = require('node:fs');
const path = require('node:path');

const FIRST_CHECK_MS = 90_000;
const EVERY_MS = 6 * 60 * 60_000;

/**
 * @typedef {'disabled' | 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'error'} UpdateStatus
 * @typedef {{ status: UpdateStatus, auto: boolean, current: string, version?: string, percent?: number, checkedAt?: number }} UpdateState
 */

/**
 * @param {{ app: import('electron').App, readAuto: () => boolean, writeAuto: (auto: boolean) => void, onChange: (state: UpdateState) => void }} opts
 */
function createUpdater({ app, readAuto, writeAuto, onChange }) {
  /** @type {UpdateState} */
  let state = { status: 'disabled', auto: readAuto(), current: app.getVersion() };
  let timer = null;
  let first = null;
  let checking = false;
  let downloading = false;
  /** @type {import('electron-updater').AppUpdater | null} */
  let updater = null;

  const set = (patch) => {
    state = { ...state, ...patch };
    onChange(state);
  };

  const configured =
    app.isPackaged && process.platform === 'win32' && fs.existsSync(path.join(process.resourcesPath, 'app-update.yml'));

  if (configured) {
    try {
      updater = require('electron-updater').autoUpdater;
    } catch (err) {
      console.error('[todome] electron-updater missing', err);
    }
  }

  if (updater) {
    // Download only on request: a found update is offered, not fetched.
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = true;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    updater.logger = {
      info: () => undefined,
      warn: (m) => console.warn('[todome:update]', m),
      error: (m) => console.error('[todome:update]', m),
      debug: () => undefined,
    };
    updater.on('checking-for-update', () => {
      if (state.status !== 'ready' && state.status !== 'downloading') set({ status: 'checking' });
    });
    updater.on('update-not-available', () => set({ status: 'none', checkedAt: Date.now(), version: undefined, percent: undefined }));
    updater.on('update-available', (info) => set({ status: 'available', version: info.version, percent: undefined, checkedAt: Date.now() }));
    updater.on('download-progress', (p) => {
      const percent = Math.round(p.percent);
      if (percent !== state.percent) set({ status: 'downloading', percent });
    });
    updater.on('update-downloaded', (info) => set({ status: 'ready', version: info.version, percent: 100 }));
    updater.on('error', (err) => {
      console.error('[todome:update]', err && err.message ? err.message : err);
      // A finished download stays ready; otherwise show a quiet "später".
      if (state.status !== 'ready') set({ status: 'error', checkedAt: Date.now() });
    });
    state = { ...state, status: 'idle' };
  }

  async function check() {
    if (!updater || checking || state.status === 'ready' || state.status === 'downloading') return state;
    checking = true;
    try {
      await updater.checkForUpdates();
    } catch {
      /* reported through the 'error' event */
    } finally {
      checking = false;
    }
    return state;
  }

  /** Downloads the update found by the last check ('available' → 'downloading' → 'ready'). */
  async function download() {
    if (!updater || downloading || state.status !== 'available') return state;
    downloading = true;
    set({ status: 'downloading', percent: 0 });
    try {
      await updater.downloadUpdate();
    } catch {
      /* reported through the 'error' event */
    } finally {
      downloading = false;
    }
    return state;
  }

  function schedule() {
    if (first) clearTimeout(first);
    if (timer) clearInterval(timer);
    first = null;
    timer = null;
    if (!updater || !state.auto) return;
    first = setTimeout(() => void check(), FIRST_CHECK_MS);
    timer = setInterval(() => void check(), EVERY_MS);
  }

  schedule();

  return {
    get state() {
      return state;
    },
    get ready() {
      return state.status === 'ready';
    },
    get available() {
      return state.status === 'available';
    },
    check,
    download,
    setAuto(auto) {
      writeAuto(auto);
      set({ auto });
      schedule();
      return state;
    },
    /** Quits and installs silently, then starts ToDoMe again. Call after the renderer saved. */
    install() {
      if (!updater || state.status !== 'ready') return false;
      updater.quitAndInstall(true, true);
      return true;
    },
    dispose() {
      if (first) clearTimeout(first);
      if (timer) clearInterval(timer);
    },
  };
}

module.exports = { createUpdater };
