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
