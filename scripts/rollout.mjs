/**
 * Staged rollout for a GitHub release (electron-updater `stagingPercentage`).
 *
 *   node scripts/rollout.mjs 1.15.3 10    offer 1.15.3 to 10 % of the installations
 *   node scripts/rollout.mjs 1.15.3 50    widen the rollout
 *   node scripts/rollout.mjs 1.15.3 100   everyone (removes the limit)
 *   node scripts/rollout.mjs 1.15.3 0     stop: nobody else gets this update
 *
 * Every installation has a stable random id (electron-updater keeps it in the
 * user data), so the same 10 % stay in the rollout as it grows. Edits
 * latest.yml of the release in place with the GitHub CLI (`gh`, logged in).
 * Repo: --repo owner/name, else TODOME_RELEASE_OWNER/TODOME_RELEASE_REPO,
 * else the `origin` remote.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Sets (or, at 100 %, removes) `stagingPercentage` in a latest.yml text. */
export function setStaging(yml, percent) {
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) throw new Error('Prozent: eine ganze Zahl von 0 bis 100.');
  const lines = yml.replace(/\r\n/g, '\n').split('\n').filter((l) => !/^stagingPercentage:/.test(l));
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  if (percent < 100) lines.push(`stagingPercentage: ${percent}`);
  return `${lines.join('\n')}\n`;
}

export function stagingOf(yml) {
  const m = /^stagingPercentage:\s*(\d+)/m.exec(yml);
  return m ? Number(m[1]) : 100;
}

function repoFromArgs(args) {
  const i = args.indexOf('--repo');
  if (i >= 0 && args[i + 1]) return args[i + 1];
  const { TODOME_RELEASE_OWNER: owner, TODOME_RELEASE_REPO: repo } = process.env;
  if (owner && repo) return `${owner}/${repo}`;
  const url = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
  const m = /github\.com[/:]([^/]+)\/(.+?)(\.git)?$/.exec(url);
  if (!m) throw new Error('Repo unbekannt: --repo owner/name angeben.');
  return `${m[1]}/${m[2]}`;
}

function main(argv) {
  const [version, raw] = argv;
  if (!version || raw === undefined) {
    console.log('Aufruf: node scripts/rollout.mjs <version> <prozent> [--repo owner/name]');
    process.exit(1);
  }
  const tag = version.startsWith('v') ? version : `v${version}`;
  const percent = Number(raw);
  const repo = repoFromArgs(argv);
  const dir = mkdtempSync(join(tmpdir(), 'todome-rollout-'));
  try {
    execFileSync('gh', ['release', 'download', tag, '--repo', repo, '--pattern', 'latest.yml', '--dir', dir, '--clobber'], { stdio: 'inherit' });
    const file = join(dir, 'latest.yml');
    const before = readFileSync(file, 'utf8');
    writeFileSync(file, setStaging(before, percent));
    execFileSync('gh', ['release', 'upload', tag, file, '--repo', repo, '--clobber'], { stdio: 'inherit' });
    console.log(`${tag}: Rollout ${stagingOf(before)} % → ${percent} %`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
