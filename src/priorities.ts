import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isValidOverride, type PriorityOverride } from './artifacts.js';

const DATA_DIR = join(process.cwd(), '.data');
const FILE = join(DATA_DIR, 'priorities.json');

/** Desired substats chosen in this app, keyed by avatar ID. */
export type PriorityOverrides = Record<string, PriorityOverride>;

export async function loadOverrides(): Promise<PriorityOverrides> {
  try {
    const data = JSON.parse(await readFile(FILE, 'utf8')) as PriorityOverrides;
    return Object.fromEntries(Object.entries(data).filter(([, o]) => isValidOverride(o)));
  } catch {
    return {};
  }
}

/** Save (or with `undefined`, remove) one character's override. */
export async function setOverride(id: number, override: PriorityOverride | undefined): Promise<void> {
  const all = await loadOverrides();
  if (override) all[id] = { subs: [...override.subs] };
  else delete all[id];
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(FILE, JSON.stringify(all, null, 2));
}
