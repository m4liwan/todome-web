'use strict';
/**
 * ToDoMe desktop shell (Electron main process).
 *
 *  - serves the built app from a private `app://todome` origin with a strict CSP
 *  - minimize → tray (keeps running), close (X) → quit
 *  - companion: a transparent, always-on-top window at the screen edge
 *  - validated IPC: idle state, focus, tray status, theme, autostart, companion
 *  - forwards sleep/resume so running sessions don't count sleep as work
 *  - calm auto-update for signed release builds (electron/updater.cjs)
 */
const {
  app,
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  crashReporter,
  globalShortcut,
  ipcMain,
  nativeImage,
  nativeTheme,
  net,
  powerMonitor,
  protocol,
  screen,
  session,
  shell,
} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createMediaBridge } = require('./media.cjs');
const { createUpdater } = require('./updater.cjs');
const { attachZoom } = require('./zoom.cjs');
const { createContact } = require('./contact.cjs');
const { createVault } = require('./vault.cjs');
const { createCrashGuard } = require('./crash-guard.cjs');
const { createLog, recentCrashDumps } = require('./log.cjs');

// Diagnostics first, so even an early failure leaves a trace. All of it stays
// on this device: crash dumps are never uploaded, the log leaves only with
// "Protokoll anhängen" in "Problem melden" (electron/log.cjs).
const log = createLog(path.join(app.getPath('userData'), 'logs'));
log.captureConsole();
try {
  crashReporter.start({ uploadToServer: false, compress: true });
} catch (err) {
  console.warn('[todome] crash reporter unavailable', err);
}
process.on('uncaughtException', (err) => log.error('[main] uncaught exception', err));
process.on('unhandledRejection', (reason) => log.error('[main] unhandled rejection', reason));

/** What "Problem melden" may attach: versions, recent crashes, the redacted log tail. */
function diagnosticsReport(lines = 200, maxChars = 20_000) {
  const crashes = recentCrashDumps(app.getPath('crashDumps'));
  const head = [
    `ToDoMe ${app.getVersion()} · Electron ${process.versions.electron} · ${process.platform} ${process.getSystemVersion?.() ?? ''} ${process.arch}`,
    `Paket: ${app.isPackaged ? 'installiert' : 'Entwicklung'} · Laufzeit: ${Math.round(process.uptime() / 60)} min · Abstürze (7 Tage): ${crashes.length}`,
    `Update: ${updates ? updates.state.status : 'aus'}`,
  ].join('\n');
  return `${head}\n---\n${log.tail(lines, maxChars)}`;
}

let media = null;
let revealMainWindow = null;
/** @type {ReturnType<typeof createUpdater> | null} */ let updates = null;
/** Set while an update waits for the renderer to save before installing. */
let pendingInstall = null;
/** @type {ReturnType<typeof createVault> | null} */ let vaultStore = null;
/** Rotating state backups in <userData>/backups (electron/vault.cjs). */
const vault = () => vaultStore || (vaultStore = createVault(path.join(app.getPath('userData'), 'backups')));
const crashGuard = createCrashGuard();

const APP_ID = 'de.konturia.todome';
const SCHEME = 'app';
const HOST = 'todome';
const APP_ORIGIN = `${SCHEME}://${HOST}`;
const DEV_URL = !app.isPackaged ? process.env.VITE_DEV_SERVER_URL || null : null;
const DIST_DIR = path.join(__dirname, '..', 'dist');
const ASSETS_DIR = path.join(__dirname, 'assets');
const START_HIDDEN = process.argv.includes('--hidden');

// Generous transparent canvas: the bubble is bottom-anchored and never cut off;
// empty areas let clicks through to the desktop.
const COMPANION_SIZE = { width: 480, height: 600 };
const COMPANION_MARGIN = 4;

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
  // Weather and place search (Open-Meteo, no key, only coordinates are sent).
  // PostHog event ingestion.
  "connect-src 'self' https://api.open-meteo.com https://geocoding-api.open-meteo.com https://eu.i.posthog.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

if (process.platform === 'win32') app.setAppUserModelId(APP_ID);
app.commandLine.appendSwitch('lang', 'de-DE');

/** @type {BrowserWindow | null} */ let win = null;
/** @type {BrowserWindow | null} */ let companion = null;
/** @type {BrowserWindow | null} */ let overlay = null;
let overlayReady = false;
let overlayConfig = null;
let overlayState = null;
/** @type {Tray | null} */ let tray = null;
let companionReady = false;
let pendingCompanion = null;
let quitting = false;
let flushedBeforeQuit = false;
let lastSuspendAt = null;

// ---------------------------------------------------------------------------
// Persisted shell state (window bounds, one-time hints, theme)
// ---------------------------------------------------------------------------
const stateFile = () => path.join(app.getPath('userData'), 'shell-state.json');

function readShellState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
  } catch {
    return {};
  }
}

function writeShellState(patch) {
  try {
    fs.writeFileSync(stateFile(), JSON.stringify({ ...readShellState(), ...patch }, null, 2));
  } catch (err) {
    console.error('[todome] could not persist shell state', err);
  }
}

