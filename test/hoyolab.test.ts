import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { generateDs, normalizeRoster, serverForUid } from '../src/hoyolab.ts';

test('maps UID prefixes to HoYoLAB servers', () => {
  assert.equal(serverForUid('635783945'), 'os_usa');
  assert.equal(serverForUid('700000000'), 'os_euro');
  assert.equal(serverForUid('800000000'), 'os_asia');
  assert.equal(serverForUid('1800000000'), 'os_asia');
  assert.equal(serverForUid('900000000'), 'os_cht');
  assert.equal(serverForUid('100000000'), undefined);
});

test('generates an overseas DS of the form t,r,md5(salt,t,r)', () => {
  const ds = generateDs(1_700_000_000_500, 'abcdef');
  const expected = createHash('md5').update('salt=6s25p5ox5y14umn1p61aqyyvbvvl3lrt&t=1700000000&r=abcdef').digest('hex');
  assert.equal(ds, `1700000000,abcdef,${expected}`);
});

test('normalizes roster entries, clamping collab rarity', () => {
  const [aloy] = normalizeRoster([
    {
      id: 10000062,
      name: 'Aloy',
      element: 'Cryo',
      rarity: 105,
      level: 80,
      fetter: 10,
      actived_constellation_num: 0,
      weapon: { name: 'Predator', rarity: 4, level: 90, affix_level: 1 },
    },
  ]);
  assert.equal(aloy?.rarity, 5);
  assert.equal(aloy?.friendship, 10);
  assert.equal(aloy?.constellation, 0);
  assert.deepEqual(aloy?.weapon, { name: 'Predator', icon: undefined, rarity: 4, level: 90, refinement: 1 });
});
