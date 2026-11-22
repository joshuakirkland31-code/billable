// Clock In: pick course + length, then a camera-watched, leave-the-app-and-fail session.
import { h, money, fmtClock, fmtMin, toast, confirmSheet, openSheet } from '../dom.js';
import { startSession, onHide, onShow, elapsedMs, tick, walkOut, clockOut, finalizeSession, examMultFor, heartbeat, GRACE_MS } from '../session.js';
import { payFor, fineFor, payCtx } from '../economy.js';
import { startCamera, stopCamera, cameraLive, acquireWakeLock, releaseWakeLock } from '../camera.js';
import { startRecorder, deleteTimelapse } from '../timelapse.js';
import { saveState } from '../store.js';
import { showReceipt } from './receipt.js';
import { playCash, unlockAudio } from '../sound.js';

const LENGTHS = [15, 25, 50, 90];
let setup = { courseId: null, targetMin: 25 };
let rt = null; // runtime for the live session

const courseCode = (s, id) => id === 'OTHER' ? 'Other' : ((s.term.courses.find(c => c.id === id) || {}).code || id);

export function render(root, app) {
  if (app.state.active && rt) return renderRunning(root, app);
  return renderSetup(root, app);
}

function renderSetup(root, app) {
  const s = app.state;
  if (!setup.courseId) setup.courseId = s.term.courses[0].id;
  const estimate = () => payFor(setup.targetMin, payCtx(s.career, { examMult: examMultFor(s, setup.courseId, app.now()) }));
  const est = h('span', { class: 'gold mono' });
  const updateEst = () => { est.textContent = '≈ ' + money(estimate()); };
  const courseChips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Course' });
  const lenChips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Length' });
  const custom = h('input', { class: 'input', type: 'number', inputmode: 'numeric', min: 15, max: 180, placeholder: 'Custom (15–180 min)', style: { maxWidth: '220px' } });

  const drawCourses = () => courseChips.replaceChildren(...[...s.term.courses.map(c => [c.id, c.code]), ['OTHER', 'Other']].map(([id, label]) =>
    h('button', { class: 'chip', 'aria-pressed': String(setup.courseId === id), onclick: () => { setup.courseId = id; drawCourses(); updateEst(); } }, label)));
  const drawLens = () => lenChips.replaceChildren(...LENGTHS.map(m =>
    h('button', { class: 'chip', 'aria-pressed': String(setup.targetMin === m && !custom.value), onclick: () => { custom.value = ''; setup.targetMin = m; drawLens(); updateEst(); } }, `${m} min`)));
  custom.addEventListener('input', () => {
    const v = Math.round(Number(custom.value));
    custom.classList.toggle('bad', !!custom.value && !(v >= 15 && v <= 180));
    if (v >= 15 && v <= 180) setup.targetMin = v;
    drawLens(); updateEst();
  });
  drawCourses(); drawLens(); updateEst();

  root.append(h('div', { class: 'stack' },
    h('div', { class: 'topbar' }, h('a', { class: 'icon-btn', href: '#home', 'aria-label': 'Back' }, '‹'), h('div', { class: 'label' }, 'Clock in'), h('span', { style: { width: '44px' } })),
    h('div', { class: 'card stack' }, h('div', { class: 'label' }, 'Billing to'), courseChips),
    h('div', { class: 'card stack' }, h('div', { class: 'label' }, 'Target length'), lenChips, custom,
      h('div', { class: 'between small' }, h('span', { class: 'dim' }, 'Full session pays'), est)),
    h('div', { class: 'card small dim stack' },
      h('div', null, '📷 Your front camera watches you and saves a time-lapse (kept 7 days).'),
      h('div', null, `🚪 Leave the app for more than ${GRACE_MS / 1000} seconds and the session fails, with a 10% fine.`),
      h('div', null, '⏱ Hit your target, then keep going in overtime or clock out.')),
    h('button', { class: 'btn btn-gold btn-xl btn-block', onclick: () => {
      const v = Number(custom.value);
      if (custom.value && !(v >= 15 && v <= 180)) { toast('Custom length must be 15–180 minutes', { bad: true }); return; }
      begin(app);
    } }, '▶  START SHIFT')));
}

async function begin(app) {
  if (rt) return; // double-tap guard
  unlockAudio();
  const now = app.now();
  const a = startSession({ courseId: setup.courseId, targetMin: setup.targetMin, watched: true, now });
  rt = { a, video: h('video', { playsinline: true, muted: true, autoplay: true }), camOK: false, recorder: null, timer: null, lastPersist: 0, hit: false, ending: false, recFailed: false };
  await app.commit({ ...app.state, active: a });
  rt.camOK = await startCamera(rt.video);
  if (!rt.camOK) { rt.a = { ...rt.a, watched: false }; toast('No camera — this shift is unwatched (pay ×0.8)', { ms: 4000 }); }
  else {
    rt.recorder = startRecorder(rt.a.id, rt.video, () => `${courseCode(app.state, rt.a.courseId)} · ${fmtClock(elapsedMs(rt.a, app.now()))}`,
      { onError: () => { rt.recFailed = true; toast('Storage full — time-lapse stopped for this shift', { bad: true }); } });
  }
  const woke = await acquireWakeLock();
  if (!woke && !app.state.career.tipsShown.autolock) {
    toast('Tip: set Auto-Lock to Never while studying (Settings → Display & Brightness)', { ms: 6000 });
    const st = JSON.parse(JSON.stringify(app.state)); st.career.tipsShown.autolock = true; st.active = rt.a;
    app.commit(st, { rerender: false });
  }
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('pagehide', onPageHide);
  window.__sessionHooks = { hide: () => hidden(app), show: () => shown(app) };
  rt.app = app;
  rt.timer = setInterval(() => update(app), 500);
  persist(app, true);
  app.render();
}