function restoredBounds() {
  const saved = readShellState().bounds;
  const fallback = { width: 1440, height: 940 };
  if (!saved || typeof saved.width !== 'number') return fallback;
  const visible = screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return saved.x < a.x + a.width - 80 && saved.x + saved.width > a.x + 80 && saved.y >= a.y - 20 && saved.y < a.y + a.height - 80;
  });
  return visible ? saved : { width: saved.width, height: saved.height };
}

/** Neutral app background (light). Matches --bg in base/tokens.css. */
const APP_BG_LIGHT = '#edf0f4';
const APP_BG_DARK = '#0b0c10';
const COLOR_RE = /^(#[0-9a-f]{6}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*[\d.]+\s*)?\))$/i;
/**
 * Window background before the first paint: the exact page colour the app
 * reported last time (theme and palette), else the neutral app background.
 * Never white, so nothing flashes while the window appears.
 */
const windowBackground = () => {
  const saved = readShellState().windowBg;
  const dark = nativeTheme.shouldUseDarkColors;
  if (saved && typeof saved === 'object' && COLOR_RE.test(String(saved[dark ? 'dark' : 'light'] || ''))) return toHex(saved[dark ? 'dark' : 'light']);
  return dark ? APP_BG_DARK : APP_BG_LIGHT;
};
/** rgb()/rgba() → #rrggbb (opaque: a window background has no alpha). */
function toHex(color) {
  const c = String(color).trim();
  if (c.startsWith('#')) return c.toLowerCase();
  const [r, g, b] = (c.match(/\d{1,3}/g) || []).slice(0, 3).map((n) => Math.min(255, Number(n)));
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}
// The app draws its own glass header; the OS only paints the window buttons,
// on a transparent band, so title bar and content change colour together.
const TITLEBAR_HEIGHT = 36;
const titleBarOverlay = () => ({
  color: '#00000000',
  symbolColor: nativeTheme.shouldUseDarkColors ? '#e9ebf0' : '#1b1e25',
  height: TITLEBAR_HEIGHT,
});
const SUPPORTS_OVERLAY = process.platform === 'win32' || process.platform === 'linux';

// ---------------------------------------------------------------------------
// app:// protocol
// ---------------------------------------------------------------------------
function registerAppProtocol() {
  protocol.handle(SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      if (url.host !== HOST) return new Response('Not found', { status: 404 });
      const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const file = path.normalize(path.join(DIST_DIR, rel));
      if (file !== DIST_DIR && !file.startsWith(DIST_DIR + path.sep)) return new Response('Forbidden', { status: 403 });
      const res = await net.fetch(pathToFileURL(file).toString());
      return new Response(res.body, {
        status: 200,
        headers: {
          'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
          'Content-Security-Policy': CSP,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-cache',
        },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

// ---------------------------------------------------------------------------
// Security helpers
// ---------------------------------------------------------------------------
/**
 * Development only (`npm run dev`, never in the installed app): the DevTools
 * open in their own window, and F12 or Ctrl+Shift+I toggles them.
 * TODOME_DEVTOOLS=0 keeps them closed at the start.
 */
function attachDevTools(target) {
  if (process.env.TODOME_DEVTOOLS !== '0') target.webContents.once('did-finish-load', () => target.webContents.openDevTools({ mode: 'detach' }));
  target.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const toggle = input.key === 'F12' || ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i');
    if (!toggle) return;
    event.preventDefault();
    target.webContents.toggleDevTools();
  });
}

const appUrl = (hash = '') => (DEV_URL ? DEV_URL : `${APP_ORIGIN}/index.html`) + hash;

function isTrustedUrl(raw) {
  try {
    const url = new URL(raw);
    // Node reports origin "null" for custom schemes, so compare scheme and host.
    if (url.protocol === `${SCHEME}:` && url.host === HOST) return true;
    return Boolean(DEV_URL) && url.origin === new URL(DEV_URL).origin;
  } catch {
    return false;
  }
}

const fromApp = (event) => Boolean(win) && event.sender === win.webContents && isTrustedUrl(event.senderFrame?.url ?? '');
const fromCompanion = (event) =>
  Boolean(companion) && event.sender === companion.webContents && isTrustedUrl(event.senderFrame?.url ?? '');

function hardenContents(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (isTrustedUrl(url)) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
  });
}

const secureWebPreferences = {
  preload: path.join(__dirname, 'preload.cjs'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
  // Check-ins are scheduled in the renderer: never throttle timers in the tray.
  backgroundThrottling: false,
};

// ---------------------------------------------------------------------------
// Main window
// ---------------------------------------------------------------------------
function showWindow() {
  if (!win) {
    createWindow(false);
    return;
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  win.flashFrame(false);
}

function hideToTray() {
  if (!win) return;
  win.hide();
  if (!readShellState().trayHintShown && Notification.isSupported()) {
    new Notification({
      title: 'ToDoMe ist im Infobereich',
      body: 'Session und Nachfragen laufen weiter. Ein Klick auf das Symbol neben der Uhr holt ToDoMe zurück.',
      icon: path.join(ASSETS_DIR, 'icon.png'),
    }).show();
    writeShellState({ trayHintShown: true });
  }
}

function createWindow(startHidden) {
  win = new BrowserWindow({
    ...restoredBounds(),
    minWidth: 420,
    minHeight: 640,
    show: false,
    title: 'ToDoMe.',
    backgroundColor: windowBackground(),
    icon: path.join(ASSETS_DIR, 'icon.png'),
    autoHideMenuBar: true,
    ...(SUPPORTS_OVERLAY ? { titleBarStyle: 'hidden', titleBarOverlay: titleBarOverlay() } : {}),
    // Ambience sounds may resume on launch without waiting for a click.
    webPreferences: { ...secureWebPreferences, spellcheck: true, autoplayPolicy: 'no-user-gesture-required' },
  });
  if (readShellState().maximized) win.maximize();
  // Accessibility: Ctrl + Plus / Minus / 0 and Ctrl + wheel zoom, remembered.
  attachZoom(win.webContents, { read: () => Number(readShellState().zoom) || 1, write: (zoom) => writeShellState({ zoom }) });
  if (!app.isPackaged) attachDevTools(win);
  // Show only once the app painted its first real frame (theme applied):
  // no white flash, straight into the welcome or onboarding screen.
  let shown = false;
  const reveal = () => {
    if (shown || startHidden || !win || win.isDestroyed()) return;
    shown = true;
    fadeIn(win);
  };
  revealMainWindow = reveal;
  // ready-to-show alone can come before the theme and fonts are applied: the
  // renderer's "ready" signal reveals; this is only the safety net.
  win.once('ready-to-show', () => setTimeout(reveal, 2500));

  // Minimize sends ToDoMe to the tray; the window's X quits the app.
  win.on('minimize', () => {
    if (!quitting) hideToTray();
  });
  win.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    app.quit();
  });

  let saveTimer = null;
  const saveBounds = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!win || win.isDestroyed() || win.isMinimized() || !win.isVisible()) return;
      writeShellState({ maximized: win.isMaximized(), ...(win.isMaximized() ? {} : { bounds: win.getBounds() }) });
    }, 400);
  };
  win.on('resize', saveBounds);
  win.on('move', saveBounds);
  win.on('focus', () => win && win.flashFrame(false));
  win.on('closed', () => {
    win = null;
  });

  hardenContents(win.webContents);
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[todome] renderer gone', details.reason, details.exitCode);
    if (details.reason === 'clean-exit' || !win || win.isDestroyed()) return;
    // Reload, but never in an endless loop: after 3 crashes a minute, the recovery screen.
    if (crashGuard.record() === 'reload') win.reload();
    else void win.loadURL(appUrl('#recovery'));
  });
  void win.loadURL(appUrl());
}

