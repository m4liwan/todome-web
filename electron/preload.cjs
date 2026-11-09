'use strict';
/**
 * Preload (sandboxed). Exposes a minimal bridge as `window.todome` to both the
 * app window and the companion window. No Node APIs reach the page; the main
 * process checks which window each message comes from.
 */
const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('todome', {
  isDesktop: true,
  platform: process.platform,

  // App window
  getIdleState: (thresholdSec) => ipcRenderer.invoke('todome:idle-state', thresholdSec),
  getAutostart: () => ipcRenderer.invoke('todome:get-autostart'),
  setAutostart: (enabled) => ipcRenderer.invoke('todome:set-autostart', enabled === true),
  getInfo: () => ipcRenderer.invoke('todome:info'),
  focus: () => ipcRenderer.send('todome:focus'),
  appReady: () => ipcRenderer.send('todome:ready'),
  reportWindowBg: (mode, color) => ipcRenderer.send('todome:window-bg', { mode: mode === 'dark' ? 'dark' : 'light', color: String(color) }),
  media: (cmd) => ipcRenderer.invoke('todome:media', cmd),
  contactInfo: () => ipcRenderer.invoke('todome:contact-info'),
  contactSend: (payload) => ipcRenderer.invoke('todome:contact-send', payload),
  // Diagnostics: renderer errors into the local log (all windows).
  log: (entry) => ipcRenderer.send('todome:log', entry),
  updateState: () => ipcRenderer.invoke('todome:update-get'),
  updateCheck: () => ipcRenderer.invoke('todome:update-check'),
  updateSetAuto: (auto) => ipcRenderer.invoke('todome:update-auto', auto === true),
  updateInstall: () => ipcRenderer.send('todome:update-install'),
  onUpdate: (callback) => subscribe('todome:update', callback),
  // update-downloaded → companion offer; returns the unsubscribe function.
  onUpdateReady: (callback) => subscribe('todome:update-ready', callback),
  restartAndInstall: () => ipcRenderer.invoke('todome:restart-and-install'),
  setStatus: (status) => ipcRenderer.send('todome:status', status),
  setTheme: (theme) => ipcRenderer.send('todome:set-theme', theme),
  onPower: (callback) => subscribe('todome:power', callback),
  onBeforeQuit: (callback) =>
    subscribe('todome:before-quit', (info) => {
      try {
        callback({ update: Boolean(info && info.update) });
      } finally {
        ipcRenderer.send('todome:flushed');
      }
    }),
  // Datensafe (electron/vault.cjs). `send` keeps the order: a pre-update copy lands before "flushed".
  vaultSave: (kind, json) => ipcRenderer.send('todome:vault-save', { kind: String(kind), json: String(json) }),
  vaultList: () => ipcRenderer.invoke('todome:vault-list'),
  vaultRead: (name) => ipcRenderer.invoke('todome:vault-read', String(name)),
  vaultOpen: () => ipcRenderer.invoke('todome:vault-open'),
  companionShow: (payload) => ipcRenderer.send('todome:companion-show', payload),
  companionHide: (messageId) => ipcRenderer.send('todome:companion-hide', messageId),
  onCompanionReply: (callback) => subscribe('todome:companion-reply', callback),

  overlayConfig: (cfg) => ipcRenderer.send('todome:overlay-config', cfg),
  overlayState: (state) => ipcRenderer.send('todome:overlay-state', state),
  onOverlayClosed: (callback) => subscribe('todome:overlay-closed', callback),
  onToggleOverlay: (callback) => subscribe('todome:toggle-overlay', callback),

  // Mini overlay window
  onOverlayConfig: (callback) => subscribe('overlay:config', callback),
  onOverlayState: (callback) => subscribe('overlay:state', callback),
  overlayOpenApp: () => ipcRenderer.send('overlay:open-app'),
  overlayClose: () => ipcRenderer.send('overlay:close'),
  overlayResize: (size) => ipcRenderer.send('overlay:resize', size),
  overlayDragStart: () => ipcRenderer.send('overlay:drag-start'),
  overlayDragMove: (delta) => ipcRenderer.send('overlay:drag-move', delta),
  overlayDragEnd: () => ipcRenderer.send('overlay:drag-end'),

  // Quick capture: the app sets the shortcut and answers each line
  quickConfig: (key) => ipcRenderer.invoke('todome:quick-config', String(key)),
  onQuickAdd: (callback) => subscribe('todome:quick-add', callback),
  quickResult: (result) => ipcRenderer.send('todome:quick-result', result),
  // Quick capture window
  onQuickOpen: (callback) => subscribe('quick:open', callback),
  quickSubmit: (text) => ipcRenderer.invoke('quick:submit', String(text)),
  quickClose: () => ipcRenderer.send('quick:close'),

  // Companion window
  onCompanionMessage: (callback) => subscribe('companion:message', callback),
  onCompanionDismiss: (callback) => subscribe('companion:dismiss', callback),
  companionReply: (messageId, optionId) => ipcRenderer.send('companion:reply', { messageId, optionId }),
  companionHover: (hovering) => ipcRenderer.send('companion:hover', hovering === true),
  companionClosed: () => ipcRenderer.send('companion:closed'),
});
