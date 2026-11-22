// Tiny DOM helpers + formatting + sheets/toasts.
export function h(tag, props, ...children) {
  const e = document.createElement(tag);
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) { children.unshift(props); props = null; }
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') e.innerHTML = v;
    else if (v === true) e.setAttribute(k, '');
    else if (k in e && typeof v !== 'string') e[k] = v;
    else e.setAttribute(k, v);
  }
  append(e, children);
  return e;
}

function append(e, kids) {
  for (const c of kids.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function money(n) {
  const v = Math.round(n || 0);
  return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US');
}

export function fmtMin(min) {
  const m = Math.max(0, Math.round(min || 0));
  const hh = Math.floor(m / 60), mm = m % 60;
  return hh ? `${hh}h ${mm}m` : `${mm}m`;
}

export function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  const p = n => String(n).padStart(2, '0');
  return hh ? `${hh}:${p(mm)}:${p(ss)}` : `${p(mm)}:${p(ss)}`;
}

export function fmtPct(p, digits = 1) {
  return p === null || p === undefined || Number.isNaN(p) ? '—' : `${p.toFixed(digits)}%`;
}

export function fmtDate(key) {
  if (!key) return 'TBA';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

export function toast(msg, { bad = false, ms = 2600 } = {}) {
  const box = document.getElementById('toasts');
  if (!box) return;
  const t = h('div', { class: 'toast' + (bad ? ' bad' : ''), role: 'status' }, msg);
  box.append(t);
  setTimeout(() => t.remove(), ms);
}

/** Opens a bottom sheet (or centered card). Returns close(). */
export function openSheet(content, { center = false, onClose, dismissable = true } = {}) {
  const root = document.getElementById('overlay');
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' }, content);
  const scrim = h('div', { class: 'scrim' + (center ? ' center' : '') }, sheet);
  const close = () => { scrim.remove(); if (onClose) onClose(); };
  if (dismissable) scrim.addEventListener('click', e => { if (e.target === scrim) close(); });
  root.append(scrim);
  const f = sheet.querySelector('button, input, [tabindex]');
  if (f) setTimeout(() => f.focus({ preventScroll: true }), 50);
  return close;
}

export function confirmSheet(title, body, okLabel = 'Confirm', { danger = false } = {}) {
  return new Promise(res => {
    let closed = false;
    const done = v => { if (closed) return; closed = true; close(); res(v); };
    const close = openSheet(h('div', { class: 'stack' },
      h('h2', title), body ? h('p', { class: 'dim' }, body) : null,
      h('div', { class: 'grid2' },
        h('button', { class: 'btn', onclick: () => done(false) }, 'Cancel'),
        h('button', { class: 'btn ' + (danger ? 'btn-red' : 'btn-gold'), onclick: () => done(true) }, okLabel))),
      { center: true, onClose: () => { if (!closed) { closed = true; res(false); } } });
  });
}

export function bar(pct, cls = '') {
  return h('div', { class: 'bar ' + cls, role: 'progressbar', 'aria-valuenow': Math.round(pct), 'aria-valuemin': 0, 'aria-valuemax': 100 },
    h('i', { style: { width: Math.max(0, Math.min(100, pct)) + '%' } }));
}