// ---------------------------------------------------------------------------
// Companion window (transparent, at the screen edge, never steals focus)
// ---------------------------------------------------------------------------
function createCompanion() {
  companionReady = false;
  companion = new BrowserWindow({
    ...COMPANION_SIZE,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    focusable: true,
    title: 'ToDoMe Begleiter',
    webPreferences: { ...secureWebPreferences, spellcheck: false },
  });
  companion.setAlwaysOnTop(true, 'floating');
  // Transparent areas let clicks through; the bubble enables input on hover.
  companion.setIgnoreMouseEvents(true, { forward: true });
  hardenContents(companion.webContents);
  companion.webContents.once('did-finish-load', () => {
    companionReady = true;
    if (pendingCompanion) deliverCompanion(pendingCompanion);
    pendingCompanion = null;
  });
  companion.on('closed', () => {
    companion = null;
    companionReady = false;
  });
  void companion.loadURL(appUrl('#companion'));
}

function placeCompanion(position) {
  if (!companion) return;
  // Always on the primary monitor, even if ToDoMe sits on a second screen.
  const area = screen.getPrimaryDisplay().workArea;
  const x = position === 'left' ? area.x + COMPANION_MARGIN : area.x + area.width - COMPANION_SIZE.width - COMPANION_MARGIN;
  const y = area.y + area.height - COMPANION_SIZE.height - COMPANION_MARGIN;
  companion.setBounds({ x: Math.round(x), y: Math.round(y), ...COMPANION_SIZE });
}

function deliverCompanion(payload) {
  if (!companion || companion.isDestroyed()) createCompanion();
  if (!companionReady) {
    pendingCompanion = payload;
    return;
  }
  placeCompanion(payload.position);
  companion.webContents.send('companion:message', payload);
  if (!companion.isVisible()) companion.showInactive();
}

// ---------------------------------------------------------------------------
// Mini overlay (draggable glass box, e.g. on a second monitor)
// ---------------------------------------------------------------------------
const OVERLAY_AVATAR = { small: 56, medium: 76, large: 100 };
const OVERLAY_MARGIN = 14;
function overlaySize(cfg) {
  const avatar = OVERLAY_AVATAR[(cfg && cfg.avatarSize) || 'medium'] || 76;
  // Box = avatar + padding, plus a transparent 14px margin for the glow.
  return { width: 390, height: avatar + 56 };
}

function clampToDisplays(bounds) {
  const visible = screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return bounds.x < a.x + a.width - 60 && bounds.x + bounds.width > a.x + 60 && bounds.y >= a.y - 10 && bounds.y < a.y + a.height - 40;
  });
  if (visible) return bounds;
  const a = screen.getPrimaryDisplay().workArea;
  return { ...bounds, x: a.x + a.width - bounds.width - 24, y: a.y + a.height - bounds.height - 24 };
}

