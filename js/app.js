// Boot, routing, the single app-state holder, and the running session (which follows you across screens).
import { loadState, saveState, requestPersist } from './store.js';
import { ensureDay, recoverActive, finalizeSession, startSession, onHide, onShow, heartbeat, touch, idleState, endIdle, clockOut, elapsedMs, goalReached, MIN_SAVE_MIN } from './session.js';
import { dayKey } from './time.js';
import { h, toast, openSheet, confirmSheet, fmtClock } from './dom.js';
import { setSoundEnabled, unlockAudio, playCash, playPromo } from './sound.js';
import { acquireWakeLock, releaseWakeLock } from './wakelock.js';
import { showReceipt } from './views/receipt.js';
import * as home from './views/home.js';
import * as session from './views/session.js';
import * as plan from './views/plan.js';
import * as goals from './views/goals.js';
import * as office from './views/office.js';
import * as marks from './views/marks.js';
import * as stats from './views/stats.js';
import * as settings from './views/settings.js';

const views = { home, session, plan, goals, goal: goals, office, school: marks, marks, stats, settings };
const TAB_OF = { goal: 'goals', marks: 'school', settings: 'home', stats: 'home' };
let state = null;
let lastRoute = '';
let lastDay = null;
let lastPersist = 0;
let idleSheetClose = null;
let goalToastFor = null;

export const app = {
  get state() { return state; },
  now() { return typeof window.__now === 'number' ? window.__now : Date.now(); },
  async commit(next, { rerender = true } = {}) {
    state = next;
    try { await saveState(state); }
    catch (e) { console.error(e); toast('Could not save — storage may be full', { bad: true }); }
    if (rerender) render();
  },
  go(hash) { if (location.hash === hash) render(); else location.hash = hash; },
  render: () => render(),
  onTick: null, // the session view sets this to refresh its clock

  async beginSession({ courseId, goalMin, stepId }) {
    if (state.active) return;
    unlockAudio();
    const a = startSession({ courseId, goalMin, stepId, now: app.now() });
    lastPersist = app.now();
    await app.commit({ ...state, active: a }, { rerender: false });
    app.go('#session');
    const woke = await acquireWakeLock();
    if (!woke && !state.career.tipsShown.autolock) {
      toast('Tip: set Auto-Lock to Never while studying (Settings → Display & Brightness)', { ms: 6000 });
      const st = JSON.parse(JSON.stringify(state)); st.career.tipsShown.autolock = true;
      app.commit(st, { rerender: false });
    }
  },

  async requestClockOut() {
    const a = state.active; if (!a) return;
    const ms = elapsedMs(a, app.now());
    if (ms < MIN_SAVE_MIN * 60000) {
      const ok = await confirmSheet('Clock out?', `Sessions under ${MIN_SAVE_MIN} minutes aren't saved. Clock out anyway?`, 'Clock out');
      if (!ok) return;
    }
    settle(clockOut(state.active, app.now()));
  },
};
window.__app = app; // for debugging in the browser console

function route() {
  const [name, ...rest] = (location.hash.slice(1) || 'home').split('/');
  return { name: views[name] ? name : 'home', params: rest.map(decodeURIComponent) };
}

