export const $ = (id) => document.getElementById(id);

// Tiny DOM builder. Strings go through textContent so API data is never parsed as HTML.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'number' ? String(c) : c);
  }
  return el;
}

export const fmtValue = (s) => (s.percent ? `${s.value.toFixed(1)}%` : Math.round(s.value).toLocaleString());

export const stars = (n) =>
  h('span', { class: 'stars' }, h('span', { 'aria-hidden': 'true' }, '★'.repeat(n)), h('span', { class: 'visually-hidden' }, `${n}-star`));

/** Fetch app config and resolve the UID from ?uid= or the server default. Keeps nav links on the same UID. */
export async function initPage() {
  const config = await fetch('/api/config').then((r) => r.json());
  const uid = new URLSearchParams(location.search).get('uid') ?? config.defaultUid;
  syncUid(uid);
  return { config, uid };
}

export function syncUid(uid) {
  const url = new URL(location.href);
  url.searchParams.set('uid', uid);
  history.replaceState(null, '', url);
  for (const a of document.querySelectorAll('.site-nav a')) {
    const href = new URL(a.href);
    href.searchParams.set('uid', uid);
    a.href = href.pathname + href.search;
  }
}

const HELPER_TEAM = 'https://genshin-impact-helper-team.github.io/genshin-builds/en/';
const HELPER_SLUGS = { 'Raiden Shogun': 'shogun-raiden' };
const NO_HELPER_PAGE = new Set(['Manekin', 'Manekina']);

/** Link to the Genshin Helper Team's build page for a character (we only link; their data isn't ours to copy). */
export function helperTeamUrl(name, element) {
  if (NO_HELPER_PAGE.has(name)) return null;
  if (name === 'Traveler') return element ? `${HELPER_TEAM}${element.toLowerCase()}-traveler` : null;
  const slug =
    HELPER_SLUGS[name] ??
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  return HELPER_TEAM + slug;
}

/**
 * Same rule as the server's assessArtifact: right main stat (or no choice for the slot) and
 * every desired substat the piece can have. Needs 4 desired substats.
 * `rec` holds stat names.
 */
export function isPerfect(a, rec) {
  if (!rec || rec.subs.length < 4) return false;
  const mains = rec[a.slot];
  if (mains?.length && !mains.includes(a.main.name)) return false;
  const desired = rec.subs.filter((n) => n !== a.main.name);
  const need = Math.min(desired.length, 4);
  const hit = new Set(a.subs.map((s) => s.name).filter((n) => desired.includes(n))).size;
  return need > 0 && hit >= need;
}

/**
 * Desired substat names for one piece. When the main stat is a desired ATK%, HP% or DEF%,
 * the matching flat substat (which can still roll on that piece) counts as desired too.
 */
export function wantedSubsFor(a, wanted) {
  const flat = /^(ATK|HP|DEF)%$/.exec(a.main.name)?.[1];
  return flat && wanted.has(a.main.name) ? new Set([...wanted, flat]) : wanted;
}

export const perfectBadge = () => h('span', { class: 'perfect-badge' }, h('span', { 'aria-hidden': 'true' }, '★ '), 'Perfect');

export const SOURCE_LABELS = { mine: 'your choice', 'hoyolab-custom': 'your HoYoLAB settings', hoyolab: 'HoYoLAB' };

/** Main stat with a ✓ when it's a recommended main stat. Never color alone. */
export function mainStatContent(a, ok) {
  const text = `${a.main.name} ${fmtValue(a.main)}`;
  if (ok === true)
    return h('span', { class: 'main-ok' }, h('span', { class: 'rec-mark', 'aria-hidden': 'true' }, '✓ '), text, h('span', { class: 'visually-hidden' }, ' (recommended)'));
  return text;
}

/** Whether a piece's main stat (by name) is recommended; null when the slot has no choice. */
export function mainStatOk(a, rec) {
  const mains = rec?.[a.slot];
  return mains?.length ? mains.includes(a.main.name) : null;
}
