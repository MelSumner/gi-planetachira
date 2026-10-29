import { readCache, writeCache } from './cache.js';
import type { EnkaResponse } from './types.js';

const API = 'https://enka.network/api/uid';
// Enka asks clients to identify themselves.
export const USER_AGENT = 'gi-planetachira/0.1 (+https://github.com/MelSumner/gi-planetachira)';

const ERRORS: Record<number, string> = {
  400: 'Wrong UID format',
  404: 'Player does not exist (MHY server says so)',
  424: 'Game maintenance / everything is broken after an update',
  429: 'Rate-limited by Enka (either by their server or by MHY)',
  500: 'Enka general server error',
  503: 'Enka is temporarily unavailable',
};

export class EnkaError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'EnkaError';
  }
}

export function isValidUid(uid: string): boolean {
  return /^\d{9,10}$/.test(uid);
}

export async function fetchProfile(uid: string, { useCache = true } = {}): Promise<EnkaResponse> {
  if (!isValidUid(uid)) throw new EnkaError(400, `Invalid UID "${uid}"`);

  const cacheKey = `profile-${uid}.json`;
  if (useCache) {
    const cached = await readCache<EnkaResponse>(cacheKey);
    if (cached) return cached;
  }

  const res = await fetch(`${API}/${uid}`, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) {
    throw new EnkaError(res.status, ERRORS[res.status] ?? `Unexpected HTTP ${res.status}`);
  }
  const data = (await res.json()) as EnkaResponse;
  // Honor Enka's ttl so we don't re-request before their cache refreshes.
  await writeCache(cacheKey, data, data.ttl ?? 60);
  return data;
}