function render() {
  if (!state) return;
  const { name, params } = route();
  const key = name + '/' + params.join('/');
  document.body.classList.toggle('fullscreen', name === 'session');
  const tab = TAB_OF[name] || name;
  document.querySelectorAll('.tabbar a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
  const root = document.getElementById('view');
  const keepScroll = key === lastRoute ? window.scrollY : 0;
  app.onTick = null;
  root.replaceChildren();
  views[name].render(root, app, params, name);
  window.scrollTo(0, keepScroll);
  lastRoute = key;
  updateBar();
}

// ---- running session: bar, ticking, idle guard, leaving the app ----
function courseCode(id) {
  return id === 'OTHER' ? 'Other' : ((state.term.courses.find(c => c.id === id) || {}).code || id);
}

function updateBar() {
  const bar = document.getElementById('sessionbar');
  const a = state && state.active;
  const onSession = route().name === 'session';
  if (!a || onSession) { bar.hidden = true; document.body.classList.remove('has-bar'); return; }
  const now = app.now();
  const ms = elapsedMs(a, now);
  const goal = a.goalMin ? (goalReached(a, now) ? ' · goal ✓' : ` · goal ${a.goalMin}m`) : '';
  bar.textContent = `● ${fmtClock(ms)} · ${courseCode(a.courseId)}${goal}`;
  bar.hidden = false;
  document.body.classList.add('has-bar');
}

function tick() {
  const a = state && state.active;
  if (!a || a.hiddenAt !== null) return;
  const now = app.now();
  if (a.goalMin && goalReached(a, now) && goalToastFor !== a.id) {
    goalToastFor = a.id; playCash();
    toast(`🎯 Goal hit — ${a.goalMin} min. Keep going or clock out.`, { ms: 5000 });
  }
  const idle = idleState(a, now);
  if (idle === 'expired') { if (idleSheetClose) { idleSheetClose(); idleSheetClose = null; } settle(endIdle(a)); return; }
  if (idle === 'ask' && !idleSheetClose) {
    playPromo();
    idleSheetClose = openSheet(h('div', { class: 'stack center' },
      h('div', { style: { fontSize: '40px' } }, '⏰'),
      h('h2', null, 'Still studying?'),
      h('p', { class: 'dim' }, 'No taps for 2 hours. If you don\'t answer in 10 minutes, the session ends at your last tap.'),
      h('div', { class: 'grid2' },
        h('button', { class: 'btn', onclick: () => { idleSheetClose(); idleSheetClose = null; app.requestClockOut(); } }, 'Clock out'),
        h('button', { class: 'btn btn-gold', onclick: () => { idleSheetClose(); idleSheetClose = null; } }, 'YES, STILL HERE'))),
    { center: true, dismissable: false });
  }
  if (now - lastPersist >= 15000) {
    lastPersist = now;
    app.commit({ ...state, active: heartbeat(state.active, now) }, { rerender: false });
  }
  updateBar();
  if (app.onTick) app.onTick();
}

function onPointer() {
  if (state && state.active) state = { ...state, active: touch(state.active, app.now()) };
}

function hidden() {
  if (!state || !state.active) return;
  state = { ...state, active: onHide(heartbeat(state.active, app.now()), app.now()) };
  saveState(state).catch(() => {});
}

function shown() {
  if (!state || !state.active) return;
  const a = onShow(state.active, app.now());
  if (a.status === 'completed') { settle(a); return; }
  state = { ...state, active: touch(a, app.now()) };
  acquireWakeLock();
  app.commit(state, { rerender: false });
  tick();
}

let settling = false;
async function settle(a) {
  if (settling) return;
  settling = true;
  releaseWakeLock();
  const now = app.now();
  const fin = finalizeSession(state, a, now);
  await app.commit(fin.state, { rerender: false });
  settling = false;
  goalToastFor = null;
  updateBar();
  if (route().name === 'session') app.go('#home'); else render();
  await showReceipt(fin.receipt, { app, courseCode: courseCode(a.courseId) });
}

function onVisibility() {
  if (document.visibilityState === 'hidden') { hidden(); return; }
  shown();
  if (state && !state.active) {
    const d = dayKey(new Date(app.now()));
    if (d !== lastDay) { lastDay = d; app.commit(ensureDay(state, app.now())); }
  }
}

async function boot() {
  try { state = await loadState(); }
  catch {
    // Never overwrite saved progress we couldn't read. Ask for a relaunch instead.
    document.getElementById('tabbar').style.display = 'none';
    const v = document.getElementById('view');
    v.innerHTML = '<div class="card stack" style="margin-top:20vh;text-align:center"><div style="font-size:40px">🗄️</div><h2>Couldn\'t open your saved data</h2><p class="dim">Your progress is safe — nothing was changed. Close the app completely and open it again.</p><button class="btn btn-gold" onclick="location.reload()">TRY AGAIN</button></div>';
    return;
  }
  const demo = new URLSearchParams(location.search).get('demo');
  if (demo && location.hostname === 'localhost') state = (await import('./demo.js')).demoState(demo, app.now());
  setSoundEnabled(() => state && state.settings.sound);
  const now = app.now();
  let recovered = null;
  if (state.active) {
    const a = recoverActive(state.active, now);
    const fin = finalizeSession(state, a, now);
    state = fin.state;
    recovered = { receipt: fin.receipt, code: courseCode(a.courseId) };
  }
  state = ensureDay(state, now);
  lastDay = dayKey(new Date(now));
  if (!state.settings.mediaCleared) {
    try { indexedDB.deleteDatabase('billable-media'); } catch {}
    state.settings.mediaCleared = true;
  }
  await saveState(state).catch(() => {});
  window.addEventListener('hashchange', render);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', hidden);
  document.addEventListener('pointerdown', onPointer, { capture: true });
  document.addEventListener('pointerdown', unlockAudio, { once: true });
  setInterval(tick, 1000);
  render();
  if (recovered) showReceipt(recovered.receipt, { app, courseCode: recovered.code });
  requestPersist();
  if ('serviceWorker' in navigator && !['127.0.0.1', 'localhost'].includes(location.hostname)) { // no offline cache while developing locally
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (w) w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) toast('Update ready — close and reopen the app', { ms: 6000 });
        });
      });
    }).catch(() => {});
  }
}

boot();
