import { $, fmtValue, h, initPage, mainStatContent, perfectBadge, stars, syncUid, wantedSubsFor } from './lib.js';

const SLOT_ORDER = ['Flower', 'Plume', 'Sands', 'Goblet', 'Circlet'];
const FILTERS = ['f-set', 'f-slot', 'f-main', 'f-sub', 'f-loc', 'f-rarity', 'f-level'];

const status = $('status');
const uidInput = $('uid');

let data = null; // { equipped: { artifacts } | { error }, inventory: { artifacts, importedAt, source } | null }
let source = 'equipped';
let sort = { key: 'cv', dir: 'desc' };
// Set by links from the Build check page; applied once after the first load.
let pendingLoc = new URLSearchParams(location.search).get('loc');

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle('error', isError);
}

async function load(uid, { refresh = false } = {}) {
  setStatus(`Loading artifacts for UID ${uid}…`);
  try {
    const res = await fetch(`/api/artifacts/${encodeURIComponent(uid)}${refresh ? '?refresh' : ''}`);
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
    data = body;
    syncUid(uid);

    const hasInventory = Boolean(data.inventory);
    const hasEquipped = Boolean(data.equipped.artifacts);
    if (!(source === 'inventory' ? hasInventory : hasEquipped)) source = hasInventory ? 'inventory' : 'equipped';
    renderSource();
    populateFilters();
    if (pendingLoc) {
      if (source !== 'equipped' && data.equipped.artifacts) source = 'equipped';
      renderSource();
      populateFilters();
      if ([...$('f-loc').options].some((o) => o.value === pendingLoc)) $('f-loc').value = pendingLoc;
      pendingLoc = null;
    }
    render();

    const parts = [];
    if (hasEquipped) parts.push(`${data.equipped.artifacts.length} equipped`);
    else parts.push(`equipped artifacts unavailable: ${data.equipped.error}`);
    if (hasInventory) parts.push(`${data.inventory.artifacts.length} in imported inventory`);
    setStatus(`Loaded ${parts.join(', ')}.`, !hasEquipped && !hasInventory);
  } catch (err) {
    setStatus(`Could not load artifacts: ${err instanceof Error ? err.message : err}`, true);
  }
}

function current() {
  return (source === 'inventory' ? data?.inventory?.artifacts : data?.equipped?.artifacts) ?? [];
}

function renderSource() {
  const inv = data.inventory;
  const eq = data.equipped;
  const [invRadio, eqRadio] = ['inventory', 'equipped'].map((v) => document.querySelector(`input[name="source"][value="${v}"]`));

  invRadio.disabled = !inv;
  invRadio.checked = source === 'inventory';
  $('inventory-meta').textContent = inv
    ? `(${inv.artifacts.length}, imported ${new Date(inv.importedAt).toLocaleString()}${inv.source ? ` from ${inv.source}` : ''})`
    : '(not imported yet)';

  eqRadio.disabled = !eq.artifacts;
  eqRadio.checked = source === 'equipped';
  $('equipped-meta').textContent = eq.artifacts ? `(${eq.artifacts.length}, live from HoYoLAB)` : `(unavailable: ${eq.error})`;

  $('clear-import').hidden = !inv;
  if (!inv) $('import').open = true;
}

function fillSelect(id, values, keepFirst) {
  const select = $(id);
  const previous = select.value;
  const fixed = [...select.options].slice(0, keepFirst);
  select.replaceChildren(...fixed, ...values.map((v) => h('option', { value: v }, v)));
  select.value = [...select.options].some((o) => o.value === previous) ? previous : '';
}

function populateFilters() {
  const list = current();
  const uniq = (arr) => [...new Set(arr)].sort((a, b) => a.localeCompare(b));
  fillSelect('f-set', uniq(list.map((a) => a.set)), 1);
  fillSelect('f-main', uniq(list.map((a) => a.main.name)), 1);
  fillSelect('f-sub', uniq(list.flatMap((a) => a.subs.map((s) => s.name))), 1);
  fillSelect('f-loc', uniq(list.map((a) => a.location).filter(Boolean)), 3);
  $('filters').hidden = list.length === 0;
}

function filtered() {
  const [set, slot, main, sub, loc, rarity, level] = FILTERS.map((id) => $(id).value);
  return current().filter(
    (a) =>
      (!set || a.set === set) &&
      (!slot || a.slot === slot) &&
      (!main || a.main.name === main) &&
      (!sub || a.subs.some((s) => s.name === sub)) &&
      (!loc ||
        (loc === '__equipped' ? Boolean(a.location) : loc === '__unequipped' ? !a.location : a.location === loc)) &&
      (!rarity || (rarity === '3' ? a.rarity <= 3 : String(a.rarity) === rarity)) &&
      a.level >= Number(level),
  );
}

const SORTERS = {
  set: (a, b) => a.set.localeCompare(b.set),
  slot: (a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot),
  rarity: (a, b) => a.rarity - b.rarity,
  level: (a, b) => a.level - b.level,
  main: (a, b) => a.main.name.localeCompare(b.main.name),
  cv: (a, b) => a.critValue - b.critValue,
  location: (a, b) => (a.location ?? '\uffff').localeCompare(b.location ?? '\uffff'),
  // Unassessed artifacts sort as worst.
  fit: (a, b) => (a.fit?.perfect ? 2 : (a.fit?.score ?? -1)) - (b.fit?.perfect ? 2 : (b.fit?.score ?? -1)),
};

