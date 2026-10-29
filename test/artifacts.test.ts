import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fromGood, fromHoyolab, goodKey, type RelicLevels } from '../src/artifacts.ts';

test('goodKey matches GOOD set/character key conventions', () => {
  assert.equal(goodKey("Gladiator's Finale"), 'GladiatorsFinale');
  assert.equal(goodKey('Tenacity of the Millelith'), 'TenacityOfTheMillelith');
  assert.equal(goodKey('Raiden Shogun'), 'RaidenShogun');
});

test('normalizes HoYoLAB relics: percent strings, slot, roll counts, crit value', () => {
  const [a] = fromHoyolab([
    {
      base: { id: 10000052, name: 'Raiden Shogun' },
      relics: [
        {
          id: 1,
          name: 'x',
          pos: 3,
          rarity: 5,
          level: 20,
          set: { id: 1, name: 'Emblem of Severed Fate' },
          main_property: { property_type: 23, value: '51.8%', times: 0 },
          sub_property_list: [
            { property_type: 20, value: '7.4%', times: 1 },
            { property_type: 22, value: '21.0%', times: 2 },
            { property_type: 5, value: '19', times: 0 },
          ],
        },
      ],
    },
  ]);
  assert.equal(a?.slot, 'Sands');
  assert.equal(a?.location, 'Raiden Shogun');
  assert.deepEqual(a?.main, { type: 23, name: 'Energy Recharge', value: 51.8, percent: true });
  assert.deepEqual(a?.subs[1], { type: 22, name: 'CRIT DMG', value: 21, percent: true, rolls: 3 });
  assert.deepEqual(a?.subs[2], { type: 5, name: 'ATK', value: 19, percent: false, rolls: 1 });
  assert.equal(a?.critValue, 35.8);
});

test('normalizes GOOD artifacts, deriving main stat values and resolving names', () => {
  const relicLevels: RelicLevels = { '5': { '21': { '2': 4780, '6': 0.466 }, '1': { '6': 0.07 } } };
  const ctx = { relicLevels, setNames: { '15017': 'Tenacity of the Millelith' }, characterNames: ['Raiden Shogun'] };
  const list = fromGood(
    {
      format: 'GOOD',
      artifacts: [
        { setKey: 'TenacityOfTheMillelith', slotKey: 'flower', level: 20, rarity: 5, mainStatKey: 'hp', location: 'RaidenShogun', lock: true, substats: [{ key: 'critRate_', value: 3.9 }, { key: '', value: 0 }] },
        { setKey: 'SomeFutureSet', slotKey: 'sands', level: 0, rarity: 5, mainStatKey: 'atk_', location: '', substats: [] },
        { setKey: 'TenacityOfTheMillelith', slotKey: 'bogus', level: 0, rarity: 5, mainStatKey: 'hp' },
      ],
    },
    ctx,
  );
  assert.equal(list.length, 2);
  const [flower, sands] = list;
  assert.equal(flower?.set, 'Tenacity of the Millelith');
  assert.equal(flower?.main.value, 4780);
  assert.equal(flower?.location, 'Raiden Shogun');
  assert.equal(flower?.locked, true);
  assert.equal(flower?.icon, 'https://enka.network/ui/UI_RelicIcon_15017_4.png');
  assert.equal(flower?.subs.length, 1);
  assert.equal(flower?.critValue, 7.8);

  assert.equal(sands?.set, 'Some Future Set');
  assert.equal(sands?.main.value, 7);
  assert.equal(sands?.location, undefined);
  assert.equal(sands?.icon, undefined);
});