function createOverlay() {
  const size = overlaySize(overlayConfig);
  const saved = readShellState().overlayPosition;
  const a = screen.getPrimaryDisplay().workArea;
  const bounds = clampToDisplays({
    x: saved ? saved.x : a.x + a.width - size.width - 24,
    y: saved ? saved.y : a.y + 24,
    ...size,
  });
  overlayReady = false;
  overlay = new BrowserWindow({
    ...bounds,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    // Resizable only so the app can size it to its content; there are no
    // handles (frameless, thickFrame off), so the user cannot drag-resize it.
    resizable: true,
    thickFrame: false,
    useContentSize: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    title: 'ToDoMe Overlay',
    webPreferences: { ...secureWebPreferences, spellcheck: false },
  });
  overlay.setAlwaysOnTop(true, 'floating');
  hardenContents(overlay.webContents);
  overlay.on('moved', () => {
    if (!overlay || overlay.isDestroyed()) return;
    const b = overlay.getBounds();
    writeShellState({ overlayPosition: { x: b.x, y: b.y } });
  });
  overlay.on('closed', () => {
    overlay = null;
    overlayReady = false;
  });
  overlay.webContents.once('did-finish-load', () => {
    overlayReady = true;
    if (overlayConfig) overlay.webContents.send('overlay:config', overlayConfig);
    if (overlayState) overlay.webContents.send('overlay:state', overlayState);
    overlay.showInactive();
  });
  void overlay.loadURL(appUrl('#overlay'));
}

function applyOverlayConfig(cfg) {
  overlayConfig = cfg;
  if (!cfg.enabled) {
    if (overlay && !overlay.isDestroyed()) overlay.destroy();
    overlay = null;
    rebuildTrayMenu();
    return;
  }
  if (!overlay || overlay.isDestroyed()) createOverlay();
  else {
    const b = overlay.getBounds();
    overlay.setBounds(clampToDisplays({ x: b.x, y: b.y, ...overlaySize(cfg) }));
    if (overlayReady) overlay.webContents.send('overlay:config', cfg);
  }
  rebuildTrayMenu();
}

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------
function trayImage(attention) {
  const img = nativeImage.createFromPath(path.join(ASSETS_DIR, attention ? 'tray-attention.png' : 'tray.png'));
  return img.isEmpty() ? nativeImage.createFromPath(path.join(ASSETS_DIR, 'icon.png')).resize({ width: 16, height: 16 }) : img;
}

const autostartSupported = () => app.isPackaged && (process.platform === 'win32' || process.platform === 'darwin');
const getAutostart = () => (autostartSupported() ? app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin : false);

function setAutostart(enabled) {
  if (!autostartSupported()) return false;
  app.setLoginItemSettings({ openAtLogin: Boolean(enabled), args: ['--hidden'] });
  rebuildTrayMenu();
  return getAutostart();
}

function rebuildTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'ToDoMe öffnen', click: showWindow },
      ...(updates && updates.ready
        ? [{ label: `Update ${updates.state.version ? `auf ${updates.state.version} ` : ''}installieren und neu starten`, click: installUpdateNow }]
        : []),      {
        label: 'Mini-Overlay',
        type: 'checkbox',
        checked: Boolean(overlayConfig && overlayConfig.enabled),
        click: () => win && !win.isDestroyed() && win.webContents.send('todome:toggle-overlay'),
      },
      { type: 'separator' },
      { label: 'Mit Windows starten', type: 'checkbox', checked: getAutostart(), enabled: autostartSupported(), click: (item) => setAutostart(item.checked) },
      { type: 'separator' },
      { label: 'ToDoMe beenden', click: () => app.quit() },
    ]),
  );
}

function createTray() {
  tray = new Tray(trayImage(false));
  tray.setToolTip('ToDoMe');
  tray.on('click', () => {
    if (win && win.isVisible() && win.isFocused()) hideToTray();
    else showWindow();
  });
  rebuildTrayMenu();
}

/** Show a window with a short opacity fade (Windows/macOS; elsewhere just shows). */
function fadeIn(target, ms = 180) {
  const canFade = process.platform === 'win32' || process.platform === 'darwin';
  if (!canFade) return target.show();
  target.setOpacity(0);
  target.show();
  const start = Date.now();
  const step = () => {
    if (target.isDestroyed()) return;
    const t = Math.min(1, (Date.now() - start) / ms);
    target.setOpacity(1 - Math.pow(1 - t, 3));
    if (t < 1) setTimeout(step, 16);
  };
  setTimeout(step, 16);
}

// ---------------------------------------------------------------------------
// Updates
// ---------------------------------------------------------------------------
function startUpdater() {
  updates = createUpdater({
    app,
    readAuto: () => readShellState().autoUpdate !== false,
    writeAuto: (auto) => writeShellState({ autoUpdate: auto }),
    onChange: (state) => {
      if (state.status !== lastUpdateStatus) {
        lastUpdateStatus = state.status;
        log.info(`[update] ${state.status}${state.version ? ` ${state.version}` : ''}`);
      }
      if (win && !win.isDestroyed()) {
        win.webContents.send('todome:update', state);
        // update-downloaded: tell the app once per version, so the companion
        // can offer the restart. A reloaded app asks `todome:update-get` instead.
        if (state.status === 'ready' && readyAnnouncedFor !== (state.version || '')) {
          readyAnnouncedFor = state.version || '';
          win.webContents.send('todome:update-ready', { version: state.version });
        }
      }
      rebuildTrayMenu();
    },
  });
}

