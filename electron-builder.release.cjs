'use strict';
/**
 * Release build: signed installer + auto-update channel.
 *
 * Local test builds (`npm run dist`) stay unsigned and have no update channel,
 * so they never offer updates. This file is used only by `npm run release`
 * (locally on Windows or in .github/workflows/release.yml). Secrets come from
 * environment variables, never from the repository.
 *
 * Signing, one of:
 *   A) Azure Artifact Signing (recommended, no USB token, runs in CI):
 *      AZURE_SIGNING_ENDPOINT, AZURE_SIGNING_ACCOUNT, AZURE_SIGNING_PROFILE
 *      + AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET (read by Invoke-TrustedSigning)
 *   B) Classic certificate file (.pfx, e.g. cloud-HSM export or OV/EV via provider tooling):
 *      WIN_CSC_LINK (path or base64), WIN_CSC_KEY_PASSWORD
 * Always:
 *   WIN_PUBLISHER_NAME  exactly the CN of the certificate (electron-updater
 *                       only accepts updates signed by this publisher)
 *   TODOME_RELEASE_OWNER / TODOME_RELEASE_REPO  GitHub repo for the releases
 *   GH_TOKEN            token with write access to that repo's releases
 */
const pkg = require('./package.json');

const env = process.env;
const base = pkg.build;

function need(name) {
  const value = (env[name] || '').trim();
  if (!value) throw new Error(`Release-Build: ${name} fehlt (siehe electron-builder.release.cjs).`);
  return value;
}

function signing() {
  const publisherName = need('WIN_PUBLISHER_NAME');
  if (env.AZURE_SIGNING_ENDPOINT) {
    return {
      azureSignOptions: {
        publisherName,
        endpoint: need('AZURE_SIGNING_ENDPOINT'),
        codeSigningAccountName: need('AZURE_SIGNING_ACCOUNT'),
        certificateProfileName: need('AZURE_SIGNING_PROFILE'),
      },
    };
  }
  if (env.WIN_CSC_LINK || env.CSC_LINK) {
    return {
      signtoolOptions: {
        publisherName,
        // Windows 10/11 only (Electron's own minimum): SHA-256, timestamped,
        // so the signature stays valid after the certificate expires.
        signingHashAlgorithms: ['sha256'],
        rfc3161TimeStampServer: env.WIN_TIMESTAMP_SERVER || 'http://timestamp.digicert.com',
      },
    };
  }
  throw new Error('Release-Build: kein Signier-Weg gesetzt (AZURE_SIGNING_ENDPOINT oder WIN_CSC_LINK).');
}

module.exports = {
  ...base,
  win: {
    ...base.win,
    ...signing(),
  },
  publish: [
    {
      provider: 'github',
      owner: need('TODOME_RELEASE_OWNER'),
      repo: need('TODOME_RELEASE_REPO'),
      // Draft first: test the signed installer, then publish the release by
      // hand. Only published releases reach the installed apps.
      releaseType: 'draft',
    },
  ],
};
