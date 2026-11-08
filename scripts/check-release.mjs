#!/usr/bin/env node
/**
 * Stops `npm run release` before anything is built when something a public
 * release needs is missing: operator data for Impressum/Datenschutz, signing
 * and the update channel. Lists every gap at once.
 */
import { readFileSync } from 'node:fs';

const legal = JSON.parse(readFileSync(new URL('../src/domain/legal.json', import.meta.url), 'utf8'));
const env = process.env;
const has = (k) => Boolean((env[k] || '').trim());
const gaps = [];

const kind = legal.operator.kind === 'company' ? 'company' : 'person';
for (const field of legal.required[kind]) {
  if (!String(legal.operator[field] ?? '').trim()) gaps.push(`Impressum/Datenschutz: "${field}" in src/domain/legal.json ausfüllen`);
}

const allowUnsigned = /^(1|true|yes)$/i.test((env.TODOME_ALLOW_UNSIGNED || '').trim());
const signed = has('AZURE_SIGNING_ENDPOINT') || has('WIN_CSC_LINK') || has('CSC_LINK');
if (signed && !has('WIN_PUBLISHER_NAME')) gaps.push('Signatur: WIN_PUBLISHER_NAME (exakt der CN des Zertifikats)');
if (has('AZURE_SIGNING_ENDPOINT')) {
  for (const k of ['AZURE_SIGNING_ACCOUNT', 'AZURE_SIGNING_PROFILE', 'AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET']) {
    if (!has(k)) gaps.push(`Signatur (Azure): ${k}`);
  }
  if (process.platform !== 'win32') gaps.push('Signatur (Azure): läuft nur auf Windows (lokal oder im GitHub-Workflow)');
} else if (has('WIN_CSC_LINK') || has('CSC_LINK')) {
  if (!has('WIN_CSC_KEY_PASSWORD') && !has('CSC_KEY_PASSWORD')) gaps.push('Signatur (Zertifikat): WIN_CSC_KEY_PASSWORD');
} else if (!allowUnsigned) {
  gaps.push('Signatur: AZURE_SIGNING_ENDPOINT (Azure Artifact Signing) oder WIN_CSC_LINK (Zertifikatsdatei), oder bewusst TODOME_ALLOW_UNSIGNED=true');
}

for (const k of ['TODOME_RELEASE_OWNER', 'TODOME_RELEASE_REPO', 'GH_TOKEN']) {
  if (!has(k)) gaps.push(`Updates: ${k}`);
}

if (gaps.length) {
  console.error(`\nRelease gestoppt, ${gaps.length} offene Punkte:\n`);
  for (const g of gaps) console.error(`  - ${g}`);
  console.error('');
  process.exit(1);
}
if (!signed) {
  console.warn('Hinweis: Release wird UNSIGNIERT gebaut (TODOME_ALLOW_UNSIGNED). Windows zeigt beim Installieren eine SmartScreen-Warnung; Updates werden nur per SHA-512 geprüft, nicht per Herausgeber-Signatur.');
}
console.log('Release-Prüfung bestanden.');