/** Version the app was last told about via `todome:update-ready`. */
let readyAnnouncedFor = null;
let lastUpdateStatus = null;

// ---------------------------------------------------------------------------
// Quick capture: a global shortcut opens a small input over everything
// (also while ToDoMe sits in the tray). The line goes to the app window,
// which creates the task and answers; the window then says "Gemerkt".
// ---------------------------------------------------------------------------
const QUICK_KEYS = { ctrl_alt_space: 'Control+Alt+Space', ctrl_alt_t: 'Control+Alt+T', alt_shift_n: 'Alt+Shift+N' };
const QUICK_SIZE = { width: 600, height: 176 };
/** @type {BrowserWindow | null} */ let quick = null;
let quickAccel = null;
let quickSeq = 0;
/** Replies the app owes the quick window, by request id. */
const quickPending = new Map();
const fromQuick = (event) => Boolean(quick) && !quick.isDestroyed() && event.sender === quick.webContents && isTrustedUrl(event.senderFrame?.url ?? '');

function createQuick() {
  quick = new BrowserWindow({
    ...QUICK_SIZE,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    title: 'ToDoMe. Schnellerfassung',
    icon: path.join(ASSETS_DIR, 'icon.png'),
    webPreferences: { ...secureWebPreferences, spellcheck: true },
  });
  quick.setAlwaysOnTop(true, 'pop-up-menu');
  hardenContents(quick.webContents);
  // Clicking elsewhere puts it away, like any launcher.
  quick.on('blur', hideQuick);
  quick.on('closed', () => {
    quick = null;
  });
  void quick.loadURL(appUrl('#quick'));
}

function hideQuick() {
  if (quick && !quick.isDestroyed() && quick.isVisible()) quick.hide();
}

function openQuick() {
  if (!quick || quick.isDestroyed()) createQuick();
  // The same keys close it again.
  if (quick.isVisible()) return hideQuick();
  const { workArea: a } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  quick.setBounds({ x: Math.round(a.x + (a.width - QUICK_SIZE.width) / 2), y: Math.round(a.y + a.height * 0.24), ...QUICK_SIZE });
  const announce = () => quick && !quick.isDestroyed() && quick.webContents.send('quick:open', { theme: nativeTheme.shouldUseDarkColors ? 'dark' : 'light' });
  if (quick.webContents.isLoading()) quick.webContents.once('did-finish-load', announce);
  else announce();
  quick.show();
  quick.focus();
}

/** Registers the chosen shortcut (or none). `ok: false` = taken by another app. */
function setQuickKey(key) {
  if (quickAccel) globalShortcut.unregister(quickAccel);
  quickAccel = null;
  const accelerator = QUICK_KEYS[key];
  if (!accelerator) return { ok: key === 'off', active: false };
  let ok = false;
  try {
    ok = globalShortcut.register(accelerator, openQuick);
  } catch (err) {
    console.warn('[quick] shortcut failed', err);
  }
  if (!ok) {
    console.warn(`[quick] shortcut taken: ${accelerator}`);
    return { ok: false, active: false };
  }
  quickAccel = accelerator;
  log.info(`[quick] ${accelerator}`);
  // Load it in the background, so the first use opens without a wait.
  setTimeout(() => {
    if (quickAccel && !quick && !quitting) createQuick();
  }, 15_000);
  return { ok: true, active: true };
}

/** Let the app save first (like a normal quit), then install and restart. */
function installUpdateNow() {
  if (!updates || !updates.ready) return;
  const go = () => {
    pendingInstall = null;
    quitting = true;
    flushedBeforeQuit = true;
    if (companion && !companion.isDestroyed()) companion.destroy();
    if (overlay && !overlay.isDestroyed()) overlay.destroy();
    if (quick && !quick.isDestroyed()) quick.destroy();
    if (!updates.install()) quitting = false;
  };
  if (!win || win.isDestroyed()) return go();
  pendingInstall = go;
  win.webContents.send('todome:before-quit', { update: true });
  setTimeout(() => pendingInstall && pendingInstall(), 1500);
}

