// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

describe('media bridge on locked-down PCs', () => {
  const { createMediaBridge } = require('../../electron/media.cjs');
  const fake = (body: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'todome-media-'));
    const script = join(dir, 'fake.cjs');
    writeFileSync(script, body);
    return { dir, opts: { platform: 'win32', version: '1.11.0', exe: process.execPath, args: () => [script], handshakeMs: 800, log: () => undefined } };
  };
  const READY = `const rl=require('readline').createInterface({input:process.stdin});
console.log(JSON.stringify({id:0,ready:true,session:true}));
rl.on('line',l=>{const r=JSON.parse(l);console.log(JSON.stringify({id:r.id,ok:true,active:true,playing:true,title:'Lied',artist:'Band'}))});`;

  it('answers normally once PowerShell says it is ready', async () => {
    const { dir, opts } = fake(READY);
    const m = createMediaBridge(dir, opts);
    expect(await m.send('info')).toMatchObject({ ok: true, supported: true, active: true, title: 'Lied' });
    expect(m.available).toBe(true);
    m.dispose();
  });

  it('steps aside quietly in Constrained Language Mode and remembers it', async () => {
    const { dir, opts } = fake(`console.log(JSON.stringify({id:0,ready:false,reason:'language-mode'}));process.exit(3);`);
    const m = createMediaBridge(dir, opts);
    expect(await m.send('info')).toEqual({ ok: false, supported: false });
    expect(m.available).toBe(false);
    const saved = JSON.parse(readFileSync(join(dir, 'media-bridge-state.json'), 'utf8'));
    expect(saved).toMatchObject({ reason: 'language-mode', version: '1.11.0' });
    // Next start: no new PowerShell at all.
    const again = createMediaBridge(dir, { ...opts, exe: '/does/not/exist' });
    expect(await again.send('toggle')).toEqual({ ok: false, supported: false });
    // A new app version tries once more.
    expect(createMediaBridge(dir, { ...opts, version: '1.12.0' }).available).toBe(true);
  });

  it('gives up when PowerShell cannot even start (policy, missing)', async () => {
    const { dir, opts } = fake('');
    const m = createMediaBridge(dir, { ...opts, exe: join(dir, 'missing.exe') });
    expect(await m.send('info')).toEqual({ ok: false, supported: false });
    expect(existsSync(join(dir, 'media-bridge-state.json'))).toBe(true);
  });

  it('gives up when a scanner stalls it or kills it twice before it starts', async () => {
    const stall = fake(`setInterval(()=>{},1000);`);
    const m = createMediaBridge(stall.dir, stall.opts);
    expect(await m.send('info')).toEqual({ ok: false, supported: false });
    m.dispose();

    const killed = fake(`process.exit(1);`);
    const k = createMediaBridge(killed.dir, killed.opts);
    expect(await k.send('info')).toMatchObject({ ok: false, supported: true });
    expect(await k.send('info')).toEqual({ ok: false, supported: false });
  });

  it('is simply unsupported outside Windows', async () => {
    const { dir, opts } = fake(READY);
    expect(await createMediaBridge(dir, { ...opts, platform: 'linux' }).send('info')).toEqual({ ok: false, supported: false });
  });
});
