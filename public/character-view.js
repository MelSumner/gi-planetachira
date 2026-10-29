import { SOURCE_LABELS, fmtValue, h, helperTeamUrl, isPerfect, isStatic, mainStatContent, mainStatOk, perfectBadge, stars, wantedSubsFor } from './lib.js';

const TALENT_NAMES = ['Normal Attack', 'Elemental Skill', 'Elemental Burst'];

function cardAt(level, id, title, ...content) {
  return h('section', { class: 'card', 'aria-labelledby': id }, h(`h${level}`, { id }, ...[title].flat()), ...content);
}

function subLine(s, wanted) {
  const isWanted = wanted.has(s.name);
  const classes = [s.name.startsWith('CRIT') ? 'crit' : '', isWanted ? 'recommended' : ''].filter(Boolean).join(' ');
  return h(
    'li',
    { class: classes || undefined },
    isWanted ? h('span', { class: 'rec-mark', 'aria-hidden': 'true' }, '✓ ') : null,
    `${s.name} ${fmtValue(s)}`,
    isWanted ? h('span', { class: 'visually-hidden' }, ' (recommended)') : null,
  );
}

/**
 * Header, stats, talents, weapon and artifacts for one character (Enka showcase or HoYoLAB).
 * `level` is the heading level for the character's name; cards use the next level down.
 * `rec` is the character's recommended stats (by name), if known.
 */
export function characterView(c, { uid, rec, level = 3, talentNote }) {
  const sub = level + 1;
  const card = (id, title, ...content) => cardAt(sub, id, title, ...content);

  const header = h(
    'div',
    { class: 'char-header' },
    c.icon ? h('img', { src: c.icon, alt: '', width: 96, height: 96 }) : null,
    h(
      'div',
      {},
      h(`h${level}`, { id: 'character-name' }, c.name),
      h('p', { class: 'char-meta' }, stars(c.rarity), ` ${c.element} · Lv. ${c.level} · C${c.constellation} · Friendship ${c.friendship}`),
    ),
  );

  const talents = card(
    'talents-h',
    'Talents',
    h(
      'dl',
      { class: 'kv' },
      ...c.talents.map((t, i) =>
        h(
          'div',
          {},
          h('dt', {}, TALENT_NAMES[i] ?? `Talent ${i + 1}`),
          h('dd', {}, t.bonus ? `${t.base + t.bonus} (${t.base} + ${t.bonus})` : t.base),
        ),
      ),
    ),
    talentNote ? h('p', { class: 'muted card-note' }, talentNote) : null,
  );

  const stats = card(
    'stats-h',
    'Stats',
    h('dl', { class: 'kv' }, ...c.stats.map((s) => h('div', {}, h('dt', {}, s.name), h('dd', {}, fmtValue(s))))),
  );

  const w = c.weapon;
  const weapon = w
    ? card(
        'weapon-h',
        'Weapon',
        h(
          'div',
          { class: 'weapon-body' },
          w.icon ? h('img', { src: w.icon, alt: '', width: 72, height: 72 }) : null,
          h(
            'div',
            {},
            h('p', { class: 'weapon-name' }, w.name),
            h('p', {}, stars(w.rarity), ` Lv. ${w.level} · Refinement ${w.refinement}`),
            h('p', {}, w.stats.map((s) => `${s.name} ${fmtValue(s)}`).join(' · ')),
          ),
        ),
      )
    : null;

  const wanted = new Set(rec?.subs ?? []);
  const helperUrl = helperTeamUrl(c.name, c.element);
  const artifacts = c.artifacts.length
    ? card(
        'artifacts-h',
        ['Artifacts ', h('span', { class: 'cv' }, `Crit Value ${c.critValue}`)],
        wanted.size
          ? h(
              'p',
              { class: 'legend muted' },
              h('span', { class: 'rec-mark', 'aria-hidden': 'true' }, '✓'),
              ` marks recommended main stats and desired substats. Desired substats for ${c.name} (${SOURCE_LABELS[rec.source] ?? 'HoYoLAB'}): ${[...wanted].join(', ')}. `,
              isStatic() ? null : h('a', { href: `builds?uid=${encodeURIComponent(uid)}#build-${c.id}` }, 'Edit desired substats'),
              helperUrl && !isStatic() ? ' · ' : null,
              helperUrl
                ? h('a', { href: helperUrl, rel: 'noopener noreferrer', target: '_blank' }, `${c.name} builds on Genshin Helper Team`, h('span', { class: 'visually-hidden' }, ' (opens in a new tab)'))
                : null,
            )
          : null,
        h(
          'div',
          { class: 'table-wrap' },
          h(
            'table',
            {},
            h('caption', { class: 'visually-hidden' }, `${c.name} artifacts`),
            h('thead', {}, h('tr', {}, ...['Slot', 'Set', 'Level', 'Main stat', 'Substats', 'Perfect'].map((t) => h('th', { scope: 'col' }, t)))),
            h(
              'tbody',
              {},
              ...c.artifacts.map((a) =>
                h(
                  'tr',
                  {},
                  h(
                    'th',
                    { scope: 'row' },
                    h('span', { class: 'slot' }, a.icon ? h('img', { src: a.icon, alt: '', width: 40, height: 40, loading: 'lazy' }) : null, a.slot),
                  ),
                  h('td', {}, a.set),
                  h('td', {}, `+${a.level}`),
                  h('td', {}, mainStatContent(a, mainStatOk(a, rec))),
                  h(
                    'td',
                    {},
                    h(
                      'ul',
                      { class: 'subs' },
                      ...a.subs.map((s) => subLine(s, wantedSubsFor(a, wanted))),
                    ),
                  ),
                  h(
                    'td',
                    {},
                    (rec?.subs.length ?? 0) < 4
                      ? [h('span', { class: 'muted', 'aria-hidden': 'true' }, '—'), h('span', { class: 'visually-hidden' }, 'Not checked: choose 4 desired substats')]
                      : isPerfect(a, rec)
                        ? perfectBadge()
                        : h('span', { class: 'muted' }, 'No'),
                  ),
                ),
              ),
            ),
          ),
        ),
      )
    : null;
  artifacts?.classList.add('artifacts');

  return [header, h('div', { class: 'grid' }, stats, h('div', { class: 'stack' }, talents, weapon)), artifacts ?? ''];
}