// ---------------------------------------------------------------------------
// IPC – every handler validates its sender and input
// ---------------------------------------------------------------------------
function registerIpc() {
  ipcMain.handle('todome:idle-state', (event, thresholdSec) => {
    if (!fromApp(event)) throw new Error('untrusted sender');
    const threshold = Number.isFinite(thresholdSec) ? Math.min(Math.max(Math.round(thresholdSec), 60), 7200) : 600;
    return { state: powerMonitor.getSystemIdleState(threshold), idleSeconds: powerMonitor.getSystemIdleTime() };
  });
  ipcMain.handle('todome:get-autostart', (event) => {
    if (!fromApp(event)) throw new Error('untrusted sender');
    return { supported: autostartSupported(), enabled: getAutostart() };
  });
  ipcMain.handle('todome:set-autostart', (event, enabled) => {
    if (!fromApp(event)) throw new Error('untrusted sender');
    return { supported: autostartSupported(), enabled: setAutostart(enabled === true) };
  });
  ipcMain.handle('todome:info', (event) => {
    if (!fromApp(event) && !fromCompanion(event) && !(overlay && event.sender === overlay.webContents)) throw new Error('untrusted sender');
    return { version: app.getVersion(), platform: process.platform, packaged: app.isPackaged };
  });

  // Feedback & contact (settings): validated here, posted from the main process.
  let contact = null;
  const contactBridge = () => {
    if (contact) return contact;
    let config = {};
    try {
      config = JSON.parse(fs.readFileSync(path.join(__dirname, 'contact.json'), 'utf8'));
    } catch {
      /* no form configured: mail fallback */
    }
    contact = createContact({
      config,
      fetch: (url, init) => net.fetch(url, init),
      openExternal: (url) => shell.openExternal(url),
      meta: { version: app.getVersion(), platform: `${process.platform} ${process.getSystemVersion?.() ?? ''}`.trim() },
      diagnostics: diagnosticsReport,
    });
    return contact;
  };
  ipcMain.handle('todome:contact-info', (event) => {
    if (!fromApp(event)) throw new Error('untrusted sender');
    return contactBridge().info();
  });
  ipcMain.handle('todome:contact-send', (event, payload) => {
    if (!fromApp(event)) throw new Error('untrusted sender');
    return contactBridge().send(payload);
  });

  const noUpdates = () => ({ status: 'disabled', auto: false, current: app.getVersion() });
  ipcMain.handle('todome:update-get', (event) => {
    if (!fromApp(event)) throw new Error('untrusted sender');
    return updates ? updates.state : noUpdates();
  });
  const checkForUpdates = async (event) => {
    if (!fromApp(event)) throw new Error('untrusted sender');
    return updates ? updates.check() : noUpdates();
  };
  ipcMain.handle('todome:update-check', checkForUpdates);
  // Generic alias for the same check (same sender validation).
  ipcMain.handle('check-for-updates', checkForUpdates);
  // Companion "Jetzt neu starten": the app saves first, then quitAndInstall().
  // Resolves false when no downloaded update is waiting.
  ipcMain.handle('todome:restart-and-install', (event) => {
    if (!fromApp(event)) throw new Error('untrusted sender');
    if (!updates || !updates.ready) return false;
    installUpdateNow();
    return true;
  });
  ipcMain.handle('todome:update-auto', (event, auto) => {
    if (!fromApp(event)) throw new Error('untrusted sender');
    return updates ? updates.setAuto(auto === true) : noUpdates();
  });
  ipcMain.on('todome:update-install', (event) => {
    if (fromApp(event)) installUpdateNow();
  });

  ipcMain.on('todome:focus', (event) => {
    if (fromApp(event) || fromCompanion(event)) showWindow();
  });

  // The renderer reports its real page colour per theme, for the next start.
  ipcMain.on('todome:window-bg', (event, payload) => {
    if (!fromApp(event) || !payload || typeof payload !== 'object') return;
    const mode = payload.mode === 'dark' ? 'dark' : 'light';
    const color = String(payload.color || '');
    if (!COLOR_RE.test(color)) return;
    const prev = readShellState().windowBg || {};
    if (prev[mode] === toHex(color)) return;
    writeShellState({ windowBg: { ...prev, [mode]: toHex(color) } });
    if (win && !win.isDestroyed()) win.setBackgroundColor(windowBackground());
  });

  ipcMain.on('todome:set-theme', (event, theme) => {
    if (!fromApp(event) || !['system', 'light', 'dark'].includes(theme)) return;
    nativeTheme.themeSource = theme;
    writeShellState({ theme });
    if (win && !win.isDestroyed()) {
      win.setBackgroundColor(windowBackground());
      if (SUPPORTS_OVERLAY) {
        try {
          win.setTitleBarOverlay(titleBarOverlay());
        } catch {
          /* window without overlay */
        }
      }
    }
  });

  let lastAttention = false;
  ipcMain.on('todome:status', (event, status) => {
    if (!fromApp(event) || !status || typeof status !== 'object') return;
    const text = typeof status.text === 'string' ? status.text.slice(0, 120) : 'ToDoMe';
    const attention = status.attention === true;
    if (tray) {
      tray.setToolTip(text);
      if (attention !== lastAttention) tray.setImage(trayImage(attention));
    }
    if (win && !win.isDestroyed()) {
      if (attention && !lastAttention && !win.isFocused()) win.flashFrame(true);
      if (process.platform === 'win32') {
        win.setOverlayIcon(attention ? nativeImage.createFromPath(path.join(ASSETS_DIR, 'badge.png')) : null, attention ? 'Offene Nachfrage' : '');
      }
    }
    lastAttention = attention;
  });

  // Companion: app → companion window
  ipcMain.on('todome:companion-show', (event, payload) => {
    if (!fromApp(event) || !payload || typeof payload !== 'object' || !payload.message) return;
    deliverCompanion({
      message: payload.message,
      avatar: String(payload.avatar || 'spike'),
      position: payload.position === 'left' ? 'left' : 'right',
      theme: ['light', 'dark'].includes(payload.theme) ? payload.theme : 'light',
    });
  });
  ipcMain.on('todome:companion-hide', (event, messageId) => {
    if (!fromApp(event) || !companion || companion.isDestroyed()) return;
    companion.webContents.send('companion:dismiss', typeof messageId === 'string' ? messageId : null);
  });

  // Companion window → app
  ipcMain.on('companion:reply', (event, reply) => {
    if (!fromCompanion(event) || !reply || typeof reply.messageId !== 'string' || typeof reply.optionId !== 'string') return;
    if (win && !win.isDestroyed()) win.webContents.send('todome:companion-reply', { messageId: reply.messageId, optionId: reply.optionId });
  });
  ipcMain.on('companion:hover', (event, hovering) => {
    if (!fromCompanion(event)) return;
    companion.setIgnoreMouseEvents(hovering !== true, { forward: true });
  });
  ipcMain.on('companion:closed', (event) => {
    if (!fromCompanion(event)) return;
    companion.setIgnoreMouseEvents(true, { forward: true });
    companion.hide();
  });

  // Mini overlay: app → overlay, overlay → app
  ipcMain.on('todome:overlay-config', (event, cfg) => {
    if (!fromApp(event) || !cfg || typeof cfg !== 'object') return;
    applyOverlayConfig({
      enabled: cfg.enabled === true,
      opacity: Math.min(1, Math.max(0.35, Number(cfg.opacity) || 0.82)),
      glow: cfg.glow !== false,
      avatarSize: ['small', 'medium', 'large'].includes(cfg.avatarSize) ? cfg.avatarSize : 'medium',
      theme: cfg.theme === 'dark' ? 'dark' : 'light',
      palette: typeof cfg.palette === 'string' ? cfg.palette.slice(0, 20) : 'lime',
      modules: Object.fromEntries(
        ['avatar', 'anchor', 'progress', 'media'].map((k) => [k, Boolean(cfg.modules && cfg.modules[k])]),
      ),
    });
  });
  ipcMain.on('todome:overlay-state', (event, state) => {
    if (!fromApp(event) || !state || typeof state !== 'object') return;
    overlayState = state;
    if (overlay && overlayReady && !overlay.isDestroyed()) overlay.webContents.send('overlay:state', state);
  });
  const fromOverlay = (event) => Boolean(overlay) && event.sender === overlay.webContents && isTrustedUrl(event.senderFrame?.url ?? '');
  ipcMain.on('overlay:open-app', (event) => {
    if (fromOverlay(event)) showWindow();
  });
  // Drag by pointer (not an OS drag region) so a plain click can open the app.
  let dragOrigin = null;
  ipcMain.on('overlay:drag-start', (event) => {
    if (!fromOverlay(event) || !overlay || overlay.isDestroyed()) return;
    const b = overlay.getBounds();
    dragOrigin = { x: b.x, y: b.y };
  });
  ipcMain.on('overlay:drag-move', (event, d) => {
    if (!fromOverlay(event) || !dragOrigin || !overlay || overlay.isDestroyed() || !d) return;
    const dx = Number(d.dx);
    const dy = Number(d.dy);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    overlay.setPosition(Math.round(dragOrigin.x + dx), Math.round(dragOrigin.y + dy));
  });
  ipcMain.on('overlay:drag-end', (event) => {
    if (!fromOverlay(event) || !overlay || overlay.isDestroyed()) return;
    dragOrigin = null;
    const b = clampToDisplays(overlay.getBounds());
    overlay.setBounds(b);
    writeShellState({ overlayPosition: { x: b.x, y: b.y } });
  });
  // The overlay measures its glass box; the window follows, so nothing is cut off.
  ipcMain.on('overlay:resize', (event, size) => {
    if (!fromOverlay(event) || !overlay || overlay.isDestroyed() || !size) return;
    const w = Math.min(560, Math.max(200, Math.ceil(Number(size.width) || 0) + OVERLAY_MARGIN * 2));
    const h = Math.min(320, Math.max(80, Math.ceil(Number(size.height) || 0) + OVERLAY_MARGIN * 2));
    const b = overlay.getBounds();
    if (b.width !== w || b.height !== h) {
      overlay.setMinimumSize(1, 1);
      overlay.setBounds(clampToDisplays({ x: b.x, y: b.y, width: w, height: h }));
      overlay.setContentSize(w, h);
    }
  });
  ipcMain.on('overlay:close', (event) => {
    if (!fromOverlay(event)) return;
    if (win && !win.isDestroyed()) win.webContents.send('todome:overlay-closed');
  });

  ipcMain.on('todome:ready', (event) => {
    if (fromApp(event) && revealMainWindow) revealMainWindow();
  });

  // Media keys for the system player (Windows media session).
  ipcMain.handle('todome:media', async (event, cmd) => {
    const fromOverlayWin = Boolean(overlay) && !overlay.isDestroyed() && event.sender === overlay.webContents;
    if (!fromApp(event) && !fromOverlayWin) throw new Error('untrusted sender');
    if (typeof cmd !== 'string') return { ok: false, supported: process.platform === 'win32' };
    if (!media) media = createMediaBridge(app.getPath('userData'), { version: app.getVersion() });
    return media.send(cmd);
  });

  // Quick capture: the app picks the shortcut; the quick window sends one line.
  ipcMain.handle('todome:quick-config', (event, key) => {
    if (!fromApp(event)) throw new Error('untrusted sender');
    return setQuickKey(String(key));
  });
  ipcMain.handle('quick:submit', (event, text) => {
    if (!fromQuick(event) || typeof text !== 'string') return { ok: false, message: 'Das hat nicht geklappt.' };
    const line = text.replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!line) return { ok: false, message: 'Schreib kurz, was du dir merken willst.' };
    if (!win || win.isDestroyed()) return { ok: false, message: 'ToDoMe. startet gerade. Versuch es gleich noch einmal.' };
    const id = ++quickSeq;
    const target = win;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        quickPending.delete(id);
        resolve({ ok: false, message: 'ToDoMe. antwortet gerade nicht. Versuch es gleich noch einmal.' });
      }, 4000);
      quickPending.set(id, (result) => {
        clearTimeout(timer);
        resolve(result);
      });
      target.webContents.send('todome:quick-add', { id, text: line });
    });
  });
  ipcMain.on('todome:quick-result', (event, result) => {
    if (!fromApp(event) || !result || typeof result !== 'object') return;
    const done = quickPending.get(result.id);
    if (!done) return;
    quickPending.delete(result.id);
    done({ ok: result.ok === true, message: String(result.message || '').slice(0, 200) });
  });
  ipcMain.on('quick:close', (event) => {
    if (fromQuick(event)) hideQuick();
  });

  // Datensafe: the app sends its serialized state; written atomically, rotated.
  ipcMain.on('todome:vault-save', (event, payload) => {
    if (!fromApp(event) || !payload || typeof payload !== 'object') return;
    try {
      vault().save(payload.kind, payload.json);
    } catch (err) {
      console.error('[todome] backup failed', err && err.message ? err.message : err);
    }
  });
  ipcMain.handle('todome:vault-list', (event) => {
    if (!fromApp(event)) throw new Error('untrusted sender');
    return vault().list();
  });
  ipcMain.handle('todome:vault-read', (event, name) => {
    if (!fromApp(event)) throw new Error('untrusted sender');
    return vault().read(name);
  });
  ipcMain.handle('todome:vault-open', async (event) => {
    if (!fromApp(event)) throw new Error('untrusted sender');
    fs.mkdirSync(vault().dir, { recursive: true });
    return (await shell.openPath(vault().dir)) === '';
  });

  // Renderer errors (all three windows) go into the local log, length-limited.
  ipcMain.on('todome:log', (event, entry) => {
    const trusted = fromApp(event) || fromCompanion(event) || (overlay && !overlay.isDestroyed() && event.sender === overlay.webContents);
    if (!trusted || !entry || typeof entry !== 'object') return;
    const level = entry.level === 'warn' ? 'warn' : 'error';
    const scope = String(entry.scope || 'renderer').replace(/[^\w:-]/g, '').slice(0, 40);
    const message = String(entry.message || '').slice(0, 1000);
    const stack = String(entry.stack || '').slice(0, 3000);
    // A stack trace starts with the message already: write it once.
    log[level](`[renderer:${scope}]`, stack.startsWith(message) ? stack : `${message}\n${stack}`.trim());
  });

  ipcMain.on('todome:flushed', (event) => {
    if (!fromApp(event)) return;
    if (pendingInstall) return pendingInstall();
    flushedBeforeQuit = true;
    app.quit();
  });
}

