import type { RelicLevels } from './artifacts.js';
import { readCache, writeCache } from './cache.js';
import { USER_AGENT } from './enka.js';
import type { Assets, AvatarAsset } from './types.js';

// The top-level store/*.json files are outdated; store/gi/ is the maintained set.
const STORE = 'https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/gi';
const ASSET_TTL = 24 * 60 * 60;

async function getJson<T>(file: string, refresh: boolean): Promise<T> {
  const key = `assets/${file}`;
  if (!refresh) {
    const cached = await readCache<T>(key);
    if (cached) return cached;
  }
  const res = await fetch(`${STORE}/${file}`, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Failed to download ${file}: HTTP ${res.status}`);
  const data = (await res.json()) as T;
  await writeCache(key, data, ASSET_TTL);
  return data;
}

export async function loadAssets({ lang = 'en', refresh = false } = {}): Promise<Assets> {
  const [avatars, relics, locs] = await Promise.all([
    getJson<Record<string, AvatarAsset>>('avatars.json', refresh),
    getJson<{ Sets: Record<string, { Name: string }> }>('relics.json', refresh),
    getJson<Record<string, Record<string, string>>>('locs.json', refresh),
  ]);
  return { avatars, relicSets: relics.Sets, loc: locs[lang] ?? locs.en ?? {} };
}

export async function loadRelicLevels(refresh = false): Promise<RelicLevels> {
  return getJson<RelicLevels>('relic_levels.json', refresh);
}

/** Enka setId → set name (English by default). */
export function setNames(assets: Assets): Record<string, string> {
  return Object.fromEntries(
    Object.entries(assets.relicSets).flatMap(([id, s]) => {
      const name = assets.loc[s.Name];
      return name ? [[id, name]] : [];
    }),
  );
}
