// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

const root = fileURLToPath(new URL('../../', import.meta.url));

/** Release variables a test must never inherit from the machine or CI (the workflow sets some). */
const RELEASE_ENV = ['TODOME_ALLOW_UNSIGNED', 'WIN_PUBLISHER_NAME', 'AZURE_SIGNING_ENDPOINT', 'AZURE_SIGNING_ACCOUNT', 'AZURE_SIGNING_PROFILE', 'WIN_CSC_LINK', 'CSC_LINK', 'TODOME_RELEASE_OWNER', 'TODOME_RELEASE_REPO'];

/** The release config, loaded fresh with exactly these variables. */
function loadReleaseConfig(env: Record<string, string>) {
  const file = require.resolve('../../electron-builder.release.cjs');
  const saved = { ...process.env };
  for (const k of RELEASE_ENV) delete process.env[k];
  Object.assign(process.env, env);
  delete require.cache[file];
  try {
    return require(file);
  } finally {
    for (const k of [...RELEASE_ENV, ...Object.keys(env)]) delete process.env[k];
    Object.assign(process.env, saved);
    delete require.cache[file];
  }
}

describe('release guard', () => {
  const run = (env: Record<string, string>) => {
    try {
      execFileSync(process.execPath, ['scripts/check-release.mjs'], { cwd: root, env: { PATH: process.env.PATH ?? '', ...env }, stdio: 'pipe' });
      return { ok: true, out: '' };
    } catch (e) {
      return { ok: false, out: String((e as { stderr?: Buffer }).stderr ?? '') };
    }
  };

  it('refuses a release without signing and update channel', () => {
    const r = run({});
    expect(r.ok).toBe(false);
    expect(r.out).toContain('WIN_CSC_LINK');
    expect(r.out).toContain('TODOME_ALLOW_UNSIGNED');
    expect(r.out).toContain('TODOME_RELEASE_REPO');
  });

  const updates = { TODOME_RELEASE_OWNER: 'm4liwan', TODOME_RELEASE_REPO: 'todome-web', GH_TOKEN: 'token' };

  it('lets an unsigned release through only when it is allowed on purpose', () => {
    expect(run(updates).ok).toBe(false);
    expect(run({ ...updates, TODOME_ALLOW_UNSIGNED: 'true' }).ok).toBe(true);
  });

  it('still wants the publisher name as soon as there is a certificate', () => {
    const r = run({ ...updates, TODOME_ALLOW_UNSIGNED: 'true', WIN_CSC_LINK: 'cert.pfx', WIN_CSC_KEY_PASSWORD: 'x' });
    expect(r.ok).toBe(false);
    expect(r.out).toContain('WIN_PUBLISHER_NAME');
  });

  it('builds the signed release config from the environment', () => {
    const load = loadReleaseConfig;
    const channel = { WIN_PUBLISHER_NAME: 'Konturia GmbH', TODOME_RELEASE_OWNER: 'konturia', TODOME_RELEASE_REPO: 'todome-releases' };
    const azure = load({
      ...channel,
      AZURE_SIGNING_ENDPOINT: 'https://weu.codesigning.azure.net',
      AZURE_SIGNING_ACCOUNT: 'konturia',
      AZURE_SIGNING_PROFILE: 'todome',
    });
    expect(azure.win.azureSignOptions).toEqual({
      publisherName: 'Konturia GmbH',
      endpoint: 'https://weu.codesigning.azure.net',
      codeSigningAccountName: 'konturia',
      certificateProfileName: 'todome',
    });
    expect(azure.win.target).toBeDefined();
    expect(azure.publish[0]).toMatchObject({ provider: 'github', owner: 'konturia', repo: 'todome-releases' });
    const pfx = load({ ...channel, WIN_CSC_LINK: 'cert.pfx' });
    expect(pfx.win.signtoolOptions.publisherName).toBe('Konturia GmbH');
    expect(pfx.win.signtoolOptions.signingHashAlgorithms).toEqual(['sha256']);
    expect(() => load(channel)).toThrow(/kein Signier-Weg/);
  });

  it('builds an unsigned release without any publisher, so electron-updater accepts its updates', () => {
    const config = loadReleaseConfig({ WIN_PUBLISHER_NAME: 'Rocco Hanke', TODOME_ALLOW_UNSIGNED: 'true', TODOME_RELEASE_OWNER: 'm4liwan', TODOME_RELEASE_REPO: 'todome-web' });
    expect(JSON.stringify(config.win)).not.toMatch(/publisherName|signtoolOptions|azureSignOptions/);
    expect(config.publish[0]).toMatchObject({ provider: 'github', owner: 'm4liwan', repo: 'todome-web', releaseType: 'draft' });
  });
});
