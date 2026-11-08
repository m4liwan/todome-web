// @vitest-environment node
import { mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { createVault, KEEP } = require('../../electron/vault.cjs');
const { createCrashGuard } = require('../../electron/crash-guard.cjs');

describe('Datensafe (electron/vault.cjs)', () => {
  let dir: string;
  beforeEach(() => {
    dir = join(mkdtempSync(join(tmpdir(), 'todome-vault-')), 'backups');
  });
  afterEach(() => rmSync(join(dir, '..'), { recursive: true, force: true }));

  const day = (d: number, h = 12) => new Date(2026, 10, d, h, 0, 0);

  it('keeps one daily copy per day and rotates after 14 days', () => {
    const v = createVault(dir);
    expect(v.save('daily', '{"a":1}', day(1, 9))).toBe('daily-2026-11-01.json');
    expect(v.save('daily', '{"a":2}', day(1, 18))).toBe('daily-2026-11-01.json');
    expect(v.read('daily-2026-11-01.json')).toBe('{"a":2}');
    for (let d = 2; d <= 20; d++) v.save('daily', `{"d":${d}}`, day(d));
    const daily = readdirSync(dir).filter((f) => f.startsWith('daily-'));
    expect(daily).toHaveLength(KEEP.daily);
    expect(daily).not.toContain('daily-2026-11-01.json');
    expect(daily).toContain('daily-2026-11-20.json');
  });

  it('writes atomically (no temp files left) and skips a copy identical to the newest', () => {
    const v = createVault(dir);
    const first = v.save('pre-update', '{"x":1}', new Date('2026-11-08T10:00:00.000Z'));
    const again = v.save('pre-update', '{"x":1}', new Date('2026-11-08T11:00:00.000Z'));
    expect(again).toBe(first);
    expect(readdirSync(dir)).toEqual([first]);
  });

  it('a start that keeps failing can never rotate the good copies away', () => {
    const v = createVault(dir);
    for (let i = 0; i < 20; i++) v.save('unreadable', 'kaputt', new Date(Date.UTC(2026, 10, 8, 10, i)));
    expect(readdirSync(dir).filter((f) => f.startsWith('unreadable-'))).toHaveLength(1);
  });

  it('keeps the newest copies per kind and lists them newest first', () => {
    const v = createVault(dir);
    for (let i = 0; i < 8; i++) {
      const name = v.save('pre-import', `{"i":${i}}`, new Date(Date.UTC(2026, 10, 8, 10, i)));
      utimesSync(join(dir, name), 1_800_000_000 + i, 1_800_000_000 + i);
    }
    const list = v.list();
    expect(list).toHaveLength(KEEP['pre-import']);
    expect(list[0].kind).toBe('pre-import');
    expect(v.read(list[0].name)).toBe('{"i":7}');
    expect(list.map((e: { at: number }) => e.at)).toEqual([...list.map((e: { at: number }) => e.at)].sort((a, b) => b - a));
  });

  it('refuses unknown kinds, empty data and any path outside the safe', () => {
    const v = createVault(dir);
    expect(v.save('settings', '{}')).toBeNull();
    expect(v.save('daily', '')).toBeNull();
    expect(v.read('../shell-state.json')).toBeNull();
    expect(v.read('daily-2026-11-01.json')).toBeNull();
    writeFileSync(join(dir, '..', 'secret.json'), 'x');
    expect(v.read('..\\secret.json')).toBeNull();
    expect(v.list()).toEqual([]);
  });
});

describe('crash-loop guard (electron/crash-guard.cjs)', () => {
  it('reloads twice, then opens the recovery screen; old crashes age out', () => {
    let t = 0;
    const g = createCrashGuard({ limit: 3, windowMs: 60_000, now: () => t });
    expect(g.record()).toBe('reload');
    t = 10_000;
    expect(g.record()).toBe('reload');
    t = 20_000;
    expect(g.record()).toBe('recover');
    t = 200_000;
    expect(g.record()).toBe('reload');
  });
});
