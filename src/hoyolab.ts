import { createHash, randomBytes } from 'node:crypto';
import { readCache, writeCache } from './cache.js';

// Unofficial HoYoLAB Battle Chronicle API (same endpoints the HoYoLAB website uses).
// Request details mirror genshin.py: https://github.com/seriaati/genshin.py
const RECORD_URL = 'https://sg-public-api.hoyolab.com/event/game_record/genshin/api';
const DS_SALT = '6s25p5ox5y14umn1p61aqyyvbvvl3lrt';
const ROSTER_TTL = 5 * 60;

const SERVERS: [prefix: string, server: string][] = [
  ['18', 'os_asia'],
  ['6', 'os_usa'],
  ['7', 'os_euro'],
  ['8', 'os_asia'],
  ['9', 'os_cht'],
];

const RETCODES: Record<number, string> = {
  10001: 'HoYoLAB cookies are missing or expired. Update HOYOLAB_COOKIE in .env.',
  [-100]: 'HoYoLAB cookies are invalid. Update HOYOLAB_COOKIE in .env.',
  10102: 'Battle Chronicle data is private. Make it public in HoYoLAB → Battle Chronicle settings.',
  10101: 'HoYoLAB rate limit reached. Try again later.',
  1009: 'Character not found or not linked to this HoYoLAB account.',
};

export class HoyolabError extends Error {
  constructor(
    public retcode: number,
    message: string,
  ) {
    super(message);
    this.name = 'HoyolabError';
  }
}

export interface RosterCharacter {
  id: number;
  name: string;
  element: string;
  rarity: number;
  level: number;
  constellation: number;
  friendship: number;
  icon?: string;
  weapon?: { name: string; icon?: string; rarity: number; level: number; refinement: number };
}

interface RawCharacter {
  id: number;
  name: string;
  element: string;
  rarity: number;
  level: number;
  fetter: number;
  actived_constellation_num: number;
  icon?: string;
  side_icon?: string;
  weapon?: { name: string; icon?: string; rarity: number; level: number; affix_level: number };
}

export function getCookie(): string | undefined {
  return process.env.HOYOLAB_COOKIE?.trim() || undefined;
}

export function serverForUid(uid: string): string | undefined {
  return SERVERS.find(([prefix]) => uid.startsWith(prefix))?.[1];
}

export function generateDs(now = Date.now(), random = randomBytes(6).toString('base64url').slice(0, 6)): string {
  const t = Math.floor(now / 1000);
  const hash = createHash('md5').update(`salt=${DS_SALT}&t=${t}&r=${random}`).digest('hex');
  return `${t},${random},${hash}`;
}

export function normalizeRoster(list: RawCharacter[]): RosterCharacter[] {
  return list.map((c) => ({
    id: c.id,
    name: c.name,
    element: c.element,
    // HoYoLAB reports collab 5★ characters (e.g. Aloy) as rarity 105.
    rarity: c.rarity > 5 ? 5 : c.rarity,
    level: c.level,
    constellation: c.actived_constellation_num,
    friendship: c.fetter,
    icon: c.icon,
    weapon: c.weapon && {
      name: c.weapon.name,
      icon: c.weapon.icon,
      rarity: c.weapon.rarity,
      level: c.weapon.level,
      refinement: c.weapon.affix_level,
    },
  }));
}

async function recordRequest<T>(path: string, uid: string, payload: Record<string, unknown>, lang: string): Promise<T> {
  const cookie = getCookie();
  if (!cookie) throw new HoyolabError(10001, RETCODES[10001]!);
  const server = serverForUid(uid);
  if (!server) throw new HoyolabError(0, `Unknown server for UID ${uid}.`);

  const res = await fetch(`${RECORD_URL}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
      Origin: 'https://act.hoyolab.com',
      Referer: 'https://act.hoyolab.com/',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
      'x-rpc-app_version': '1.5.0',
      'x-rpc-client_type': '5',
      'x-rpc-language': lang,
      'x-rpc-lang': lang,
      ds: generateDs(),
    },
    body: JSON.stringify({ role_id: uid, server, ...payload }),
  });
  if (!res.ok) throw new HoyolabError(res.status, `HoYoLAB HTTP ${res.status}`);

  const body = (await res.json()) as { retcode: number; message: string; data: T | null };
  if (body.retcode !== 0 || !body.data) {
    throw new HoyolabError(body.retcode, RETCODES[body.retcode] ?? `HoYoLAB error ${body.retcode}: ${body.message}`);
  }
  return body.data;
}

export async function fetchRoster(uid: string, { useCache = true, lang = 'en-us' } = {}): Promise<RosterCharacter[]> {
  const cacheKey = `roster-${uid}-${lang}.json`;
  if (useCache) {
    const cached = await readCache<RosterCharacter[]>(cacheKey);
    if (cached) return cached;
  }
  const data = await recordRequest<{ list: RawCharacter[] }>('character/list', uid, {}, lang);
  const roster = normalizeRoster(data.list);
  await writeCache(cacheKey, roster, ROSTER_TTL);
  return roster;
}

export interface RawRelicProperty {
  property_type: number;
  value: string;
  times: number;
}

export interface RawRelic {
  id: number;
  name: string;
  icon?: string;
  pos: number;
  rarity: number;
  level: number;
  set: { id: number; name: string };
  main_property: RawRelicProperty;
  sub_property_list: RawRelicProperty[];
}

export interface RawDetailCharacter {
  base: { id: number; name: string };
  relics: RawRelic[];
}

// Full details (incl. equipped artifacts) for every owned character; one request handles all IDs.
export async function fetchCharacterDetails(
  uid: string,
  { useCache = true, lang = 'en-us' } = {},
): Promise<RawDetailCharacter[]> {
  const cacheKey = `details-${uid}-${lang}.json`;
  if (useCache) {
    const cached = await readCache<RawDetailCharacter[]>(cacheKey);
    if (cached) return cached;
  }
  const ids = (await fetchRoster(uid, { useCache, lang })).map((c) => c.id);
  const data = await recordRequest<{ list: RawDetailCharacter[] }>('character/detail', uid, { character_ids: ids }, lang);
  const list = data.list.map((c) => ({ base: { id: c.base.id, name: c.base.name }, relics: c.relics ?? [] }));
  await writeCache(cacheKey, list, ROSTER_TTL);
  return list;
}
