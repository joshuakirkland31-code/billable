// Stats: totals, charts, history, time-lapse player, achievements.
import { h, money, fmtMin, fmtDate, toast, openSheet } from '../dom.js';
import { dayKey, weekKey, addDays, daysBetween } from '../time.js';
import { ACHIEVEMENTS } from '../achievements.js';
import { listMeta, loadFrames, playTimelapse, setStarred, wouldExceedCap, exportVideo, shareVideo, canExportVideo, usage, deleteTimelapse } from '../timelapse.js';

const NS = 'http://www.w3.org/2000/svg';
const sv = (tag, a = {}, text) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); if (text !== undefined) e.textContent = text; return e; };
const TERM_START = '2026-09-10', TERM_END = '2026-12-23';

function courseName(s, id) { return id === 'OTHER' ? 'Other' : ((s.term.courses.find(c => c.id === id) || {}).code || id); }

function byCourseChart(s, done) {
  const ids = [...s.term.courses.map(c => c.id), 'OTHER'];
  const mins = ids.map(id => done.filter(x => x.courseId === id).reduce((a, x) => a + x.minutes, 0));
  const max = Math.max(1, ...mins);
  const rowH = 26, W = 340;
  const svg = sv('svg', { viewBox: `0 0 ${W} ${ids.length * rowH}`, class: 'chart', role: 'img', 'aria-label': 'Hours by course' });
  ids.forEach((id, i) => {
    const y = i * rowH;
    const w = (mins[i] / max) * (W - 150);
    svg.append(sv('text', { x: 0, y: y + 17, fill: '#7d8a9c', 'font-size': 12, 'font-family': 'ui-monospace,monospace' }, courseName(s, id)));
    svg.append(sv('rect', { x: 80, y: y + 6, width: Math.max(2, w), height: 14, rx: 4, fill: mins[i] ? '#f5c451' : '#1f2a3a' }));
    svg.append(sv('text', { x: 86 + Math.max(2, w), y: y + 17, fill: '#e6edf3', 'font-size': 12, 'font-family': 'ui-monospace,monospace' }, fmtMin(mins[i])));
  });
  return svg;
}

function dailyChart(done, today) {
  const end = today < TERM_END ? today : TERM_END;
  const n = Math.max(1, daysBetween(TERM_START, end) + 1);
  const per = {};
  for (const x of done) { const d = dayKey(new Date(x.startedAt)); per[d] = (per[d] || 0) + x.minutes; }
  const vals = Array.from({ length: n }, (_, i) => per[addDays(TERM_START, i)] || 0);
  const max = Math.max(60, ...vals);
  const W = 340, H = 110, bw = W / n;
  const svg = sv('svg', { viewBox: `0 0 ${W} ${H + 16}`, class: 'chart', role: 'img', 'aria-label': 'Minutes studied per day this term' });
  svg.append(sv('line', { x1: 0, y1: H, x2: W, y2: H, stroke: '#1f2a3a' }));
  vals.forEach((v, i) => {
    if (!v) return;
    const bh = (v / max) * (H - 6);
    svg.append(sv('rect', { x: i * bw + bw * 0.12, y: H - bh, width: Math.max(1, bw * 0.76), height: bh, fill: addDays(TERM_START, i) === today ? '#ffdf8a' : '#f5c451', rx: 1 }));
  });
  svg.append(sv('text', { x: 0, y: H + 13, fill: '#7d8a9c', 'font-size': 10, 'font-family': 'ui-monospace,monospace' }, fmtDate(TERM_START)));
  svg.append(sv('text', { x: W, y: H + 13, fill: '#7d8a9c', 'font-size': 10, 'text-anchor': 'end', 'font-family': 'ui-monospace,monospace' }, fmtDate(end)));
  svg.append(sv('text', { x: W, y: 10, fill: '#7d8a9c', 'font-size': 10, 'text-anchor': 'end', 'font-family': 'ui-monospace,monospace' }, `max ${fmtMin(max)}`));
  return svg;
}