function persist(app, force = false) {
  const now = app.now();
  if (!force && now - rt.lastPersist < 15000) return;
  rt.lastPersist = now;
  rt.a = heartbeat(rt.a, now);
  const st = { ...app.state, active: rt.a };
  app.commit(st, { rerender: false });
}

function hidden(app) {
  if (!rt || rt.ending) return;
  rt.a = onHide(rt.a, app.now());
  saveState({ ...app.state, active: rt.a }).catch(() => {});
}

async function shown(app) {
  if (!rt || rt.ending) return;
  rt.a = onShow(rt.a, app.now());
  if (rt.a.status === 'failed' || rt.a.status === 'completed') return end(app, 'settled');
  if (rt.camOK && !cameraLive()) await startCamera(rt.video);
  if (!rt || rt.ending) return;
  acquireWakeLock();
  persist(app, true);
  update(app);
}

function onVis() { if (!rt) return; if (document.visibilityState === 'hidden') hidden(rt.app); else shown(rt.app); }
function onPageHide() { if (rt) hidden(rt.app); }

function update(app) {
  if (!rt || rt.ending || rt.a.hiddenAt !== null) return;
  const now = app.now();
  const before = rt.a.status;
  rt.a = tick(rt.a, now);
  if (before === 'running' && rt.a.status === 'overtime' && !rt.hit) {
    rt.hit = true; playCash();
    toast('🎯 Target hit — keep going for overtime, or clock out', { ms: 5000 });
    app.render();
    return;
  }
  const el = document.getElementById('sess-clock');
  if (!el) return;
  const ms = elapsedMs(rt.a, now);
  const target = rt.a.targetMin * 60000;
  el.textContent = rt.a.status === 'overtime' ? '+' + fmtClock(ms - target) : fmtClock(target - ms);
  const ctx = payCtx(app.state.career, { unwatched: !rt.a.watched, examMult: examMultFor(app.state, rt.a.courseId, rt.a.startedAt) });
  document.getElementById('sess-earned').textContent = money(payFor(Math.floor(ms / 60000), ctx));
  const p = document.getElementById('sess-bar'); if (p) p.style.width = Math.min(100, (ms / target) * 100) + '%';
  persist(app);
}

function renderRunning(root, app) {
  const s = app.state, a = rt.a;
  const code = courseCode(s, a.courseId);
  const over = a.status === 'overtime';
  const cam = h('div', { class: 'cam' }, rt.camOK ? rt.video : h('div', { class: 'nocam' }, h('div', null, '📷', h('br'), 'Camera unavailable', h('br'), h('span', { class: 'small' }, 'Unwatched shift · pay ×0.8'))),
    h('div', { class: 'rec' }, rt.camOK ? 'REC' : 'UNWATCHED'), h('div', { class: 'tag' }, code));
  const ctx = payCtx(s.career, { unwatched: !a.watched, examMult: examMultFor(s, a.courseId, a.startedAt) });
  root.append(h('div', { class: 'session running' }, cam,
    h('div', { class: 'stack' },
      h('div', { class: 'card center stack' },
        h('div', { class: 'label' }, over ? 'Overtime' : `Target ${a.targetMin} min`),
        h('div', { id: 'sess-clock', class: 'huge' + (over ? ' overtime' : '') }, '--:--'),
        h('div', { class: 'bar' }, h('i', { id: 'sess-bar', style: { width: '0%' } })),
        h('div', { class: 'between' }, h('span', { class: 'label' }, 'Billed this shift'), h('b', { id: 'sess-earned', class: 'gold mono' }, '$0'))),
      over
        ? h('button', { class: 'btn btn-gold btn-xl btn-block', onclick: () => end(app, 'clockout') }, '■  CLOCK OUT')
        : h('button', { class: 'btn btn-red btn-block', onclick: async () => {
            const ok = await confirmSheet('Walk out?', `You haven't hit your target. You'll be fined ${money(fineFor(a.targetMin, ctx))}, earn nothing, and get no streak credit.`, 'Walk out', { danger: true });
            if (ok) end(app, 'walkout');
          } }, 'Walk out'),
      h('div', { class: 'small dim center' }, `Leaving the app for more than ${GRACE_MS / 1000}s ends the shift.`))));
  update(app);
}

async function end(app, kind) {
  if (!rt || rt.ending) return;
  rt.ending = true;
  const now = app.now();
  let a = rt.a;
  if (kind === 'clockout') a = clockOut(tick(a, now), now);
  else if (kind === 'walkout') a = walkOut(a, now);
  clearInterval(rt.timer);
  document.removeEventListener('visibilitychange', onVis);
  window.removeEventListener('pagehide', onPageHide);
  let rec = rt.recorder ? await rt.recorder.stop() : { frames: 0 };
  if (rt.recFailed || (rt.recorder && rt.recorder.failed)) { await deleteTimelapse(a.id).catch(() => {}); rec = { frames: 0 }; } // free space; no partial time-lapse
  stopCamera(); releaseWakeLock();
  rt = null; window.__sessionHooks = null;
  const fin = finalizeSession(app.state, a, now);
  if (rec.frames > 0) { const r = fin.state.sessions.find(x => x.id === a.id); if (r) r.hasTimelapse = true; }
  await app.commit(fin.state, { rerender: false });
  await showReceipt(fin.receipt, { courseCode: courseCode(app.state, a.courseId) });
  app.go('#home');
}
