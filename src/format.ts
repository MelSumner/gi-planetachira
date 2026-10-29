import type { Character, Profile, StatLine } from './build.js';

function fmtStat(s: StatLine): string {
  const v = s.percent ? `${s.value.toFixed(1)}%` : Math.round(s.value).toLocaleString('en-US');
  return `${s.name} ${v}`;
}

export function formatCharacter(c: Character): string {
  const lines = [
    `${c.name}  ${'★'.repeat(c.rarity)}  ${c.element}  Lv.${c.level}  C${c.constellation}  Friendship ${c.friendship}`,
    `  Talents: ${c.talents.map((t) => (t.bonus ? `${t.base}+${t.bonus}` : `${t.base}`)).join(' / ')}`,
    `  Stats:   ${c.stats.map(fmtStat).join(' | ')}`,
  ];
  if (c.weapon) {
    const w = c.weapon;
    lines.push(`  Weapon:  ${w.name} ${'★'.repeat(w.rarity)} Lv.${w.level} R${w.refinement} (${w.stats.map(fmtStat).join(', ')})`);
  }
  if (c.artifacts.length) {
    lines.push(`  Artifacts (CV ${c.critValue}):`);
    for (const a of c.artifacts) {
      lines.push(`    ${a.slot.padEnd(7)} +${String(a.level).padEnd(2)} ${a.set} — ${fmtStat(a.main)} :: ${a.subs.map(fmtStat).join(', ')}`);
    }
  }
  return lines.join('\n');
}

export function formatProfile(p: Profile): string {
  const header = [
    `${p.nickname}  (UID ${p.uid}${p.region ? `, ${p.region}` : ''})`,
    `AR ${p.adventureRank}` +
      (p.worldLevel !== undefined ? ` · WL ${p.worldLevel}` : '') +
      (p.achievements !== undefined ? ` · ${p.achievements} achievements` : '') +
      (p.abyss ? ` · Abyss ${p.abyss}` : ''),
  ];
  if (p.signature) header.push(`"${p.signature}"`);

  const body = p.characters.length
    ? p.characters.map(formatCharacter).join('\n\n')
    : 'No character details available. Enable "Show Character Details" in the in-game profile showcase.';

  return `${header.join('\n')}\n\n${body}`;
}
