import type { RawDetailCharacter, RawRecommendedProperties } from './hoyolab.js';

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
  /** How well this artifact suits the character wearing it (set when the character has stat recommendations). */
  fit?: ArtifactFit;
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

// Highest single 5-star substat roll per prop type. Each roll is 70/80/90/100% of this.
const MAX_SUB_ROLL: Record<number, number> = {
  2: 298.75, 3: 5.83, 5: 19.45, 6: 5.83, 8: 23.15, 9: 7.29, 20: 3.89, 22: 7.77, 23: 6.48, 28: 23.31,
};
// Lower-rarity rolls (and so their value) scale down from 5-star.
const RARITY_ROLL_SCALE: Record<number, number> = { 5: 1, 4: 0.8, 3: 0.6, 2: 0.4, 1: 0.2 };
// Upgrades per rarity: one substat roll every 4 levels up to max level.
const MAX_LEVEL: Record<number, number> = { 5: 20, 4: 16, 3: 12, 2: 4, 1: 4 };

/** Smallest roll count that can produce `value` (GOOD files don't record rolls). */
export function estimateRolls(type: number, value: number, rarity: number): number | undefined {
  const max = MAX_SUB_ROLL[type];
  if (!max) return undefined;
  // Small tolerance because displayed values are rounded.
  return Math.max(1, Math.ceil(value / (max * (RARITY_ROLL_SCALE[rarity] ?? 1)) - 0.05));
}

export const statName = (type: number) => PROPS[type]?.[0] ?? `Stat ${type}`;

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
      .map((s) => stat(GOOD_STATS[s.key]!, s.value, estimateRolls(GOOD_STATS[s.key]!, s.value, a.rarity)));
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

export interface StatPriority {
  Sands: number[];
  Goblet: number[];
  Circlet: number[];
  subs: number[];
  /** hoyolab: HoYoLAB's default; hoyolab-custom: set by the player on HoYoLAB; mine: chosen in this app. */
  source: PrioritySource;
}

export type PrioritySource = 'hoyolab' | 'hoyolab-custom' | 'mine';

/** Substats that can be chosen as desired. Flat HP/ATK/DEF are left out: they're never worth prioritizing. */
export const SUBSTAT_CHOICES = [6, 3, 9, 20, 22, 23, 28] as const;
export const MAX_DESIRED_SUBS = 4;

/** The player's own choice of desired substats for a character, saved locally. */
export interface PriorityOverride {
  subs: number[];
}

export function isValidOverride(o: unknown): o is PriorityOverride {
  if (!o || typeof o !== 'object' || !Array.isArray((o as PriorityOverride).subs)) return false;
  const subs = (o as PriorityOverride).subs;
  return (
    subs.length >= 1 &&
    subs.length <= MAX_DESIRED_SUBS &&
    new Set(subs).size === subs.length &&
    subs.every((t) => (SUBSTAT_CHOICES as readonly unknown[]).includes(t))
  );
}

/** Main stats still come from HoYoLAB; only the substats are replaced. */
export function applyOverride(p: StatPriority | undefined, o: PriorityOverride | undefined): StatPriority | undefined {
  if (!o) return p;
  return { Sands: p?.Sands ?? [], Goblet: p?.Goblet ?? [], Circlet: p?.Circlet ?? [], subs: [...o.subs], source: 'mine' };
}

/** HoYoLAB's per-character stat recommendation, preferring the player's own customization. */
export function priorityFromHoyolab(c: RawDetailCharacter): StatPriority | undefined {
  const rec = c.recommend_relic_property;
  const hasAny = (p: RawRecommendedProperties | null | undefined): p is RawRecommendedProperties =>
    Boolean(p && [p.sand_main_property_list, p.goblet_main_property_list, p.circlet_main_property_list, p.sub_property_list].some((l) => l?.length));
  const custom = hasAny(rec?.custom_properties);
  const p = custom ? rec?.custom_properties : rec?.recommend_properties;
  if (!hasAny(p)) return undefined;
  return {
    Sands: p.sand_main_property_list ?? [],
    Goblet: p.goblet_main_property_list ?? [],
    Circlet: p.circlet_main_property_list ?? [],
    subs: p.sub_property_list ?? [],
    source: custom ? 'hoyolab-custom' : 'hoyolab',
  };
}

export interface ArtifactFit {
  /** null for Flower/Plume (fixed main stat) or when nothing is recommended for the slot. */
  mainOk: boolean | null;
  usefulRolls: number;
  /** Useful rolls a strong max-level 5-star piece has, given how many substats are recommended. */
  targetRolls: number;
  /** 0–1 against that target. null when no recommended substat can appear on this piece. */
  score: number | null;
  /** Right main stat and every desired substat it can have. Needs 4 desired substats to be chosen. */
  perfect: boolean;
  /** Distinct desired substats on the piece, and how many it could have. */
  desiredHit: number;
  desiredMax: number;
}

// A +20 5-star piece has 8–9 substat rolls. With fewer useful substat types, fewer rolls can realistically
// land on them, so the target scales with how many are recommended (index = number of useful types).
export const TARGET_ROLLS = [0, 4, 6, 7, 8];

const MAIN_SLOTS = ['Sands', 'Goblet', 'Circlet'] as const;
const isMainSlot = (slot: Slot): slot is (typeof MAIN_SLOTS)[number] => (MAIN_SLOTS as readonly string[]).includes(slot);

/** CRIT Rate and CRIT DMG circlets are interchangeable (which is better depends on crit ratio). */
function acceptedMains(slot: (typeof MAIN_SLOTS)[number], p: StatPriority): number[] {
  const list = p[slot];
  return slot === 'Circlet' && (list.includes(20) || list.includes(22)) ? [...new Set([...list, 20, 22])] : list;
}

