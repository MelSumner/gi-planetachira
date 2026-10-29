import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyOverride, assessArtifact, assessBuild, isValidOverride, estimateRolls, fromGood, fromHoyolab, goodKey, type InventoryArtifact, type RelicLevels, type Slot, type StatPriority } from '../src/artifacts.ts';

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

test('estimates GOOD substat roll counts from values', () => {
  assert.equal(estimateRolls(20, 3.9, 5), 1);
  assert.equal(estimateRolls(20, 7.4, 5), 2);
  assert.equal(estimateRolls(22, 21.0, 5), 3);
  assert.equal(estimateRolls(20, 3.1, 4), 1);
  assert.equal(estimateRolls(26, 5, 5), undefined);
  const [a] = fromGood(
    { format: 'GOOD', artifacts: [{ setKey: 'X', slotKey: 'flower', level: 20, rarity: 5, mainStatKey: 'hp', substats: [{ key: 'critDMG_', value: 21 }] }] },
    { relicLevels: {}, setNames: {} },
  );
  assert.equal(a?.subs[0]?.rolls, 3);
});

const art = (slot: Slot, main: number, subs: [number, number][], extra: Partial<InventoryArtifact> = {}): InventoryArtifact => ({
  id: slot,
  set: 'S',
  slot,
  rarity: 5,
  level: 20,
  main: { type: main, name: '', value: 0, percent: true },
  subs: subs.map(([type, rolls]) => ({ type, name: '', value: 0, percent: true, rolls })),
  critValue: 0,
  ...extra,
});
const raiden: StatPriority = { Sands: [23], Goblet: [41], Circlet: [20], subs: [20, 22, 23], source: 'hoyolab' };

test('assessArtifact scores useful rolls against the target and checks main stats', () => {
  assert.deepEqual(assessArtifact(art('Sands', 23, [[20, 3], [22, 2], [5, 2]]), raiden), {
    mainOk: true,
    usefulRolls: 5,
    targetRolls: 6,
    score: 5 / 6,
    perfect: false,
    desiredHit: 2,
    desiredMax: 2,
  });
  assert.equal(assessArtifact(art('Sands', 6, []), raiden).mainOk, false);
  assert.equal(assessArtifact(art('Flower', 2, []), raiden).mainOk, null);
  // Either crit stat is accepted on a circlet.
  assert.equal(assessArtifact(art('Circlet', 22, []), raiden).mainOk, true);
  // Four-star rolls are worth less.
  assert.equal(assessArtifact(art('Flower', 2, [[20, 7]], { rarity: 4 }), raiden).score, (7 * 0.8) / 7);
  // Nothing to judge when the only recommended substat is the main stat.
  const hpOnly: StatPriority = { Sands: [3], Goblet: [3], Circlet: [3], subs: [3], source: 'hoyolab' };
  assert.equal(assessArtifact(art('Sands', 3, [[5, 4]]), hpOnly).score, null);
});

test('assessBuild grades a full set, caps on wrong main or missing piece, and lists issues', () => {
  const strong = [
    art('Flower', 2, [[20, 3], [22, 3], [23, 1]]),
    art('Plume', 5, [[20, 3], [22, 3], [23, 1]]),
    art('Sands', 23, [[20, 3], [22, 3]]),
    art('Goblet', 41, [[20, 3], [22, 3], [23, 1]]),
    art('Circlet', 20, [[22, 4], [23, 2]]),
  ];
  const good = assessBuild('Raiden Shogun', strong, raiden);
  assert.equal(good.grade, 'Great');
  assert.equal(good.mainOk, 3);
  assert.deepEqual(good.issues, []);
  assert.deepEqual(good.recommended?.Goblet, ['Electro DMG Bonus']);

  const wrongGoblet = assessBuild('Raiden Shogun', strong.map((a) => (a.slot === 'Goblet' ? { ...a, main: { ...a.main, type: 6, name: 'ATK%' } } : a)), raiden);
  assert.equal(wrongGoblet.grade, 'Needs work');
  assert.ok(!wrongGoblet.issues.some((i) => /main stat/.test(i)));

  const missing = assessBuild('Raiden Shogun', strong.slice(0, 4), raiden);
  assert.ok(missing.issues.includes('No Circlet equipped.'));
  assert.notEqual(missing.grade, 'Great');

  assert.equal(assessBuild('Nobody', [], undefined).grade, null);
  assert.deepEqual(assessBuild('Aloy', [], raiden).issues, ['No artifacts equipped.']);
});

test('perfect needs the right main stat and every desired substat the piece can have (up to 4)', () => {
  const nicole: StatPriority = { Sands: [23, 6], Goblet: [6], Circlet: [6], subs: [6, 23, 20, 22], source: 'mine' };
  const four: [number, number][] = [[6, 2], [23, 2], [20, 1], [22, 1]];
  assert.equal(assessArtifact(art('Flower', 2, four), nicole).perfect, true);
  // One off-stat line means not perfect.
  assert.equal(assessArtifact(art('Flower', 2, [[6, 2], [23, 2], [20, 1], [5, 1]]), nicole).perfect, false);
  // ATK% Sands can only carry the other three.
  assert.equal(assessArtifact(art('Sands', 6, [[23, 2], [20, 1], [22, 1], [2, 2]]), nicole).perfect, true);
  // Wrong main stat is never perfect.
  assert.equal(assessArtifact(art('Goblet', 3, four), nicole).perfect, false);
  const build = assessBuild('Nicole', [art('Flower', 2, four), art('Sands', 6, [[23, 2], [20, 1], [22, 1]])], nicole);
  assert.equal(build.perfect, 2);
  // Fewer than 4 desired substats: nothing is perfect.
  assert.equal(assessArtifact(art('Flower', 2, four), { ...nicole, subs: [6] }).perfect, false);
});

test('applyOverride replaces substats only, and overrides are validated', () => {
  const p = applyOverride(raiden, { subs: [23, 20, 22, 6] });
  assert.deepEqual(p, { ...raiden, subs: [23, 20, 22, 6], source: 'mine' });
  assert.equal(applyOverride(raiden, undefined), raiden);
  assert.equal(isValidOverride({ subs: [6, 23] }), true);
  assert.equal(isValidOverride({ subs: [] }), false);
  assert.equal(isValidOverride({ subs: [6, 23, 20, 22, 28] }), false);
  assert.equal(isValidOverride({ subs: [6, 6] }), false);
  assert.equal(isValidOverride({ subs: [5] }), false);
  assert.equal(isValidOverride({ subs: ['6'] }), false);
});
