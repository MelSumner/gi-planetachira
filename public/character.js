import { characterView } from './character-view.js';
import { $, apiUrl, h, initPage, syncUid } from './lib.js';

const status = $('status');
const uidInput = $('uid');
const select = $('char-select');

let characters = [];
let recommendations = {};
let currentUid = '';

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

function currentId() {
  return Number(new URLSearchParams(location.search).get('id'));
}

function setUrl(uid, id, push) {
  const url = new URL(location.href);
  url.searchParams.set('uid', uid);
  url.searchParams.set('id', String(id));
  history[push ? 'pushState' : 'replaceState'](null, '', url);
}

function render({ focus = false } = {}) {
  const id = currentId();
  const c = characters.find((x) => x.id === id);
  const article = $('character');
  select.value = c ? String(c.id) : '';
  if (!c) {
    article.hidden = true;
    document.title = 'Character · Genshin Profile Viewer';
    setStatus(id ? 'That character isn’t on this account.' : 'Choose a character.', Boolean(id));
    return;
  }
  document.title = `${c.name} · Genshin Profile Viewer`;
  article.className = `character-panel element-${c.element.toLowerCase()}`;
  article.replaceChildren(
    ...characterView(c, {
      uid: currentUid,
      rec: recommendations[c.id],
      level: 2,
      talentNote: 'Talent levels are as HoYoLAB reports them and can differ by a level from the game when extra talent bonuses apply.',
    }),
  );
  article.hidden = false;
  setStatus('');
  if (focus) {
    const heading = $('character-name');
    heading.tabIndex = -1;
    heading.focus();
  }
}

async function load(uid, { refresh = false } = {}) {
  setStatus(`Loading characters for UID ${uid}…`);
  try {
    const [list, recs] = await Promise.all([
      getJson(apiUrl('characters', uid, { refresh })),
      getJson(apiUrl('recommendations', uid, { refresh })).catch(() => ({})),
    ]);
    currentUid = uid;
    syncUid(uid);
    $('back-link').href = `./?uid=${encodeURIComponent(uid)}#roster`;
    characters = list.sort((a, b) => a.name.localeCompare(b.name));
    recommendations = recs;
    select.replaceChildren(
      h('option', { value: '' }, 'Choose a character'),
      ...characters.map((c) => h('option', { value: c.id }, `${c.name} (Lv. ${c.level})`)),
    );
    $('picker').hidden = false;
    render();
  } catch (err) {
    setStatus(`Could not load characters: ${err instanceof Error ? err.message : err}`, true);
  }
}

// A button applies the choice, so changing the select alone never changes the page.
$('picker').addEventListener('submit', (e) => {
  e.preventDefault();
  const id = Number(select.value);
  if (!id) return setStatus('Choose a character.', true);
  setUrl(currentUid, id, true);
  render({ focus: true });
});

window.addEventListener('popstate', () => render({ focus: true }));

$('uid-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (uidInput.reportValidity()) load(uidInput.value.trim());
});
$('refresh').addEventListener('click', () => {
  if (uidInput.reportValidity()) load(uidInput.value.trim(), { refresh: true });
});

const { config, uid } = await initPage();
uidInput.value = uid;
if (!config.rosterEnabled) {
  setStatus('This page needs HoYoLAB. Add HOYOLAB_COOKIE to .env (see the README), then restart the server.', true);
} else {
  await load(uid);
}
