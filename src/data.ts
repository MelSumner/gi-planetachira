import {
  applyOverride,
  assessBuild,
  fromGood,
  fromHoyolab,
  priorityFromHoyolab,
  recommendedNames,
  withFit,
  type RecommendedNames,
  type StatPriority,
} from './artifacts.js';
import { loadAssets, loadRelicLevels, setNames } from './assets.js';
import { toProfile } from './build.js';
import { characterFromHoyolab } from './characters.js';
import { fetchProfile } from './enka.js';
import { HoyolabError, fetchCharacterDetails, fetchRoster, getCookie } from './hoyolab.js';
import { loadInventory } from './inventory.js';
import { loadOverrides } from './priorities.js';

// Data behind the /api routes, shared by the server and the static export.

export function hoyolabMessage(err: unknown): string {
  if (err instanceof HoyolabError) return err.message;
  console.error(err);
  return 'Could not reach HoYoLAB.';
}

export async function getProfile(uid: string, refresh: boolean, lang = 'en') {
  const [raw, assets] = await Promise.all([fetchProfile(uid, { useCache: !refresh }), loadAssets({ lang })]);
  return toProfile(raw, assets);
}

export const getRoster = (uid: string, refresh: boolean) => fetchRoster(uid, { useCache: !refresh });

export async function getCharacters(uid: string, refresh: boolean) {
  return (await fetchCharacterDetails(uid, { useCache: !refresh })).map(characterFromHoyolab);
}

export async function getArtifacts(uid: string, refresh: boolean) {
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
export async function getRecommendations(uid: string, refresh: boolean): Promise<Record<number, RecommendedNames>> {
  const out: Record<number, RecommendedNames> = {};
  const [details, overrides] = await Promise.all([fetchCharacterDetails(uid, { useCache: !refresh }), loadOverrides()]);
  for (const c of details) {
    const p = applyOverride(priorityFromHoyolab(c), overrides[c.base.id]);
    if (p) out[c.base.id] = recommendedNames(p);
  }
  return out;
}
