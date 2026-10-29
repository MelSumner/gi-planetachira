import type { Assets, AvatarInfo, EnkaResponse, Equip, Stat } from './types.js';

export interface StatLine {
  name: string;
  value: number;
  percent: boolean;
}

export interface Artifact {
  slot: string;
  icon?: string;
  set: string;
  rarity: number;
  level: number;
  main: StatLine;
  subs: StatLine[];
}

export interface Weapon {
  name: string;
  icon?: string;
  rarity: number;
  level: number;
  refinement: number;
  stats: StatLine[];
}

export interface Character {
  id: number;
  name: string;
  icon?: string;
  element: string;
  rarity: number;
  level: number;
  ascension: number;
  constellation: number;
  friendship: number;
  talents: { base: number; bonus: number }[];
  stats: StatLine[];
  weapon?: Weapon;
  artifacts: Artifact[];
  critValue: number;
}

export interface Profile {
  uid: string;
  region?: string;
  nickname: string;
  adventureRank: number;
  worldLevel?: number;
  signature?: string;
  achievements?: number;
  abyss?: string;
  characters: Character[];
}

const ELEMENTS: Record<string, string> = {
  Fire: 'Pyro',
  Water: 'Hydro',
  Wind: 'Anemo',
  Electric: 'Electro',
  Grass: 'Dendro',
  Ice: 'Cryo',
  Rock: 'Geo',
};

const PROP_NAMES: Record<string, string> = {
  FIGHT_PROP_HP: 'HP',
  FIGHT_PROP_HP_PERCENT: 'HP%',
  FIGHT_PROP_ATTACK: 'ATK',
  FIGHT_PROP_ATTACK_PERCENT: 'ATK%',
  FIGHT_PROP_BASE_ATTACK: 'Base ATK',
  FIGHT_PROP_DEFENSE: 'DEF',
  FIGHT_PROP_DEFENSE_PERCENT: 'DEF%',
  FIGHT_PROP_ELEMENT_MASTERY: 'Elemental Mastery',
  FIGHT_PROP_CHARGE_EFFICIENCY: 'Energy Recharge',
  FIGHT_PROP_CRITICAL: 'CRIT Rate',
  FIGHT_PROP_CRITICAL_HURT: 'CRIT DMG',
  FIGHT_PROP_HEAL_ADD: 'Healing Bonus',
  FIGHT_PROP_PHYSICAL_ADD_HURT: 'Physical DMG Bonus',
  FIGHT_PROP_FIRE_ADD_HURT: 'Pyro DMG Bonus',
  FIGHT_PROP_WATER_ADD_HURT: 'Hydro DMG Bonus',
  FIGHT_PROP_WIND_ADD_HURT: 'Anemo DMG Bonus',
  FIGHT_PROP_ELEC_ADD_HURT: 'Electro DMG Bonus',
  FIGHT_PROP_GRASS_ADD_HURT: 'Dendro DMG Bonus',
  FIGHT_PROP_ICE_ADD_HURT: 'Cryo DMG Bonus',
  FIGHT_PROP_ROCK_ADD_HURT: 'Geo DMG Bonus',
};

const FLAT_PROPS = new Set([
  'FIGHT_PROP_HP',
  'FIGHT_PROP_ATTACK',
  'FIGHT_PROP_BASE_ATTACK',
  'FIGHT_PROP_DEFENSE',
  'FIGHT_PROP_ELEMENT_MASTERY',
]);

// fightPropMap keys -> label; percent values are stored as fractions (0.5 = 50%).
const FIGHT_PROPS: [string, string, boolean][] = [
  ['2000', 'Max HP', false],
  ['2001', 'ATK', false],
  ['2002', 'DEF', false],
  ['28', 'Elemental Mastery', false],
  ['20', 'CRIT Rate', true],
  ['22', 'CRIT DMG', true],
  ['23', 'Energy Recharge', true],
  ['26', 'Healing Bonus', true],
  ['30', 'Physical DMG Bonus', true],
  ['40', 'Pyro DMG Bonus', true],
  ['41', 'Electro DMG Bonus', true],
  ['42', 'Hydro DMG Bonus', true],
  ['43', 'Dendro DMG Bonus', true],
  ['44', 'Anemo DMG Bonus', true],
  ['45', 'Geo DMG Bonus', true],
  ['46', 'Cryo DMG Bonus', true],
];

const SLOTS: Record<string, string> = {
  EQUIP_BRACER: 'Flower',
  EQUIP_NECKLACE: 'Plume',
  EQUIP_SHOES: 'Sands',
  EQUIP_RING: 'Goblet',
  EQUIP_DRESS: 'Circlet',
};

const ICON_BASE = 'https://enka.network/ui';

