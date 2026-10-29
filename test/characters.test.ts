import assert from 'node:assert/strict';
import { test } from 'node:test';
import { characterFromHoyolab } from '../src/characters.ts';

test('characterFromHoyolab matches the showcase shape', () => {
  const c = characterFromHoyolab({
    base: { id: 10000002, name: 'Kamisato Ayaka', element: 'Cryo', rarity: 5, level: 90, actived_constellation_num: 1, fetter: 10 },
    weapon: {
      name: 'Mistsplitter Reforged',
      rarity: 5,
      level: 90,
      affix_level: 1,
      main_property: { property_type: 4, final: '674' },
      sub_property: { property_type: 22, final: '44.1%' },
    },
    skills: [
      { skill_type: 1, name: 'Kabuki', level: 7 },
      { skill_type: 1, name: 'Hyouka', level: 4 },
      { skill_type: 1, name: 'Senho', level: 1 },
      { skill_type: 1, name: 'Soumetsu', level: 10 },
      { skill_type: 2, name: 'Passive', level: 1 },
    ],
    properties: [
      { type: 2000, name: 'Max HP', final: '18,000' },
      { type: 999999, name: 'Max Stamina', final: '240' },
      { type: 28, name: 'Elemental Mastery', final: '0' },
      { type: 26, name: 'Healing Bonus', final: '0.0%' },
      { type: 46, name: 'Cryo DMG Bonus', final: '61.6%' },
      { type: 56, name: 'Cryo RES', final: '10.0%' },
    ],
    relics: [],
  });
  // Ayaka's sprint (3rd talent) isn't a levelled talent.
  assert.deepEqual(c.talents, [{ base: 7, bonus: 0 }, { base: 4, bonus: 0 }, { base: 10, bonus: 0 }]);
  assert.deepEqual(
    c.stats.map((s) => [s.name, s.value, s.percent]),
    [
      ['Max HP', 18000, false],
      ['Elemental Mastery', 0, false],
      ['Cryo DMG Bonus', 61.6, true],
    ],
  );
  assert.deepEqual(c.weapon?.stats.map((s) => s.name), ['Base ATK', 'CRIT DMG']);
  assert.equal(c.weapon?.refinement, 1);
  assert.equal(c.constellation, 1);
});
