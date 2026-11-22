// Boot, routing and the single app-state holder.
import { loadState, saveState, requestPersist } from './store.js';
import { ensureDay, recoverActive, finalizeSession } from './session.js';
import { purge, loadFrames, saveMeta, getMeta } from './timelapse.js';
import { dayKey } from './time.js';
import { toast } from './dom.js';
import { setSoundEnabled, unlockAudio } from './sound.js';
import { showReceipt } from './views/receipt.js';
import * as home from './views/home.js';
import * as session from './views/session.js';
import * as office from './views/office.js';
import * as marks from './views/marks.js';
import * as stats from './views/stats.js';
import * as settings from './views/settings.js';

const views = { home, session, office, marks, stats, settings };
let state = null;
let lastRoute = '';
let lastDay = null;

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
};
window.__app = app; // for debugging in the browser console

function route() {
  const [name, ...rest] = (location.hash.slice(1) || 'home').split('/');
  return { name: views[name] ? name : 'home', params: rest.map(decodeURIComponent) };
}

function render() {
  if (!state) return;
  let { name, params } = route();
  if (state.active && name !== 'session') { location.replace('#session'); name = 'session'; params = []; }
  const key = name + '/' + params.join('/');
  document.body.classList.toggle('fullscreen', name === 'session');
  document.querySelectorAll('.tabbar a').forEach(a => a.classList.toggle('active', a.dataset.tab === name || (name === 'settings' && a.dataset.tab === 'home')));
  const root = document.getElementById('view');
  const keepScroll = key === lastRoute ? window.scrollY : 0;
  root.replaceChildren();
  views[name].render(root, app, params);
  window.scrollTo(0, keepScroll);
  lastRoute = key;
}

async function recoverIfNeeded(now) {
  if (!state.active) return null;
  const a = recoverActive(state.active, now);
  const { state: next, receipt } = finalizeSession(state, a, now);
  // Keep whatever frames were captured before the app died.
  try {
    if (!(await getMeta(a.id))) {
      const frames = await loadFrames(a.id);
      if (frames.length) {
        await saveMeta({ sessionId: a.id, createdAt: now, bytes: frames.reduce((x, b) => x + b.size, 0), frames: frames.length, starred: false });
        const rec = next.sessions.find(x => x.id === a.id);
        if (rec) rec.hasTimelapse = true;
      }
    }
  } catch {}
  state = next;
  const course = state.term.courses.find(c => c.id === a.courseId);
  return () => showReceipt(receipt, { courseCode: course ? course.code : a.courseId, recovered: true });
}

function onVisible() {
  if (document.visibilityState !== 'visible' || !state || state.active) return;
  const d = dayKey(new Date(app.now()));
  if (d !== lastDay) { lastDay = d; app.commit(ensureDay(state, app.now())); }
}

async function boot() {
  state = await loadState();
  const demo = new URLSearchParams(location.search).get('demo');
  if (demo && location.hostname === 'localhost') state = (await import('./demo.js')).demoState(demo, app.now());
  setSoundEnabled(() => state && state.settings.sound);
  const now = app.now();
  const showRecovered = await recoverIfNeeded(now);
  state = ensureDay(state, now);
  lastDay = dayKey(new Date(now));
  await saveState(state).catch(() => {});
  window.addEventListener('hashchange', render);
  document.addEventListener('visibilitychange', onVisible);
  document.addEventListener('pointerdown', unlockAudio, { once: true });
  render();
  if (showRecovered) showRecovered();
  purge(now, state.settings.capMB * 1024 * 1024);
  requestPersist();
  if ('serviceWorker' in navigator && location.hostname !== '127.0.0.1') {
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