function iconUrl(name?: string): string | undefined {
  if (!name) return undefined;
  return name.startsWith('/ui/') ? `https://enka.network${name}` : `${ICON_BASE}/${name}.png`;
}

function statLine(stat: Stat): StatLine {
  const id = stat.appendPropId ?? stat.mainPropId ?? 'UNKNOWN';
  return { name: PROP_NAMES[id] ?? id, value: stat.statValue, percent: !FLAT_PROPS.has(id) };
}

function toWeapon(e: Equip, assets: Assets): Weapon {
  const affix = Object.values(e.weapon?.affixMap ?? {})[0] ?? 0;
  return {
    name: assets.loc[e.flat.nameTextMapHash] ?? `Weapon ${e.itemId}`,
    icon: iconUrl(e.flat.icon),
    rarity: e.flat.rankLevel,
    level: e.weapon?.level ?? 1,
    refinement: affix + 1,
    stats: (e.flat.weaponStats ?? []).map(statLine),
  };
}

function toArtifact(e: Equip, assets: Assets): Artifact {
  const setHash = assets.relicSets[String(e.flat.setId)]?.Name;
  return {
    slot: SLOTS[e.flat.equipType ?? ''] ?? e.flat.equipType ?? '?',
    icon: iconUrl(e.flat.icon),
    set: (setHash && assets.loc[setHash]) || `Set ${e.flat.setId}`,
    rarity: e.flat.rankLevel,
    level: (e.reliquary?.level ?? 1) - 1,
    main: statLine(e.flat.reliquaryMainstat ?? { statValue: 0 }),
    subs: (e.flat.reliquarySubstats ?? []).map(statLine),
  };
}

export function toCharacter(a: AvatarInfo, assets: Assets): Character {
  // Traveler entries are keyed by "<avatarId>-<skillDepotId>".
  const asset = assets.avatars[`${a.avatarId}-${a.skillDepotId}`] ?? assets.avatars[String(a.avatarId)];
  const weaponEquip = a.equipList.find((e) => e.flat.itemType === 'ITEM_WEAPON');
  const artifacts = a.equipList.filter((e) => e.flat.itemType === 'ITEM_RELIQUARY').map((e) => toArtifact(e, assets));

  const stats = FIGHT_PROPS.flatMap(([key, name, percent]) => {
    const raw = a.fightPropMap[key] ?? 0;
    // Hide zero-value elemental/healing bonuses to keep output readable.
    if (!raw && Number(key) < 2000 && !['20', '22', '23', '28'].includes(key)) return [];
    return [{ name, value: percent ? raw * 100 : raw, percent }];
  });

  const talents = (asset?.SkillOrder ?? []).map((skillId) => {
    const proud = asset?.ProudMap[String(skillId)];
    return {
      base: a.skillLevelMap[String(skillId)] ?? 1,
      bonus: proud ? (a.proudSkillExtraLevelMap?.[String(proud)] ?? 0) : 0,
    };
  });

  const critValue = artifacts
    .flatMap((art) => art.subs)
    .reduce((cv, s) => cv + (s.name === 'CRIT Rate' ? s.value * 2 : s.name === 'CRIT DMG' ? s.value : 0), 0);

  return {
    id: a.avatarId,
    name: (asset && assets.loc[String(asset.NameTextMapHash)]) || `Character ${a.avatarId}`,
    icon: iconUrl(asset?.SideIconName?.replace('_Side_', '_')),
    element: (asset && ELEMENTS[asset.Element]) ?? asset?.Element ?? '?',
    rarity: asset?.QualityType === 'QUALITY_ORANGE' || asset?.QualityType === 'QUALITY_ORANGE_SP' ? 5 : 4,
    level: Number(a.propMap['4001']?.val ?? 1),
    ascension: Number(a.propMap['1002']?.val ?? 0),
    constellation: a.talentIdList?.length ?? 0,
    friendship: a.fetterInfo?.expLevel ?? 0,
    talents,
    stats,
    weapon: weaponEquip && toWeapon(weaponEquip, assets),
    artifacts,
    critValue: Math.round(critValue * 10) / 10,
  };
}

export function toProfile(res: EnkaResponse, assets: Assets): Profile {
  const p = res.playerInfo;
  return {
    uid: res.uid,
    region: res.region,
    nickname: p.nickname,
    adventureRank: p.level,
    worldLevel: p.worldLevel,
    signature: p.signature,
    achievements: p.finishAchievementNum,
    abyss: p.towerFloorIndex
      ? `${p.towerFloorIndex}-${p.towerLevelIndex ?? 0}${p.towerStarIndex ? ` (${p.towerStarIndex}★)` : ''}`
      : undefined,
    characters: (res.avatarInfoList ?? []).map((a) => toCharacter(a, assets)),
  };
}
