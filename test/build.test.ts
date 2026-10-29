import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toCharacter, toProfile } from '../src/build.ts';
import type { Assets, AvatarInfo } from '../src/types.ts';

const assets: Assets = {
  avatars: {
    '10000005-504': {
      Element: 'Electric',
      NameTextMapHash: 1,
      QualityType: 'QUALITY_ORANGE',
      WeaponType: 'WEAPON_SWORD_ONE_HAND',
      SkillOrder: [100, 200],
      ProudMap: { '100': 900, '200': 901 },
    },
  },
  relicSets: { '15017': { Name: '3' } },
  loc: { '1': 'Traveler', '2': 'Mistsplitter Reforged', '3': 'Tenacity of the Millelith' },
};

const traveler: AvatarInfo = {
  avatarId: 10000005,
  skillDepotId: 504,
  propMap: { '4001': { type: 4001, ival: '90', val: '90' }, '1002': { type: 1002, ival: '6', val: '6' } },
  fightPropMap: { '2000': 15000.4, '20': 0.5, '22': 1.25, '41': 0.466, '42': 0 },
  talentIdList: [1, 2],
  skillLevelMap: { '100': 9, '200': 10 },
  proudSkillExtraLevelMap: { '901': 3 },
  equipList: [
    {
      itemId: 11509,
      weapon: { level: 90, affixMap: { '111509': 2 } },
      flat: { nameTextMapHash: '2', rankLevel: 5, itemType: 'ITEM_WEAPON', weaponStats: [{ appendPropId: 'FIGHT_PROP_BASE_ATTACK', statValue: 674 }] },
    },
    {
      itemId: 1,
      reliquary: { level: 21 },
      flat: {
        nameTextMapHash: '0',
        rankLevel: 5,
        itemType: 'ITEM_RELIQUARY',
        equipType: 'EQUIP_DRESS',
        setId: 15017,
        reliquaryMainstat: { mainPropId: 'FIGHT_PROP_CRITICAL', statValue: 31.1 },
        reliquarySubstats: [
          { appendPropId: 'FIGHT_PROP_CRITICAL_HURT', statValue: 20.2 },
          { appendPropId: 'FIGHT_PROP_ELEMENT_MASTERY', statValue: 40 },
        ],
      },
    },
  ],
};

test('resolves Traveler via avatarId-skillDepotId and maps build details', () => {
  const c = toCharacter(traveler, assets);
  assert.equal(c.name, 'Traveler');
  assert.equal(c.element, 'Electro');
  assert.equal(c.level, 90);
  assert.equal(c.constellation, 2);
  assert.deepEqual(c.talents, [{ base: 9, bonus: 0 }, { base: 10, bonus: 3 }]);
  assert.equal(c.weapon?.name, 'Mistsplitter Reforged');
  assert.equal(c.weapon?.refinement, 3);

  const [art] = c.artifacts;
  assert.equal(art?.slot, 'Circlet');
  assert.equal(art?.set, 'Tenacity of the Millelith');
  assert.equal(art?.level, 20);
  assert.deepEqual(art?.subs[1], { name: 'Elemental Mastery', value: 40, percent: false });
  // Main-stat CRIT Rate is excluded from crit value; only substats count.
  assert.equal(c.critValue, 20.2);
});

test('converts fractional fight props to percents and hides zero elemental bonuses', () => {
  const stats = Object.fromEntries(toCharacter(traveler, assets).stats.map((s) => [s.name, s.value]));
  assert.equal(stats['CRIT Rate'], 50);
  assert.equal(stats['CRIT DMG'], 125);
  assert.ok(Math.abs((stats['Electro DMG Bonus'] ?? 0) - 46.6) < 1e-9);
  assert.equal('Hydro DMG Bonus' in stats, false);
});

test('falls back gracefully for unknown characters and missing showcase', () => {
  const unknown = toCharacter({ ...traveler, avatarId: 1, skillDepotId: 0 }, assets);
  assert.equal(unknown.name, 'Character 1');

  const p = toProfile({ uid: '1', ttl: 60, playerInfo: { nickname: 'X', level: 1 } }, assets);
  assert.deepEqual(p.characters, []);
  assert.equal(p.abyss, undefined);
});
