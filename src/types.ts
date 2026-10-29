// Subset of the Enka.Network response we rely on.
// Full docs: https://github.com/EnkaNetwork/API-docs/blob/master/docs/gi/api.md

export interface EnkaResponse {
  playerInfo: PlayerInfo;
  avatarInfoList?: AvatarInfo[];
  ttl: number;
  uid: string;
  region?: string;
}

export interface PlayerInfo {
  nickname: string;
  level: number;
  signature?: string;
  worldLevel?: number;
  finishAchievementNum?: number;
  towerFloorIndex?: number;
  towerLevelIndex?: number;
  towerStarIndex?: number;
  fetterCount?: number;
  showAvatarInfoList?: { avatarId: number; level: number }[];
}

export interface AvatarInfo {
  avatarId: number;
  skillDepotId: number;
  propMap: Record<string, { type: number; ival: string; val?: string }>;
  fightPropMap: Record<string, number>;
  talentIdList?: number[];
  skillLevelMap: Record<string, number>;
  proudSkillExtraLevelMap?: Record<string, number>;
  fetterInfo?: { expLevel: number };
  equipList: Equip[];
}

export interface Stat {
  appendPropId?: string;
  mainPropId?: string;
  statValue: number;
}

export interface Equip {
  itemId: number;
  weapon?: { level: number; promoteLevel?: number; affixMap?: Record<string, number> };
  reliquary?: { level: number };
  flat: {
    nameTextMapHash: string;
    rankLevel: number;
    itemType: 'ITEM_WEAPON' | 'ITEM_RELIQUARY';
    icon?: string;
    equipType?: string;
    setId?: number;
    weaponStats?: Stat[];
    reliquaryMainstat?: Stat;
    reliquarySubstats?: Stat[];
  };
}

// Enka asset store (store/gi/*.json)
export interface AvatarAsset {
  Element: string;
  NameTextMapHash: number;
  QualityType: string;
  SideIconName?: string;
  WeaponType: string;
  SkillOrder: number[];
  ProudMap: Record<string, number>;
}

export interface Assets {
  avatars: Record<string, AvatarAsset>;
  relicSets: Record<string, { Name: string }>;
  loc: Record<string, string>;
}