// ---------------------------------------------------------------------------
// Power events: sleep must not count as working time
// ---------------------------------------------------------------------------
function registerPowerEvents() {
  powerMonitor.on('suspend', () => {
    lastSuspendAt = Date.now();
  });
  powerMonitor.on('resume', () => {
    if (lastSuspendAt && win && !win.isDestroyed()) {
      win.webContents.send('todome:power', { type: 'resume', suspendedAt: lastSuspendAt, resumedAt: Date.now() });
    }
    lastSuspendAt = null;
  });
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());

  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'notifications'));
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'notifications');
    if (app.isPackaged) Menu.setApplicationMenu(null);
    // Start in the theme the user picked last time: no bright flash on launch.
    const savedTheme = readShellState().theme;
    if (['system', 'light', 'dark'].includes(savedTheme)) nativeTheme.themeSource = savedTheme;
    log.info(`[start] ToDoMe ${app.getVersion()} · Electron ${process.versions.electron} · ${process.platform} ${process.arch}${START_HIDDEN ? ' · autostart' : ''}`);
    const crashes = recentCrashDumps(app.getPath('crashDumps'), 1);
    if (crashes.length) log.warn(`[start] ${crashes.length} crash dump(s) in the last 24 h`);
    app.on('child-process-gone', (_e, d) => log.warn('[main] child process gone', d.type, d.reason, d.exitCode));
    registerAppProtocol();
    registerIpc();
    registerPowerEvents();
    startUpdater();
    createTray();
    createWindow(START_HIDDEN);
    app.on('activate', () => showWindow());
  });

  // Let the renderer persist pending state before quitting.
  app.on('before-quit', (event) => {
    if (!quitting) log.info(`[quit]${updates && updates.ready ? ' installing update' : ''}`);
    quitting = true;
    if (flushedBeforeQuit || !win || win.isDestroyed()) {
      if (companion && !companion.isDestroyed()) companion.destroy();
      if (overlay && !overlay.isDestroyed()) overlay.destroy();
      if (quick && !quick.isDestroyed()) quick.destroy();
      if (media) media.dispose();
      if (updates) updates.dispose();
      return;
    }
    event.preventDefault();
    // A downloaded update installs on this quit as well: the renderer keeps a pre-update copy.
    win.webContents.send('todome:before-quit', { update: Boolean(updates && updates.ready) });
    setTimeout(() => {
      flushedBeforeQuit = true;
      app.quit();
    }, 1500);
  });

  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => globalShortcut.unregisterAll());
}

app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault());
});
