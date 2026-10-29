import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const CACHE_DIR = join(process.cwd(), '.cache');

interface Entry<T> {
  expires: number;
  data: T;
}

export async function readCache<T>(name: string): Promise<T | undefined> {
  try {
    const entry = JSON.parse(await readFile(join(CACHE_DIR, name), 'utf8')) as Entry<T>;
    return entry.expires > Date.now() ? entry.data : undefined;
  } catch {
    return undefined;
  }
}

export async function writeCache<T>(name: string, data: T, ttlSeconds: number): Promise<void> {
  const file = join(CACHE_DIR, name);
  await mkdir(dirname(file), { recursive: true });
  const entry: Entry<T> = { expires: Date.now() + ttlSeconds * 1000, data };
  await writeFile(file, JSON.stringify(entry));
}
