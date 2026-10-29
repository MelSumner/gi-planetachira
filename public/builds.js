import { $, SOURCE_LABELS, apiUrl, h, helperTeamUrl, initPage, isStatic, syncUid } from './lib.js';

// Prop type IDs as used by HoYoLAB; must match SUBSTAT_CHOICES on the server.
const SUBSTAT_CHOICES = [
  [6, 'ATK%'],
  [3, 'HP%'],
  [9, 'DEF%'],
  [20, 'CRIT Rate'],
  [22, 'CRIT DMG'],
  [23, 'Energy Recharge'],
  [28, 'Elemental Mastery'],
];
const MAX_DESIRED = 4;

const FILTERS = ['f-grade', 'f-element', 'f-level'];

const status = $('status');
const uidInput = $('uid');

let builds = [];
let roster = new Map();
let currentUid = '';
// Best first.
let sort = { key: 'score', dir: 'desc' };
// Avatar ID whose editor is open, so it survives re-rendering.
let openEditor = null;

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle('error', isError);
}

async function getJson(url) {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

async function load(uid, { refresh = false, quiet = false } = {}) {
  if (!quiet) setStatus(`Checking builds for UID ${uid}…`);
  try {
    const [artifacts, rosterList] = await Promise.all([
      getJson(apiUrl('artifacts', uid, { refresh })),
      getJson(apiUrl('roster', uid, { refresh })).catch(() => []),
    ]);
    if (!artifacts.builds) throw new Error(artifacts.equipped.error ?? 'Equipped artifacts are unavailable.');
    currentUid = uid;
    syncUid(uid);
    builds = artifacts.builds;
    roster = new Map(rosterList.map((c) => [c.name, c]));
    $('filters').hidden = false;
    render();
    if (quiet) return;
    const attention = builds.filter((b) => b.grade === 'Needs work' || b.grade === 'Poor').length;
    const unbuilt = builds.filter((b) => b.pieces === 0).length;
    setStatus(`Checked ${builds.length} characters. ${attention} could use better artifacts${unbuilt ? `; ${unbuilt} have none equipped` : ''}.`);
  } catch (err) {
    setStatus(`Could not check builds: ${err instanceof Error ? err.message : err}`, true);
  }
}

const SORTERS = {
  name: (a, b) => a.character.localeCompare(b.character),
  // Characters without a recommendation sort after everyone else in either direction.
  score: (a, b) => (a.score ?? 2) - (b.score ?? 2),
  mains: (a, b) => a.mainOk / (a.mainTotal || 1) - b.mainOk / (b.mainTotal || 1),
  rolls: (a, b) => a.usefulRolls / (a.targetRolls || 1) - b.usefulRolls / (b.targetRolls || 1),
  perfect: (a, b) => a.perfect - b.perfect,
};

function filtered() {
  const [grade, element, level] = FILTERS.map((id) => $(id).value);
  return builds.filter((b) => {
    const c = roster.get(b.character);
    return (
      (!grade || (grade === 'attention' ? b.grade === 'Needs work' || b.grade === 'Poor' : b.grade === grade)) &&
      (!element || c?.element === element) &&
      (c?.level ?? 1) >= Number(level)
    );
  });
}

function sorted(list) {
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    if (sort.key === 'score' && (a.score === null) !== (b.score === null)) return a.score === null ? 1 : -1;
    return dir * SORTERS[sort.key](a, b) || SORTERS.name(a, b);
  });
}

function gradeCell(b) {
  if (!b.grade) return h('td', {}, h('span', { class: 'muted' }, b.recommended && b.pieces === 0 ? 'Not built' : 'Not graded'));
  const pct = Math.round(b.score * 100);
  return h(
    'td',
    {},
    h('span', { class: `grade grade-${b.grade.toLowerCase().replace(' ', '-')}` }, b.grade),
    h('span', { class: 'score' }, h('meter', { min: 0, max: 1, low: 0.3, high: 0.6, optimum: 1, value: b.score, 'aria-hidden': 'true' }), ` ${pct}%`),
  );
}

function recommendedList(r) {
  if (!r) return h('span', { class: 'muted' }, 'None');
  const line = (label, values) => (values.length ? h('li', {}, h('span', { class: 'muted' }, `${label}: `), values.join(', ')) : null);
  return [
    h('ul', { class: 'subs' }, line('Sands', r.Sands), line('Goblet', r.Goblet), line('Circlet', r.Circlet), line('Desired substats', r.subs)),
    h('p', { class: 'muted source-note' }, `Substats from ${SOURCE_LABELS[r.source] ?? 'HoYoLAB'}.`),
  ];
}

