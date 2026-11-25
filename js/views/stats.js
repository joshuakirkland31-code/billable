// Stats: totals, charts, history, time-lapse player, achievements.
import { h, money, fmtMin, fmtDate } from '../dom.js';
import { dayKey, weekKey, addDays, daysBetween } from '../time.js';
import { achievementsFor } from '../achievements.js';

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

export function render(root, app) {
  const s = app.state;
  const today = dayKey(new Date(app.now()));
  const done = s.sessions.filter(x => x.status === 'completed');
  const total = done.reduce((a, x) => a + x.minutes, 0);
  const rate = s.sessions.length ? Math.round((done.length / s.sessions.length) * 100) : 0;
  const wk = weekKey(today), prevWk = addDays(wk, -7);
  const inWeek = w => done.filter(x => weekKey(dayKey(new Date(x.startedAt))) === w).reduce((a, x) => a + x.minutes, 0);
  const thisW = inWeek(wk), lastW = inWeek(prevWk);
  const all = achievementsFor(s);
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
      h('div', { class: 'between' }, h('span', { class: 'label' }, 'History'), h('a', { href: '#home', class: 'small' }, '‹ Home')),
      history.length ? h('div', { class: 'list' }, history.map(x => h('div', { class: 'li' },
        h('div', { class: 'name' }, h('div', null, `${courseName(s, x.courseId)} · ${fmtMin(x.minutes)}`),
          h('div', { class: 'small dim mono' }, `${fmtDate(dayKey(new Date(x.startedAt)))} ${new Date(x.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`)),
        h('div', { class: 'row' },
          x.status === 'completed' ? h('span', { class: 'mono green small' }, '+' + money(x.earned)) : h('span', { class: 'mono red small' }, `−${money(x.fine)} ${x.status === 'walkedout' ? 'walked out' : 'left'}`),
          x.goalMin ? h('span', { class: 'pill ' + (x.minutes >= x.goalMin ? 'green' : 'gold') }, `goal ${x.goalMin}m`) : null))))
        : h('p', { class: 'dim small' }, 'No sessions yet. Clock in from Home.')),
    h('div', { class: 'card stack' },
      h('div', { class: 'between' }, h('span', { class: 'label' }, 'Achievements'), h('span', { class: 'mono small' }, `${Object.keys(s.career.achievements).length}/${all.length}`)),
      h('div', { class: 'ach-grid' }, all.map(a => {
        const got = s.career.achievements[a.id];
        const hidden = a.secret && !got;
        return h('div', { class: 'ach ' + (got ? 'got' : 'locked') }, h('div', { class: 't' }, hidden ? '???' : a.name), h('div', { class: 'dim' }, hidden ? 'Secret' : a.desc));
      })))));
}
