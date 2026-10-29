import { characterView } from './character-view.js';
import { $, h, initPage, stars, syncUid } from './lib.js';

const status = $('status');
const uidInput = $('uid');

let profile = null;
let selected = 0;
// HoYoLAB recommended stats by avatar ID; optional (needs HOYOLAB_COOKIE).
let recommendations = {};

async function load(uid, { refresh = false } = {}) {
  status.textContent = `Loading UID ${uid}…`;
  status.classList.remove('error');
  try {
    const res = await fetch(`/api/profile/${encodeURIComponent(uid)}${refresh ? '?refresh' : ''}`);
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
    profile = body;
    selected = 0;
    syncUid(uid);
    render();
    status.textContent = `Loaded ${body.nickname}, ${body.characters.length} characters.`;
  } catch (err) {
    status.textContent = `Could not load profile: ${err instanceof Error ? err.message : err}`;
    status.classList.add('error');
  }
}

function render() {
  const p = profile;
  document.title = `${p.nickname} · Genshin Profile Viewer`;

  $('player-name').textContent = p.nickname;
  $('player-signature').textContent = p.signature ?? '';
  $('player-stats').replaceChildren(
    ...[
      ['UID', `${p.uid}${p.region ? ` (${p.region})` : ''}`],
      ['Adventure Rank', p.adventureRank],
      ['World Level', p.worldLevel],
      ['Achievements', p.achievements],
      ['Spiral Abyss', p.abyss],
    ]
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v))),
  );
  $('profile').hidden = false;
  $('characters').hidden = false;

  if (!p.characters.length) {
    $('character-tabs').replaceChildren();
    $('character-panel').replaceChildren(
      h('p', {}, 'No character details are public. In game, open your profile and turn on "Show Character Details".'),
    );
    return;
  }
  renderTabs();
  renderPanel();
}

function renderTabs() {
  const tabs = profile.characters.map((c, i) =>
    h(
      'button',
      {
        type: 'button',
        role: 'tab',
        id: `tab-${i}`,
        class: `tab element-${c.element.toLowerCase()}`,
        'aria-selected': String(i === selected),
        'aria-controls': 'character-panel',
        tabindex: i === selected ? '0' : '-1',
        onclick: () => select(i),
      },
      c.icon ? h('img', { src: c.icon, alt: '', width: 56, height: 56, loading: 'lazy' }) : null,
      h('span', { class: 'tab-name' }, c.name),
    ),
  );
  $('character-tabs').replaceChildren(...tabs);
}

function select(i, focus = false) {
  selected = i;
  renderTabs();
  renderPanel();
  if (focus) $(`tab-${i}`).focus();
}

// Arrow / Home / End keyboard support per the ARIA tabs pattern.
$('character-tabs').addEventListener('keydown', (e) => {
  if (!profile) return;
  const n = profile.characters.length;
  const keys = { ArrowRight: selected + 1, ArrowDown: selected + 1, ArrowLeft: selected - 1, ArrowUp: selected - 1, Home: 0, End: n - 1 };
  if (!(e.key in keys)) return;
  e.preventDefault();
  select((keys[e.key] + n) % n, true);
});

function renderPanel() {
  const c = profile.characters[selected];
  if (!c) return;
  const panel = $('character-panel');
  panel.setAttribute('aria-labelledby', `tab-${selected}`);
  panel.className = `character-panel element-${c.element.toLowerCase()}`;
  panel.replaceChildren(...characterView(c, { uid: profile.uid, rec: recommendations[c.id], level: 3 }));
}

$('uid-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (uidInput.reportValidity()) loadAll(uidInput.value.trim());
});
$('refresh').addEventListener('click', () => {
  if (uidInput.reportValidity()) loadAll(uidInput.value.trim(), { refresh: true });
});

// ---- All characters (HoYoLAB roster) ----

let roster = null;
let rosterEnabled = false;

