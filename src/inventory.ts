import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isGoodFile, type GoodFile } from './artifacts.js';

const DATA_DIR = join(process.cwd(), '.data');
const FILE = join(DATA_DIR, 'good.json');

export interface StoredInventory {
  importedAt: string;
  file: GoodFile;
}

export async function loadInventory(): Promise<StoredInventory | undefined> {
  try {
    return JSON.parse(await readFile(FILE, 'utf8')) as StoredInventory;
  } catch {
    return undefined;
  }
}

export async function saveInventory(file: unknown): Promise<StoredInventory> {
  if (!isGoodFile(file) || !Array.isArray(file.artifacts)) {
    throw new Error('Not a GOOD file: expected {"format": "GOOD", "artifacts": [...]}.');
  }
  // Keep only what we use; GOOD exports also carry characters/weapons/materials.
  const stored: StoredInventory = {
    importedAt: new Date().toISOString(),
    file: { format: 'GOOD', source: file.source, version: file.version, artifacts: file.artifacts },
  };
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(FILE, JSON.stringify(stored));
  return stored;
}

export async function clearInventory(): Promise<void> {
  await rm(FILE, { force: true });
}