async function saveSubs(b, subs) {
  const res = await fetch(`api/priorities/${b.id}`, {
    method: subs ? 'PUT' : 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: subs ? JSON.stringify({ subs }) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
}

function editor(b) {
  const current = new Set(b.priority?.subs ?? []);
  const formStatus = h('p', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const legendId = `subs-legend-${b.id}`;
  const hintId = `subs-hint-${b.id}`;

  const submit = async (e, reset = false) => {
    e.preventDefault();
    const form = e.target.closest('form');
    const subs = reset ? null : [...form.querySelectorAll('input:checked')].map((i) => Number(i.value));
    if (subs && (subs.length < 1 || subs.length > MAX_DESIRED)) {
      formStatus.textContent = `Choose 1 to ${MAX_DESIRED} substats (you chose ${subs.length}).`;
      formStatus.classList.add('error');
      return;
    }
    formStatus.classList.remove('error');
    formStatus.textContent = 'Saving…';
    try {
      await saveSubs(b, subs);
      openEditor = b.id;
      await load(currentUid, { quiet: true });
      setStatus(reset ? `Reset ${b.character} to HoYoLAB's substats.` : `Saved desired substats for ${b.character}.`);
      document.querySelector(`#build-${b.id} details.editor summary`)?.focus();
    } catch (err) {
      formStatus.classList.add('error');
      formStatus.textContent = `Could not save: ${err instanceof Error ? err.message : err}`;
    }
  };

  const details = h(
    'details',
    { class: 'editor', open: openEditor === b.id },
    h('summary', {}, 'Edit desired substats', h('span', { class: 'visually-hidden' }, ` for ${b.character}`)),
    h(
      'form',
      { onsubmit: (e) => submit(e) },
      h(
        'fieldset',
        { 'aria-describedby': hintId },
        h('legend', { id: legendId }, `Desired substats for ${b.character}`),
        h('p', { id: hintId, class: 'muted' }, `Choose ${MAX_DESIRED} (fewer is allowed, but then no piece can be Perfect). A piece is Perfect when it has the right main stat and all of these it can have.`),
        h(
          'div',
          { class: 'sub-choices' },
          SUBSTAT_CHOICES.map(([id, name]) =>
            h('label', {}, h('input', { type: 'checkbox', name: 'subs', value: id, checked: current.has(id) }), ` ${name}`),
          ),
        ),
      ),
      h(
        'div',
        { class: 'editor-actions' },
        h('button', { type: 'submit' }, 'Save'),
        b.recommended?.source === 'mine' ? h('button', { type: 'button', onclick: (e) => submit(e, true) }, 'Reset to HoYoLAB') : null,
      ),
      formStatus,
    ),
  );
  details.addEventListener('toggle', () => {
    if (details.open) openEditor = b.id;
    else if (openEditor === b.id) openEditor = null;
  });
  return details;
}

function helperLink(b, c) {
  const url = helperTeamUrl(b.character, c?.element);
  if (!url) return null;
  return h(
    'p',
    { class: 'helper-link' },
    h('a', { href: url, rel: 'noopener noreferrer', target: '_blank' }, 'Genshin Helper Team build', h('span', { class: 'visually-hidden' }, ` for ${b.character} (opens in a new tab)`)),
  );
}

function render() {
  const list = sorted(filtered());
  $('count').textContent = `Showing ${list.length} of ${builds.length} characters`;
  $('build-table').hidden = builds.length === 0;

  for (const th of document.querySelectorAll('#build-table th[data-sort]')) {
    if (th.dataset.sort === sort.key) th.setAttribute('aria-sort', sort.dir === 'asc' ? 'ascending' : 'descending');
    else th.removeAttribute('aria-sort');
  }

  $('build-rows').replaceChildren(
    ...list.map((b) => {
      const c = roster.get(b.character);
      const artifactsUrl = `artifacts?uid=${encodeURIComponent(currentUid)}&loc=${encodeURIComponent(b.character)}`;
      return h(
        'tr',
        { id: b.id ? `build-${b.id}` : undefined, class: c ? `element-${c.element.toLowerCase()}` : undefined },
        h(
          'th',
          { scope: 'row' },
          h(
            'span',
            { class: 'artifact-name' },
            c?.icon ? h('img', { src: c.icon, alt: '', width: 40, height: 40, loading: 'lazy', class: 'char-icon' }) : null,
            h(
              'span',
              {},
              h('a', { href: artifactsUrl }, b.character, h('span', { class: 'visually-hidden' }, ': view artifacts')),
              c ? h('span', { class: 'muted char-sub' }, `Lv. ${c.level} · ${c.element}`) : null,
            ),
          ),
        ),
        gradeCell(b),
        h('td', { class: 'num' }, b.mainTotal ? `${b.mainOk} / ${b.mainTotal}` : '—'),
        h('td', { class: 'num' }, b.targetRolls ? `${b.usefulRolls} / ${b.targetRolls}` : '—'),
        h(
          'td',
          { class: 'num' },
          (b.priority?.subs.length ?? 0) < MAX_DESIRED ? h('span', { class: 'muted' }, isStatic() ? 'Not checked' : 'Choose 4 substats') : b.pieces ? `${b.perfect} / 5` : '—',
        ),
        h('td', {}, b.issues.length ? h('ul', { class: 'issues' }, b.issues.map((i) => h('li', {}, i))) : h('span', { class: 'muted' }, 'None')),
        h('td', {}, recommendedList(b.recommended), b.id && !isStatic() ? editor(b) : null, helperLink(b, c)),
      );
    }),
  );
}

// Numbers default to best first; names to A–Z.
for (const th of document.querySelectorAll('#build-table th[data-sort]')) {
  th.querySelector('button').addEventListener('click', () => {
    const key = th.dataset.sort;
    sort = sort.key === key ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' };
    render();
  });
}

for (const id of FILTERS) $(id).addEventListener('change', render);
$('reset-filters').addEventListener('click', () => {
  for (const id of FILTERS) $(id).selectedIndex = 0;
  render();
});

$('uid-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (uidInput.reportValidity()) load(uidInput.value.trim());
});
$('refresh').addEventListener('click', () => {
  if (uidInput.reportValidity()) load(uidInput.value.trim(), { refresh: true });
});

const { uid } = await initPage();
uidInput.value = uid;
// Links like /builds#build-10000052 (from the profile page) open that character's editor.
const hashId = Number(location.hash.match(/^#build-(\d+)$/)?.[1]);
if (hashId) openEditor = hashId;
await load(uid);
if (hashId) {
  const row = $(`build-${hashId}`);
  row?.scrollIntoView({ block: 'center' });
  row?.querySelector('details.editor summary')?.focus();
}
