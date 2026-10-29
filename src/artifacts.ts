import type { RawDetailCharacter } from './hoyolab.js';

export type Slot = 'Flower' | 'Plume' | 'Sands' | 'Goblet' | 'Circlet';

export interface ArtifactStat {
  type: number;
  name: string;
  value: number;
  percent: boolean;
  /** Times this substat was rolled (1 = initial roll only). */
  rolls?: number;
}

export interface InventoryArtifact {
  id: string;
  set: string;
  slot: Slot;
  rarity: number;
  level: number;
  main: ArtifactStat;
  subs: ArtifactStat[];
  location?: string;
  locked?: boolean;
  icon?: string;
  critValue: number;
}

/** relic_levels.json: [rarity][level + 1][propType] → value (percent stats as fractions). */
export type RelicLevels = Record<string, Record<string, Record<string, number>>>;

// Prop type IDs shared by HoYoLAB property_type and Enka relic_levels.json.
const PROPS: Record<number, [name: string, percent: boolean]> = {
  2: ['HP', false],
  3: ['HP%', true],
  5: ['ATK', false],
  6: ['ATK%', true],
  8: ['DEF', false],
  9: ['DEF%', true],
  20: ['CRIT Rate', true],
  22: ['CRIT DMG', true],
  23: ['Energy Recharge', true],
  26: ['Healing Bonus', true],
  28: ['Elemental Mastery', false],
  30: ['Physical DMG Bonus', true],
  40: ['Pyro DMG Bonus', true],
  41: ['Electro DMG Bonus', true],
  42: ['Hydro DMG Bonus', true],
  43: ['Dendro DMG Bonus', true],
  44: ['Anemo DMG Bonus', true],
  45: ['Geo DMG Bonus', true],
  46: ['Cryo DMG Bonus', true],
};

// GOOD (Genshin Open Object Description) stat keys → prop type.
// Spec: https://frzyc.github.io/genshin-optimizer/#/doc
const GOOD_STATS: Record<string, number> = {
  hp: 2,
  hp_: 3,
  atk: 5,
  atk_: 6,
  def: 8,
  def_: 9,
  critRate_: 20,
  critDMG_: 22,
  enerRech_: 23,
  heal_: 26,
  eleMas: 28,
  physical_dmg_: 30,
  pyro_dmg_: 40,
  electro_dmg_: 41,
  hydro_dmg_: 42,
  dendro_dmg_: 43,
  anemo_dmg_: 44,
  geo_dmg_: 45,
  cryo_dmg_: 46,
};

const POS_SLOTS: Slot[] = ['Flower', 'Plume', 'Sands', 'Goblet', 'Circlet'];
const GOOD_SLOTS: Record<string, Slot> = { flower: 'Flower', plume: 'Plume', sands: 'Sands', goblet: 'Goblet', circlet: 'Circlet' };
// Enka icon suffix per slot: UI_RelicIcon_<setId>_<n>
const ICON_SUFFIX: Record<Slot, number> = { Flower: 4, Plume: 2, Sands: 5, Goblet: 1, Circlet: 3 };

function stat(type: number, value: number, rolls?: number): ArtifactStat {
  const [name, percent] = PROPS[type] ?? [`Stat ${type}`, false];
  return { type, name, value, percent, ...(rolls !== undefined && { rolls }) };
}

export function critValue(subs: ArtifactStat[]): number {
  const cv = subs.reduce((sum, s) => sum + (s.type === 20 ? s.value * 2 : s.type === 22 ? s.value : 0), 0);
  return Math.round(cv * 10) / 10;
}

/** GOOD-style key: "Tenacity of the Millelith" → "TenacityOfTheMillelith". */
export function goodKey(name: string): string {
  return name
    .replace(/[^A-Za-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join('');
}

const splitCamel = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2');

export function fromHoyolab(characters: RawDetailCharacter[]): InventoryArtifact[] {
  return characters.flatMap((c) =>
    c.relics.map((r) => {
      const subs = r.sub_property_list.map((s) => stat(s.property_type, parseFloat(s.value), s.times + 1));
      return {
        id: `hoyolab-${c.base.id}-${r.pos}`,
        set: r.set.name,
        slot: POS_SLOTS[r.pos - 1] ?? 'Flower',
        rarity: r.rarity,
        level: r.level,
        main: stat(r.main_property.property_type, parseFloat(r.main_property.value)),
        subs,
        location: c.base.name,
        icon: r.icon,
        critValue: critValue(subs),
      };
    }),
  );
}

export interface GoodArtifact {
  setKey: string;
  slotKey: string;
  level: number;
  rarity: number;
  mainStatKey: string;
  location?: string;
  lock?: boolean;
  substats?: { key: string; value: number }[];
}

export interface GoodFile {
  format: 'GOOD';
  source?: string;
  version?: number;
  artifacts?: GoodArtifact[];
}

export interface GoodContext {
  relicLevels: RelicLevels;
  /** Enka setId → English set name. */
  setNames: Record<string, string>;
  /** Owned character names, used to resolve GOOD location keys. */
  characterNames?: string[];
}

export function isGoodFile(value: unknown): value is GoodFile {
  return typeof value === 'object' && value !== null && (value as GoodFile).format === 'GOOD';
}

export function fromGood(file: GoodFile, ctx: GoodContext): InventoryArtifact[] {
  const sets = new Map(Object.entries(ctx.setNames).map(([id, name]) => [goodKey(name), { id, name }]));
  const chars = new Map((ctx.characterNames ?? []).map((n) => [goodKey(n), n]));

  return (file.artifacts ?? []).flatMap((a, i) => {
    const slot = GOOD_SLOTS[a.slotKey];
    const mainType = GOOD_STATS[a.mainStatKey];
    if (!slot || mainType === undefined) return [];

    // GOOD omits main-stat values; derive them from rarity + level.
    const raw = ctx.relicLevels[String(a.rarity)]?.[String(a.level + 1)]?.[String(mainType)] ?? 0;
    const percent = PROPS[mainType]?.[1] ?? false;
    const mainValue = percent ? Math.round(raw * 1000) / 10 : Math.round(raw);

    const subs = (a.substats ?? [])
      .filter((s) => s.key && GOOD_STATS[s.key] !== undefined)
      .map((s) => stat(GOOD_STATS[s.key]!, s.value));
    const set = sets.get(a.setKey);

    return [
      {
        id: `good-${i}`,
        set: set?.name ?? splitCamel(a.setKey),
        slot,
        rarity: a.rarity,
        level: a.level,
        main: stat(mainType, mainValue),
        subs,
        location: a.location ? (chars.get(a.location) ?? splitCamel(a.location)) : undefined,
        locked: a.lock,
        icon: set ? `https://enka.network/ui/UI_RelicIcon_${set.id}_${ICON_SUFFIX[slot]}.png` : undefined,
        critValue: critValue(subs),
      },
    ];
  });
}
