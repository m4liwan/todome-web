// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { createLog, redact, recentCrashDumps } = require('../../electron/log.cjs');
const { createContact } = require('../../electron/contact.cjs');

describe('local diagnostics log (electron/log.cjs)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'todome-log-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('writes timestamped lines with stack traces and rotates at the size limit', () => {
    const log = createLog(join(dir, 'logs'), { now: () => new Date('2026-11-09T07:00:00.000Z'), maxBytes: 400 });
    log.info('[start] ToDoMe 1.15.2');
    log.error('[main] boom', new Error('kaputt'));
    const text = readFileSync(log.file, 'utf8');
    expect(text).toMatch(/^2026-11-09T07:00:00\.000Z INFO {2}\[start\] ToDoMe 1\.15\.2$/m);
    expect(text).toMatch(/ERROR \[main\] boom Error: kaputt\n {4}at /);
    for (let i = 0; i < 20; i++) log.warn(`line ${i}`);
    expect(readFileSync(`${log.file}.1`, 'utf8').length).toBeGreaterThan(0);
    expect(log.tail(3).split('\n')).toEqual([expect.stringMatching(/line 17$/), expect.stringMatching(/line 18$/), expect.stringMatching(/line 19$/)]);
  });

  it('never lets the home folder or mail addresses leave the device', () => {
    const home = homedir();
    expect(redact(`at ${home}\\AppData\\Local\\Programs\\ToDoMe\\app.asar lena@beispiel.de`)).toBe('at ~\\AppData\\Local\\Programs\\ToDoMe\\app.asar <email>');
    const log = createLog(dir);
    log.error(`failed in ${home}${home.includes('\\') ? '\\' : '/'}x.json for max@firma.de`);
    expect(log.tail()).not.toContain(home);
    expect(log.tail()).toContain('<email>');
  });

  it('mirrors console.warn / console.error into the file, and never throws', () => {
    const log = createLog(dir);
    const seen: unknown[][] = [];
    const target = { warn: (...a: unknown[]) => void seen.push(a), error: (...a: unknown[]) => void seen.push(a) };
    log.captureConsole(target);
    target.error('[todome:update]', 'net::ERR_TIMED_OUT');
    expect(seen).toEqual([['[todome:update]', 'net::ERR_TIMED_OUT']]);
    expect(log.tail()).toMatch(/ERROR \[todome:update\] net::ERR_TIMED_OUT/);
    // A file where the folder should be: writing fails silently.
    writeFileSync(join(dir, 'blocked'), 'x');
    expect(() => createLog(join(dir, 'blocked')).error('x')).not.toThrow();
  });

  it('counts recent crash dumps only', () => {
    const now = Date.UTC(2026, 10, 9);
    mkdirSync(join(dir, 'reports'), { recursive: true });
    writeFileSync(join(dir, 'reports', 'a.dmp'), '');
    writeFileSync(join(dir, 'reports', 'old.dmp'), '');
    writeFileSync(join(dir, 'settings.dat'), '');
    utimesSync(join(dir, 'reports', 'a.dmp'), (now - 3_600_000) / 1000, (now - 3_600_000) / 1000);
    utimesSync(join(dir, 'reports', 'old.dmp'), (now - 30 * 86_400_000) / 1000, (now - 30 * 86_400_000) / 1000);
    expect(recentCrashDumps(dir, 7, now)).toHaveLength(1);
    expect(recentCrashDumps(join(dir, 'missing'), 7, now)).toEqual([]);
  });
});

describe('"Problem melden" with the technical log', () => {
  const meta = { version: '1.15.2', platform: 'win32 10.0' };
  const setup = (config: { endpoint?: string; email?: string }) => {
    const bodies: Array<Record<string, string>> = [];
    const opened: string[] = [];
    const diagnostics = vi.fn((lines: number, chars: number) => `ToDoMe 1.15.2\n---\n${lines}/${chars}`);
    const c = createContact({
      config,
      fetch: async (_url: string, init: { body: string }) => {
        bodies.push(JSON.parse(init.body));
        return { ok: true, status: 200 };
      },
      openExternal: async (url: string) => void opened.push(url),
      meta,
      diagnostics,
    });
    return { c, bodies, opened, diagnostics };
  };

  it('attaches the log only to a bug report and only with the tick', async () => {
    const { c, bodies, diagnostics } = setup({ endpoint: 'https://formspree.io/f/abc123' });
    await c.send({ topic: 'idea', message: 'Schöne Idee', attachLog: true });
    expect(bodies[0]).not.toHaveProperty('diagnostics');
    expect(diagnostics).not.toHaveBeenCalled();
  });

  it('sends up to 200 lines through the form', async () => {
    const { c, bodies } = setup({ endpoint: 'https://formspree.io/f/abc123' });
    await c.send({ topic: 'bug', message: 'Absturz beim Start', attachLog: true });
    expect(bodies[0]!.diagnostics).toBe('ToDoMe 1.15.2\n---\n200/20000');
  });

  it('keeps a mail link short, and sends nothing extra without the tick', async () => {
    const { c, opened } = setup({ email: 'admin@konturia.de' });
    await c.send({ topic: 'bug', message: 'Absturz beim Start', attachLog: true });
    expect(decodeURIComponent(opened[0]!)).toContain('12/1200');
    const plain = setup({ email: 'admin@konturia.de' });
    await plain.c.send({ topic: 'bug', message: 'Absturz beim Start' });
    expect(decodeURIComponent(plain.opened[0]!)).not.toContain('---\n12');
    expect(plain.diagnostics).not.toHaveBeenCalled();
  });
});
