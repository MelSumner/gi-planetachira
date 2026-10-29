import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  applyOverride,
  assessBuild,
  fromGood,
  fromHoyolab,
  isValidOverride,
  priorityFromHoyolab,
  recommendedNames,
  withFit,
  type RecommendedNames,
  type StatPriority,
} from './artifacts.js';
import { loadAssets, loadRelicLevels, setNames } from './assets.js';
import { toProfile } from './build.js';
import { characterFromHoyolab } from './characters.js';
import { DEFAULT_UID } from './config.js';
import { EnkaError, fetchProfile, isValidUid } from './enka.js';
import { HoyolabError, fetchCharacterDetails, fetchRoster, getCookie } from './hoyolab.js';
import { clearInventory, loadInventory, saveInventory } from './inventory.js';
import { loadOverrides, setOverride } from './priorities.js';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '127.0.0.1';
const PUBLIC_DIR = join(import.meta.dirname, '..', 'public');
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

// Whitelist instead of mapping URL paths to the filesystem.
const STATIC: Record<string, [file: string, type: string]> = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/artifacts': ['artifacts.html', 'text/html; charset=utf-8'],
  '/builds': ['builds.html', 'text/html; charset=utf-8'],
  '/builds.js': ['builds.js', 'text/javascript; charset=utf-8'],
  '/character': ['character.html', 'text/html; charset=utf-8'],
  '/character.js': ['character.js', 'text/javascript; charset=utf-8'],
  '/character-view.js': ['character-view.js', 'text/javascript; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/artifacts.js': ['artifacts.js', 'text/javascript; charset=utf-8'],
  '/lib.js': ['lib.js', 'text/javascript; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
};

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function hoyolabMessage(err: unknown): string {
  if (err instanceof HoyolabError) return err.message;
  console.error(err);
  return 'Could not reach HoYoLAB.';
}

// Block cross-site writes: browsers can't send application/json cross-origin without a
// CORS preflight (which we never approve), and any Origin header must be this server.
function isSameOriginJson(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  const sameOrigin = !origin || origin === `http://${req.headers.host}`;
  return sameOrigin && (req.headers['content-type'] ?? '').startsWith('application/json');
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_UPLOAD_BYTES) throw new Error('File too large (max 20 MB).');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function getArtifacts(uid: string, refresh: boolean) {
  const [assets, relicLevels, stored, overrides, details] = await Promise.all([
    loadAssets(),
    loadRelicLevels(),
    loadInventory(),
    loadOverrides(),
    getCookie()
      ? fetchCharacterDetails(uid, { useCache: !refresh }).then(
          (list) => ({ list }),
          (err: unknown) => ({ error: hoyolabMessage(err) }),
        )
      : Promise.resolve({ error: 'HOYOLAB_COOKIE is not configured. See .env.example.' }),
  ]);

  const characters = 'list' in details ? details.list : [];
  const priorities = new Map<string, StatPriority>();
  for (const c of characters) {
    const p = applyOverride(priorityFromHoyolab(c), overrides[c.base.id]);
    if (p) priorities.set(c.base.name, p);
  }

  const equippedList = 'list' in details ? withFit(fromHoyolab(characters), priorities) : null;
  const equipped = equippedList ? { artifacts: equippedList } : { error: (details as { error: string }).error };
  const inventory = stored
    ? {
        importedAt: stored.importedAt,
        source: stored.file.source,
        artifacts: withFit(
          fromGood(stored.file, {
            relicLevels,
            setNames: setNames(assets),
            characterNames: characters.map((c) => c.base.name),
          }),
          priorities,
        ),
      }
    : null;
  const builds = equippedList
    ? characters.map((c) => assessBuild(c.base.name, equippedList.filter((a) => a.location === c.base.name), priorities.get(c.base.name), c.base.id))
    : null;
  return { equipped, inventory, builds };
}

/** Recommended artifact stats by avatar ID (same IDs as Enka), for highlighting showcase builds. */
async function getRecommendations(uid: string, refresh: boolean): Promise<Record<number, RecommendedNames>> {
  const out: Record<number, RecommendedNames> = {};
  const [details, overrides] = await Promise.all([fetchCharacterDetails(uid, { useCache: !refresh }), loadOverrides()]);
  for (const c of details) {
    const p = applyOverride(priorityFromHoyolab(c), overrides[c.base.id]);
    if (p) out[c.base.id] = recommendedNames(p);
  }
  return out;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (url.pathname === '/api/inventory') {
    if (req.method !== 'POST' && req.method !== 'DELETE') return sendJson(res, 405, { error: 'Method not allowed' });
    if (!isSameOriginJson(req)) return sendJson(res, 403, { error: 'Forbidden' });
    if (req.method === 'DELETE') {
      await clearInventory();
      return sendJson(res, 200, { ok: true });
    }
    try {
      const stored = await saveInventory(JSON.parse(await readBody(req)));
      return sendJson(res, 200, { importedAt: stored.importedAt, count: stored.file.artifacts?.length ?? 0 });
    } catch (err) {
      const message = err instanceof SyntaxError ? 'File is not valid JSON.' : err instanceof Error ? err.message : String(err);
      return sendJson(res, 400, { error: message });
    }
  }

  const priorityMatch = url.pathname.match(/^\/api\/priorities\/(\d{1,9})$/);
  if (priorityMatch) {
    if (req.method !== 'PUT' && req.method !== 'DELETE') return sendJson(res, 405, { error: 'Method not allowed' });
    if (!isSameOriginJson(req)) return sendJson(res, 403, { error: 'Forbidden' });
    const id = Number(priorityMatch[1]);
    if (req.method === 'DELETE') {
      await setOverride(id, undefined);
      return sendJson(res, 200, { ok: true });
    }
    let body: unknown;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return sendJson(res, 400, { error: 'Body is not valid JSON.' });
    }
    if (!isValidOverride(body)) return sendJson(res, 400, { error: 'Choose 1 to 4 different substats.' });
    await setOverride(id, body);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });

  if (url.pathname === '/api/config') {
    return sendJson(res, 200, { defaultUid: process.env.GENSHIN_UID ?? DEFAULT_UID, rosterEnabled: Boolean(getCookie()) });
  }

  const [, route, rawUid] = url.pathname.match(/^\/api\/(profile|roster|artifacts|recommendations|characters)\/([^/]+)$/) ?? [];
  if (route && rawUid !== undefined) {
    const uid = decodeURIComponent(rawUid);
    if (!isValidUid(uid)) return sendJson(res, 400, { error: 'UID must be 9–10 digits.' });
    const refresh = url.searchParams.has('refresh');

    if (route === 'artifacts') return sendJson(res, 200, await getArtifacts(uid, refresh));

    if (route === 'recommendations') {
      if (!getCookie()) return sendJson(res, 501, { error: 'HOYOLAB_COOKIE is not configured. See .env.example.' });
      try {
        return sendJson(res, 200, await getRecommendations(uid, refresh));
      } catch (err) {
        return sendJson(res, 502, { error: hoyolabMessage(err) });
      }
    }

    if (route === 'characters') {
      if (!getCookie()) return sendJson(res, 501, { error: 'HOYOLAB_COOKIE is not configured. See .env.example.' });
      try {
        return sendJson(res, 200, (await fetchCharacterDetails(uid, { useCache: !refresh })).map(characterFromHoyolab));
      } catch (err) {
        return sendJson(res, 502, { error: hoyolabMessage(err) });
      }
    }

    if (route === 'roster') {
      if (!getCookie()) return sendJson(res, 501, { error: 'HOYOLAB_COOKIE is not configured. See .env.example.' });
      try {
        return sendJson(res, 200, await fetchRoster(uid, { useCache: !refresh }));
      } catch (err) {
        return sendJson(res, 502, { error: hoyolabMessage(err) });
      }
    }

    try {
      const [raw, assets] = await Promise.all([
        fetchProfile(uid, { useCache: !refresh }),
        loadAssets({ lang: url.searchParams.get('lang') ?? 'en' }),
      ]);
      return sendJson(res, 200, toProfile(raw, assets));
    } catch (err) {
      if (err instanceof EnkaError) return sendJson(res, err.status, { error: err.message });
      console.error(err);
      return sendJson(res, 502, { error: 'Could not reach Enka.Network.' });
    }
  }

  const entry = STATIC[url.pathname];
  if (entry) {
    const [file, type] = entry;
    res.writeHead(200, { 'Content-Type': type });
    return res.end(await readFile(join(PUBLIC_DIR, file)));
  }

  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, HOST, () => {
  console.log(`gi-planetachira running at http://${HOST}:${PORT}`);
});
