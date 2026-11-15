// @vitest-environment node
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const autostart = require('../../electron/autostart.cjs') as {
  reconcile(intent: unknown, openAtLogin: boolean): { register: boolean; record: boolean | null };
  status(supported: boolean, item: { openAtLogin: boolean; executableWillLaunchAtLogin?: boolean } | null): { supported: boolean; enabled: boolean; blocked: boolean };
};

describe('Mit Windows starten', () => {
  it('adopts what Windows has on the first launch with the saved choice', () => {
    expect(autostart.reconcile(undefined, true)).toEqual({ register: false, record: true });
    expect(autostart.reconcile(undefined, false)).toEqual({ register: false, record: false });
  });

  it('brings a login item back that went missing although it was chosen', () => {
    expect(autostart.reconcile(true, false)).toEqual({ register: true, record: null });
  });

  it('follows Windows when the item was added outside ToDoMe, and leaves agreement alone', () => {
    expect(autostart.reconcile(false, true)).toEqual({ register: false, record: true });
    expect(autostart.reconcile(true, true)).toEqual({ register: false, record: null });
    expect(autostart.reconcile(false, false)).toEqual({ register: false, record: null });
  });

  it('reports an item switched off in the Task Manager as blocked, never as off', () => {
    expect(autostart.status(true, { openAtLogin: true, executableWillLaunchAtLogin: false })).toEqual({ supported: true, enabled: true, blocked: true });
    expect(autostart.status(true, { openAtLogin: true, executableWillLaunchAtLogin: true })).toEqual({ supported: true, enabled: true, blocked: false });
    // macOS has no such flag: never blocked there.
    expect(autostart.status(true, { openAtLogin: true })).toEqual({ supported: true, enabled: true, blocked: false });
    expect(autostart.status(false, null)).toEqual({ supported: false, enabled: false, blocked: false });
  });
});
