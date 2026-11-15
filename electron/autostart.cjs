'use strict';
/**
 * "Mit Windows starten", as pure functions (no Electron here).
 *
 * Windows itself keeps the login item (Run key, set via
 * app.setLoginItemSettings). shell-state.json remembers what the user chose
 * in ToDoMe, so a login item that went missing (e.g. a clean-up tool removed
 * it) comes back at the next launch. Windows stays the authority otherwise:
 * an item switched off in the Task Manager (Startup apps) is never forced on
 * again, it is only reported as blocked.
 */

/**
 * What to do at launch.
 * @param {unknown} intent The saved choice (shell-state.json `autostart`), if any.
 * @param {boolean} openAtLogin Whether Windows has the login item.
 * @returns {{ register: boolean, record: boolean | null }} register: set the
 *   login item again; record: the choice to save (null = keep as it is).
 */
function reconcile(intent, openAtLogin) {
  // First launch with this logic: adopt what Windows has.
  if (typeof intent !== 'boolean') return { register: false, record: openAtLogin };
  // Chosen in ToDoMe, but the item is gone: bring it back.
  if (intent && !openAtLogin) return { register: true, record: null };
  // Added outside ToDoMe (or still there): Windows wins, the choice follows.
  if (!intent && openAtLogin) return { register: false, record: true };
  return { register: false, record: null };
}

/**
 * The status the settings show.
 * @param {boolean} supported Installed app on Windows or macOS.
 * @param {{ openAtLogin: boolean, executableWillLaunchAtLogin?: boolean } | null} item
 * @returns {{ supported: boolean, enabled: boolean, blocked: boolean }} blocked:
 *   the item exists, but Windows will not launch it (switched off in the Task Manager).
 */
function status(supported, item) {
  if (!supported || !item) return { supported, enabled: false, blocked: false };
  const enabled = Boolean(item.openAtLogin);
  return { supported, enabled, blocked: enabled && item.executableWillLaunchAtLogin === false };
}

module.exports = { reconcile, status };