function sorted(list) {
  const cmp = SORTERS[sort.key];
  const dir = sort.dir === 'asc' ? 1 : -1;
  // Stable tiebreakers: CV desc, then set, then slot.
  return [...list].sort((a, b) => dir * cmp(a, b) || b.critValue - a.critValue || SORTERS.set(a, b) || SORTERS.slot(a, b));
}

// Desired substats (by name) per character, from the build check.
const desiredByCharacter = () => new Map((data?.builds ?? []).map((b) => [b.character, new Set(b.recommended?.subs ?? [])]));
const NONE = new Set();

function subLine(s, wanted) {
  const isWanted = wanted.has(s.name);
  const classes = [s.type === 20 || s.type === 22 ? 'crit' : '', isWanted ? 'recommended' : ''].filter(Boolean).join(' ');
  return h(
    'li',
    { class: classes || undefined },
    isWanted ? h('span', { class: 'rec-mark', 'aria-hidden': 'true' }, '✓ ') : null,
    `${s.name} ${fmtValue(s)}`,
    isWanted ? h('span', { class: 'visually-hidden' }, ' (recommended)') : null,
    s.rolls > 1 ? [h('span', { class: 'rolls', 'aria-hidden': 'true' }, ` ×${s.rolls}`), h('span', { class: 'visually-hidden' }, `, rolled ${s.rolls} times`)] : null,
  );
}

function fitCell(fit) {
  if (!fit) return h('td', {}, h('span', { class: 'muted', 'aria-hidden': 'true' }, '—'), h('span', { class: 'visually-hidden' }, 'Not assessed'));
  const level = fit.score === null ? '' : fit.score >= 0.6 ? 'great' : fit.score >= 0.45 ? 'good' : fit.score >= 0.3 ? 'needs-work' : 'poor';
  return h(
    'td',
    { class: 'fit' },
    fit.targetRolls ? h('span', { class: `grade grade-${level}` }, `${fit.usefulRolls} / ${fit.targetRolls}`) : null,
    fit.targetRolls ? h('span', { class: 'visually-hidden' }, ' useful rolls') : null,
    fit.perfect ? perfectBadge() : fit.desiredMax ? h('span', { class: 'muted fit-desired' }, `${fit.desiredHit} of ${fit.desiredMax} desired substats`) : null,
  );
}

function render() {
  const all = current();
  const list = sorted(filtered());
  $('count').textContent = all.length ? `Showing ${list.length} of ${all.length} artifacts` : '';
  $('artifact-table').hidden = all.length === 0;

  for (const th of document.querySelectorAll('#artifact-table th[data-sort]')) {
    if (th.dataset.sort === sort.key) th.setAttribute('aria-sort', sort.dir === 'asc' ? 'ascending' : 'descending');
    else th.removeAttribute('aria-sort');
  }

  const desired = desiredByCharacter();
  $('artifact-rows').replaceChildren(
    ...list.map((a) =>
      h(
        'tr',
        {},
        h(
          'th',
          { scope: 'row' },
          h(
            'span',
            { class: 'artifact-name' },
            a.icon ? h('img', { src: a.icon, alt: '', width: 40, height: 40, loading: 'lazy' }) : null,
            h('span', {}, a.set, a.locked ? h('span', { class: 'lock', title: 'Locked' }, h('span', { 'aria-hidden': 'true' }, ' 🔒'), h('span', { class: 'visually-hidden' }, ' (locked)')) : null),
          ),
        ),
        h('td', {}, a.slot),
        h('td', {}, stars(a.rarity)),
        h('td', {}, `+${a.level}`),
        h('td', {}, mainStatContent(a, a.fit?.mainOk ?? null)),
        h('td', {}, h('ul', { class: 'subs' }, a.subs.map((sub) => subLine(sub, wantedSubsFor(a, desired.get(a.location) ?? NONE))))),
        h('td', { class: 'num' }, a.critValue.toFixed(1)),
        fitCell(a.fit),
        h('td', {}, a.location ?? h('span', { class: 'muted' }, 'Unequipped')),
      ),
    ),
  );
}

// Sorting via header buttons; first click on a column sorts descending for numbers, ascending for text.
const NUMERIC = new Set(['rarity', 'level', 'cv', 'fit']);
for (const th of document.querySelectorAll('#artifact-table th[data-sort]')) {
  th.querySelector('button').addEventListener('click', () => {
    const key = th.dataset.sort;
    sort = sort.key === key ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: NUMERIC.has(key) ? 'desc' : 'asc' };
    render();
  });
}

for (const id of FILTERS) $(id).addEventListener('change', render);
$('reset-filters').addEventListener('click', () => {
  for (const id of FILTERS) $(id).selectedIndex = 0;
  render();
});

$('source').addEventListener('change', (e) => {
  source = e.target.value;
  populateFilters();
  render();
});

$('import-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const file = $('good-file').files[0];
  if (!file) return;
  setStatus(`Importing ${file.name}…`);
  try {
    const res = await fetch('/api/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: await file.text() });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
    source = 'inventory';
    $('good-file').value = '';
    await load(uidInput.value.trim());
    $('import').open = false;
  } catch (err) {
    setStatus(`Import failed: ${err instanceof Error ? err.message : err}`, true);
  }
});

$('clear-import').addEventListener('click', async () => {
  if (!confirm('Remove the imported inventory from this computer?')) return;
  await fetch('/api/inventory', { method: 'DELETE', headers: { 'Content-Type': 'application/json' } });
  source = 'equipped';
  await load(uidInput.value.trim());
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
load(uid);
