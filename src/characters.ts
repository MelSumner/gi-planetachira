import { fromHoyolab, statName } from './artifacts.js';
import type { Character, StatLine } from './build.js';
import type { DetailProperty, RawDetailCharacter, RawDetailProperty } from './hoyolab.js';

const STAMINA = 999999;
// Shown even at 0, matching the Enka showcase panel.
const ALWAYS = new Set([2000, 2001, 2002, 28, 20, 22, 23]);
const isResistance = (t: number) => t === 29 || (t >= 50 && t <= 56);

function parse(final: string): { value: number; percent: boolean } {
  return { value: parseFloat(final.replace(/,/g, '')) || 0, percent: final.trim().endsWith('%') };
}

function statLine(name: string, final: string): StatLine {
  return { name, ...parse(final) };
}

function stats(props: DetailProperty[]): StatLine[] {
  return props
    .filter((p) => p.type !== STAMINA && !isResistance(p.type))
    .filter((p) => ALWAYS.has(p.type) || parse(p.final).value !== 0)
    .map((p) => statLine(p.name, p.final));
}

function weaponStat(p: RawDetailProperty | null | undefined): StatLine | null {
  if (!p?.final) return null;
  return statLine(p.property_type === 4 ? 'Base ATK' : statName(p.property_type), p.final);
}

/** The talents players level: Normal Attack, Elemental Skill, Elemental Burst (Ayaka/Mona's sprint is dropped). */
function talents(c: RawDetailCharacter): Character['talents'] {
  const list = (c.skills ?? []).filter((s) => s.skill_type === 1);
  const three = list.length === 4 ? [list[0], list[1], list[3]] : list.slice(0, 3);
  return three.map((s) => ({ base: s!.level, bonus: 0 }));
}

/** A HoYoLAB character in the same shape as an Enka showcase character, so the profile panel can render either. */
export function characterFromHoyolab(c: RawDetailCharacter): Character {
  const pieces = fromHoyolab([c]);
  const artifacts = pieces.map(({ slot, icon, set, rarity, level, main, subs }) => ({ slot, icon, set, rarity, level, main, subs }));
  const critValue = pieces.reduce((sum, a) => sum + a.critValue, 0);
  const w = c.weapon;
  return {
    id: c.base.id,
    name: c.base.name,
    icon: c.base.icon,
    element: c.base.element ?? 'Unknown',
    rarity: c.base.rarity ?? 0,
    level: c.base.level ?? 0,
    ascension: 0,
    constellation: c.base.actived_constellation_num ?? 0,
    friendship: c.base.fetter ?? 0,
    talents: talents(c),
    stats: stats(c.properties ?? []),
    weapon: w
      ? {
          name: w.name,
          icon: w.icon,
          rarity: w.rarity,
          level: w.level,
          refinement: w.affix_level,
          stats: [weaponStat(w.main_property), weaponStat(w.sub_property)].filter((s): s is StatLine => s !== null),
        }
      : undefined,
    artifacts,
    critValue: Math.round(critValue * 10) / 10,
  };
}