async function openPlayer(app, rec) {
  const frames = await loadFrames(rec.id);
  if (!frames.length) { toast('No frames saved for this session', { bad: true }); return; }
  const canvas = h('canvas', { class: 'tl-canvas', width: 360, height: 480 });
  const range = h('input', { type: 'range', min: 0, max: frames.length - 1, value: 0, 'aria-label': 'Scrub' });
  const playBtn = h('button', { class: 'btn btn-gold' }, '▶ PLAY');
  const metas = await listMeta();
  const meta = metas.find(m => m.sessionId === rec.id);
  let starred = !!(meta && meta.starred);
  const starBtn = h('button', { class: 'btn' }, starred ? '★ Starred' : '☆ Keep forever');
  const player = playTimelapse(canvas, frames, { onFrame: i => { range.value = i; if (i >= frames.length - 1) playBtn.textContent = '▶ PLAY'; } });
  playBtn.onclick = () => { if (player.playing) { player.pause(); playBtn.textContent = '▶ PLAY'; } else { player.play(); playBtn.textContent = '❚❚ PAUSE'; } };
  range.oninput = () => { player.seek(Number(range.value)); playBtn.textContent = '▶ PLAY'; };
  starBtn.onclick = async () => {
    const cap = app.state.settings.capMB * 1024 * 1024;
    const next = !starred;
    if (next && wouldExceedCap(metas.map(m => m.sessionId === rec.id ? { ...m, starred: true } : m), cap)) {
      toast('Starred time-lapses would exceed your storage cap — raise it in Settings or unstar others', { bad: true, ms: 4500 }); return;
    }
    await setStarred(rec.id, next); starred = next;
    starBtn.textContent = starred ? '★ Starred' : '☆ Keep forever';
  };
  // Two taps: render first, then share from a fresh tap (iOS requires a recent tap for the share sheet).
  let rendered = null;
  const saveBtn = canExportVideo() ? h('button', { class: 'btn', onclick: async () => {
    if (rendered) {
      try { await shareVideo(rendered); } catch (e) { if (!(e && e.name === 'AbortError')) toast('Could not open the share sheet', { bad: true }); }
      return;
    }
    saveBtn.disabled = true; saveBtn.textContent = 'Rendering…';
    try {
      rendered = await exportVideo(rec.id, { label: `billable-${courseName(app.state, rec.courseId)}-${dayKey(new Date(rec.startedAt))}`.replace(/\s+/g, '') });
      if (!rendered) toast('Video export isn\'t supported here', { bad: true });
    } catch (e) { toast('Could not render the video', { bad: true }); }
    saveBtn.disabled = false;
    saveBtn.textContent = rendered ? '⤓ Tap to save video' : '⤓ Make video';
    if (rendered) saveBtn.classList.add('btn-gold');
  } }, '⤓ Make video') : null;
  const delBtn = h('button', { class: 'btn btn-red', onclick: async () => {
    await deleteTimelapse(rec.id);
    const st = JSON.parse(JSON.stringify(app.state)); const r = st.sessions.find(x => x.id === rec.id); if (r) r.hasTimelapse = false;
    close(); app.commit(st); toast('Time-lapse deleted');
  } }, 'Delete');
  const close = openSheet(h('div', { class: 'stack' },
    h('div', { class: 'between' }, h('b', null, `${courseName(app.state, rec.courseId)} · ${fmtDate(dayKey(new Date(rec.startedAt)))}`),
      h('span', { class: 'pill ' + (rec.status === 'completed' ? 'green' : 'red') }, rec.status === 'completed' ? fmtMin(rec.minutes) : 'WALKED OUT')),
    canvas, range,
    h('div', { class: 'grid2' }, playBtn, starBtn),
    h('div', { class: 'grid2' }, saveBtn || h('span'), delBtn),
    h('div', { class: 'small dim' }, `${frames.length} frames · auto-deletes 7 days after recording unless starred.`)),
    { onClose: () => player.destroy() });
}

