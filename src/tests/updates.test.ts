// @vitest-environment node
import { createRequire } from 'node:module';
import { updateLine } from '../app/updates';
import type { UpdateState } from '../lib/desktop';

const require = createRequire(import.meta.url);

describe('updates', () => {
  const at = (status: UpdateState['status'], extra: Partial<UpdateState> = {}): UpdateState => ({ status, auto: true, current: '1.11.0', ...extra });

  it('says one calm sentence for every state', () => {
    expect(updateLine(null)).toMatch(/keine automatischen Updates/);
    expect(updateLine(at('disabled'))).toMatch(/per Installer/);
    expect(updateLine(at('idle'))).toMatch(/im Hintergrund/);
    expect(updateLine(at('idle', { auto: false }))).toMatch(/automatische Suche ist aus/);
    expect(updateLine(at('none'))).toBe('Du bist auf dem neuesten Stand.');
    expect(updateLine(at('downloading', { version: '1.12.0', percent: 40 }))).toBe('Version 1.12.0 wird im Hintergrund geladen (40 %).');
    expect(updateLine(at('ready', { version: '1.12.0' }))).toMatch(/^Version 1\.12\.0 ist bereit\./);
    expect(updateLine(at('ready'))).toMatch(/^Die neue Version ist bereit\./);
    expect(updateLine(at('error'))).toMatch(/später noch einmal/);
  });

  it('stays off outside a packaged release build', () => {
    const { createUpdater } = require('../../electron/updater.cjs');
    const changes: UpdateState[] = [];
    const u = createUpdater({
      app: { isPackaged: false, getVersion: () => '1.11.0' },
      readAuto: () => true,
      writeAuto: () => undefined,
      onChange: (s: UpdateState) => changes.push(s),
    });
    expect(u.state.status).toBe('disabled');
    expect(u.install()).toBe(false);
    expect(u.ready).toBe(false);
    u.dispose();
  });
});