export function assessArtifact(a: InventoryArtifact, p: StatPriority): ArtifactFit {
  const wanted = isMainSlot(a.slot) ? acceptedMains(a.slot, p) : [];
  const mainOk = wanted.length ? wanted.includes(a.main.type) : null;
  // A substat can never match the main stat, so those can't count toward the ideal.
  const subTypes = p.subs.filter((t) => t !== a.main.type);
  const targetRolls = TARGET_ROLLS[Math.min(subTypes.length, 4)] ?? 0;
  const usefulRolls = a.subs.filter((s) => subTypes.includes(s.type)).reduce((n, s) => n + (s.rolls ?? 1), 0);
  const worth = RARITY_ROLL_SCALE[a.rarity] ?? 1;
  const score = targetRolls ? Math.min(1, (usefulRolls * worth) / targetRolls) : null;
  const desiredMax = Math.min(subTypes.length, 4);
  const desiredHit = new Set(a.subs.filter((s) => subTypes.includes(s.type)).map((s) => s.type)).size;
  // With fewer than 4 desired substats, almost anything would count as perfect.
  const perfect = p.subs.length >= MAX_DESIRED_SUBS && mainOk !== false && desiredHit >= desiredMax;
  return { mainOk, usefulRolls, targetRolls, score, perfect, desiredHit, desiredMax };
}

export type Grade = 'Great' | 'Good' | 'Needs work' | 'Poor';

export interface BuildCheck {
  character: string;
  /** Avatar ID (shared by HoYoLAB and Enka). */
  id?: number;
  priority?: StatPriority;
  /** Recommended stats by name, for display. */
  recommended?: RecommendedNames;
  /** 0–1 average artifact score (empty slots count as 0). */
  score: number | null;
  grade: Grade | null;
  pieces: number;
  mainOk: number;
  mainTotal: number;
  usefulRolls: number;
  targetRolls: number;
  /** Equipped pieces that are perfect for this character. */
  perfect: number;
  issues: string[];
}

export interface RecommendedNames {
  Sands: string[];
  Goblet: string[];
  Circlet: string[];
  subs: string[];
  source: PrioritySource;
}

export function recommendedNames(p: StatPriority): RecommendedNames {
  // Circlets list both crit stats when either is recommended, matching how pieces are judged.
  return {
    Sands: p.Sands.map(statName),
    Goblet: p.Goblet.map(statName),
    Circlet: acceptedMains('Circlet', p).map(statName),
    subs: p.subs.map(statName),
    source: p.source,
  };
}

export const GRADE_THRESHOLDS: [Grade, number][] = [
  ['Great', 0.6],
  ['Good', 0.45],
  ['Needs work', 0.3],
  ['Poor', 0],
];

export function assessBuild(character: string, artifacts: InventoryArtifact[], p: StatPriority | undefined, id?: number): BuildCheck {
  const base = { character, id, pieces: artifacts.length, mainOk: 0, mainTotal: 0, usefulRolls: 0, targetRolls: 0, perfect: 0 };
  if (!p) return { ...base, score: null, grade: null, issues: ['HoYoLAB has no stat recommendation for this character.'] };
  const recommended = recommendedNames(p);
  // Unbuilt characters aren't graded, so they don't crowd out characters that are actually in use.
  if (!artifacts.length) return { ...base, priority: p, recommended, score: null, grade: null, issues: ['No artifacts equipped.'] };

  const issues: string[] = [];
  let total = 0;
  // Pieces whose main stat already covers every recommended substat have nothing to judge, so they're skipped.
  let judged = 0;
  let blocking = false;
  for (const slot of POS_SLOTS) {
    if (isMainSlot(slot) && p[slot].length) base.mainTotal++;
    const a = artifacts.find((x) => x.slot === slot);
    if (!a) {
      issues.push(`No ${slot} equipped.`);
      blocking = true;
      judged++;
      continue;
    }
    const fit = assessArtifact(a, p);
    base.usefulRolls += fit.usefulRolls;
    base.targetRolls += fit.targetRolls;
    if (fit.score !== null) {
      total += fit.score;
      judged++;
    }
    if (fit.mainOk === true) base.mainOk++;
    if (fit.perfect) base.perfect++;
    if (fit.mainOk === false) blocking = true;
    if (a.rarity < 5) issues.push(`${slot} is ${a.rarity}-star.`);
    else if (a.level < (MAX_LEVEL[a.rarity] ?? 20)) issues.push(`${slot} is only +${a.level}.`);
    if (fit.score !== null && fit.score < 0.3) {
      issues.push(`${slot} has ${fit.usefulRolls} useful substat ${fit.usefulRolls === 1 ? 'roll' : 'rolls'} (strong: about ${fit.targetRolls}).`);
    }
  }

  const score = judged ? total / judged : base.mainTotal ? base.mainOk / base.mainTotal : 1;
  let grade = GRADE_THRESHOLDS.find(([, min]) => score >= min)![0];
  // A missing piece or wrong main stat costs more than any substat, so cap the grade.
  if (blocking && (grade === 'Great' || grade === 'Good')) grade = 'Needs work';
  return { ...base, priority: p, recommended, score: Math.round(score * 1000) / 1000, grade, issues };
}

/** Attach fit to every artifact worn by a character with a recommendation. */
export function withFit(artifacts: InventoryArtifact[], priorities: Map<string, StatPriority>): InventoryArtifact[] {
  return artifacts.map((a) => {
    const p = a.location ? priorities.get(a.location) : undefined;
    return p ? { ...a, fit: assessArtifact(a, p) } : a;
  });
}