async function loadRoster(uid, { refresh = false } = {}) {
  const section = $('roster');
  section.hidden = false;
  const body = $('roster-body');
  if (!rosterEnabled) {
    $('roster-controls').hidden = true;
    body.replaceChildren(
      h(
        'div',
        { class: 'notice' },
        h('p', {}, 'Your in-game showcase only holds 12 characters. To see every character you own, connect HoYoLAB:'),
        h(
          'ol',
          {},
          h('li', {}, 'Copy ', h('code', {}, '.env.example'), ' to ', h('code', {}, '.env'), ' in the project folder.'),
          h('li', {}, 'Log in at hoyolab.com, then copy the ', h('code', {}, 'ltuid_v2'), ', ', h('code', {}, 'ltoken_v2'), ' and ', h('code', {}, 'ltmid_v2'), ' cookie values into ', h('code', {}, 'HOYOLAB_COOKIE'), '.'),
          h('li', {}, 'Restart the server.'),
        ),
      ),
    );
    return;
  }
  body.replaceChildren(h('p', {}, 'Loading all characters…'));
  try {
    const res = await fetch(`/api/roster/${encodeURIComponent(uid)}${refresh ? '?refresh' : ''}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    roster = data;
    $('roster-controls').hidden = false;
    renderRoster();
  } catch (err) {
    roster = null;
    $('roster-controls').hidden = true;
    body.replaceChildren(h('p', { class: 'error' }, `Could not load all characters: ${err instanceof Error ? err.message : err}`));
  }
}

const currentUid = () => new URLSearchParams(location.search).get('uid') ?? '';

function renderRoster() {
  if (!roster) return;
  const element = $('roster-element').value;
  const rarity = $('roster-rarity').value;
  const sort = $('roster-sort').value;
  const showcase = new Map((profile?.characters ?? []).map((c, i) => [c.id, i]));

  const list = roster
    .filter((c) => (!element || c.element === element) && (!rarity || String(c.rarity) === rarity))
    .sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name) : b[sort] - a[sort] || b.level - a.level || a.name.localeCompare(b.name),
    );

  $('roster-count').textContent = `Showing ${list.length} of ${roster.length} characters`;
  $('roster-body').replaceChildren(
    h(
      'ul',
      { class: 'roster-grid' },
      ...list.map((c) => {
        const idx = showcase.get(c.id);
        return h(
          'li',
          { class: `roster-card element-${c.element.toLowerCase()} rarity-${c.rarity}` },
          c.icon ? h('img', { src: c.icon, alt: '', width: 64, height: 64, loading: 'lazy' }) : null,
          h(
            'div',
            { class: 'roster-info' },
            h('h3', {}, h('a', { href: `/character?uid=${encodeURIComponent(currentUid())}&id=${c.id}` }, c.name)),
            h('p', {}, stars(c.rarity), ` ${c.element}`),
            h('p', {}, `Lv. ${c.level} · C${c.constellation} · Friendship ${c.friendship}`),
            c.weapon ? h('p', { class: 'roster-weapon' }, `${c.weapon.name} · Lv. ${c.weapon.level} R${c.weapon.refinement}`) : null,
            idx !== undefined
              ? h(
                  'button',
                  {
                    type: 'button',
                    class: 'link-button',
                    onclick: () => {
                      select(idx);
                      $('character-panel').focus();
                      $('character-panel').scrollIntoView({ block: 'start' });
                    },
                  },
                  'View build',
                  h('span', { class: 'visually-hidden' }, ` for ${c.name}`),
                )
              : null,
          ),
        );
      }),
    ),
  );
}

for (const id of ['roster-element', 'roster-rarity', 'roster-sort']) $(id).addEventListener('change', renderRoster);

async function loadRecommendations(uid, { refresh = false } = {}) {
  recommendations = {};
  if (!rosterEnabled) return;
  try {
    const res = await fetch(`/api/recommendations/${encodeURIComponent(uid)}${refresh ? '?refresh' : ''}`);
    if (res.ok) recommendations = await res.json();
  } catch {
    // Highlighting is optional; the build still renders without it.
  }
  if (profile) renderPanel();
}

async function loadAll(uid, opts) {
  await Promise.all([load(uid, opts), loadRoster(uid, opts), loadRecommendations(uid, opts)]);
  renderRoster(); // re-link "View build" once the showcase has loaded
}

const { config, uid } = await initPage();
rosterEnabled = config.rosterEnabled;
uidInput.value = uid;
loadAll(uid);