export function render(root, app) {
  const s = app.state;
  const today = dayKey(new Date(app.now()));
  const done = s.sessions.filter(x => x.status === 'completed');
  const total = done.reduce((a, x) => a + x.minutes, 0);
  const rate = s.sessions.length ? Math.round((done.length / s.sessions.length) * 100) : 0;
  const wk = weekKey(today), prevWk = addDays(wk, -7);
  const inWeek = w => done.filter(x => weekKey(dayKey(new Date(x.startedAt))) === w).reduce((a, x) => a + x.minutes, 0);
  const thisW = inWeek(wk), lastW = inWeek(prevWk);
  const storage = h('span', { class: 'mono small dim' }, '…');
  usage().then(u => { storage.textContent = `${(u.bytes / 1048576).toFixed(1)} MB of ${s.settings.capMB} MB · ${u.count} time-lapses`; });
  const history = [...s.sessions].reverse().slice(0, 60);

  root.append(h('div', { class: 'stack' },
    h('h1', null, 'Stats'),
    h('div', { class: 'grid2' },
      h('div', { class: 'card' }, h('div', { class: 'label' }, 'Total billed'), h('div', { class: 'big', style: { fontSize: '26px' } }, fmtMin(total))),
      h('div', { class: 'card' }, h('div', { class: 'label' }, 'Sessions'), h('div', { class: 'big', style: { fontSize: '26px' } }, String(done.length)), h('div', { class: 'small dim mono' }, `${rate}% completed`)),
      h('div', { class: 'card' }, h('div', { class: 'label' }, 'This week'), h('div', { class: 'big', style: { fontSize: '26px' } }, fmtMin(thisW)),
        h('div', { class: 'small mono ' + (thisW >= lastW ? 'green' : 'red') }, `${thisW >= lastW ? '▲' : '▼'} vs ${fmtMin(lastW)} last week`)),
      h('div', { class: 'card' }, h('div', { class: 'label' }, 'Best streak'), h('div', { class: 'big', style: { fontSize: '26px' } }, `🔥 ${s.career.streak.best || 0}`))),
    h('div', { class: 'split' },
      h('div', { class: 'card stack' }, h('div', { class: 'label' }, 'Hours by course'), byCourseChart(s, done)),
      h('div', { class: 'card stack' }, h('div', { class: 'label' }, 'Daily this term'), dailyChart(done, today))),
    h('div', { class: 'card stack' },
      h('div', { class: 'between' }, h('span', { class: 'label' }, 'History'), storage),
      history.length ? h('div', { class: 'list' }, history.map(x => h('div', { class: 'li' },
        h('div', { class: 'name' }, h('div', null, `${courseName(s, x.courseId)} · ${fmtMin(x.minutes)}`),
          h('div', { class: 'small dim mono' }, `${fmtDate(dayKey(new Date(x.startedAt)))} ${new Date(x.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`)),
        h('div', { class: 'row' },
          x.status === 'completed' ? h('span', { class: 'mono green small' }, '+' + money(x.earned)) : h('span', { class: 'mono red small' }, `−${money(x.fine)} ${x.status === 'walkedout' ? 'walked out' : 'left'}`),
          x.hasTimelapse ? h('button', { class: 'icon-btn', 'aria-label': 'Play time-lapse', onclick: () => openPlayer(app, x) }, '▶') : null))))
        : h('p', { class: 'dim small' }, 'No sessions yet. Clock in from Home.')),
    h('div', { class: 'card stack' },
      h('div', { class: 'between' }, h('span', { class: 'label' }, 'Achievements'), h('span', { class: 'mono small' }, `${Object.keys(s.career.achievements).length}/${ACHIEVEMENTS.length}`)),
      h('div', { class: 'ach-grid' }, ACHIEVEMENTS.map(a => {
        const got = s.career.achievements[a.id];
        const hidden = a.secret && !got;
        return h('div', { class: 'ach ' + (got ? 'got' : 'locked') }, h('div', { class: 't' }, hidden ? '???' : a.name), h('div', { class: 'dim' }, hidden ? 'Secret' : a.desc));
      })))));
}
