import './config.js';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DEFAULT_UID } from './config.js';
import { getArtifacts, getCharacters, getProfile, getRecommendations, getRoster } from './data.js';
import { isValidUid } from './enka.js';
import { getCookie } from './hoyolab.js';

// Writes a snapshot of every /api route to data/ for the static GitHub Pages site.
// Usage: npm run export [-- <uid>]

const OUT_DIR = join(import.meta.dirname, '..', 'data');

const uid = process.argv[2] ?? process.env.GENSHIN_UID ?? DEFAULT_UID;
if (!isValidUid(uid)) throw new Error(`Invalid UID: ${uid}`);
const cookie = getCookie();
if (!cookie) throw new Error('HOYOLAB_COOKIE is required to export. See .env.example.');

console.log(`Exporting fresh data for UID ${uid}…`);
const [profile, roster, characters, recommendations, artifacts] = await Promise.all([
  getProfile(uid, true),
  getRoster(uid, true),
  getCharacters(uid, true),
  getRecommendations(uid, true),
  getArtifacts(uid, true),
]);
if (!artifacts.builds) throw new Error('Equipped artifacts are unavailable from HoYoLAB.');

const files: Record<string, unknown> = {
  'meta.json': { uid, exportedAt: new Date().toISOString() },
  'profile.json': profile,
  'roster.json': roster,
  'characters.json': characters,
  'recommendations.json': recommendations,
  'artifacts.json': artifacts,
};

// Never publish credentials: refuse to write if any cookie value shows up in the output.
const secrets = cookie
  .split(';')
  .map((part) => part.split('=').slice(1).join('=').trim())
  .filter((v) => v.length >= 6);
const texts = Object.fromEntries(Object.entries(files).map(([name, body]) => [name, `${JSON.stringify(body, null, 2)}\n`]));
for (const [name, text] of Object.entries(texts)) {
  if (secrets.some((s) => text.includes(s))) throw new Error(`Refusing to export: ${name} contains a HoYoLAB cookie value.`);
}

await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });
for (const [name, text] of Object.entries(texts)) await writeFile(join(OUT_DIR, name), text);

console.log(
  `Wrote ${Object.keys(texts).length} files to data/: ${roster.length} characters, ${artifacts.equipped.artifacts?.length ?? 0} equipped artifacts, ${artifacts.inventory?.artifacts.length ?? 0} in inventory.`,
);
