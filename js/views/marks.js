// Marks: course list and course detail with score entry and editing.
import { h, money, fmtMin, fmtPct, fmtDate, toast, bar } from '../dom.js';
import { computeCourse, twelvePoint, overallAverage, passWarnings, parseScore, neededOnFinal } from '../grades.js';
import { fileMark } from '../marks.js';
import { dayKey, weekKey } from '../time.js';
import { playCash } from '../sound.js';
import { achievementById } from '../achievements.js';

const editing = new Set();
const clone = o => JSON.parse(JSON.stringify(o));

function statusChip(r, c) {
  const map = { 'on-track': ['green', 'ON TRACK'], locked: ['green', 'LOCKED IN'], behind: ['red', 'BEHIND'], 'out-of-reach': ['red', 'OUT OF REACH'], 'no-data': ['dim', 'NO MARKS YET'] };
  const [cls, label] = map[r.status];
  return h('span', { class: `pill ${cls}` }, label);
}

function gradeText(c, pct) {
  if (pct === null) return '—';
  return c.school === 'laurier' ? `${pct.toFixed(1)}% · ${twelvePoint(pct).letter} (${twelvePoint(pct).points}/12)` : `${pct.toFixed(1)}%`;
}

function neededText(c, r) {
  if (r.status === 'locked') return `🎉 ${c.target}% is locked in, even with zeros on the rest.`;
  if (r.status === 'out-of-reach') return `Out of reach — the max possible now is ${fmtPct(r.maxPossible)}.`;
  if (!r.remaining) return r.current >= c.target ? 'All graded. Target met.' : 'All graded.';
  return `Need ${r.needed.toFixed(1)}% average on everything left for ${c.target}%.`;
}

export function render(root, app, params) {
  if (params[0]) return renderCourse(root, app, params[0]);
  const s = app.state;
  const avg = overallAverage(s.term.courses);
  root.append(h('div', { class: 'stack' },
    h('div', { class: 'topbar' }, h('h1', null, 'Marks'), h('span', { class: 'mono gold' }, 'Avg ' + fmtPct(avg))),
    s.term.courses.map(c => {
      const r = computeCourse(c);
      return h('a', { class: 'card tap stack', href: '#school/' + c.id, style: { textDecoration: 'none', color: 'inherit' } },
        h('div', { class: 'between' }, h('div', null, h('b', null, c.code), h('div', { class: 'small dim' }, c.name)), statusChip(r, c)),
        h('div', { class: 'between mono' }, h('span', { class: 'big', style: { fontSize: '26px' } }, gradeText(c, r.current)), h('span', { class: 'small dim' }, `target ${c.target}%`)),
        r.current !== null ? bar(r.current, r.current >= c.target ? 'green' : 'red') : null,
        h('div', { class: 'small dim' }, neededText(c, r)));
    })));
}

function renderCourse(root, app, id) {
  const s = app.state;
  const c = s.term.courses.find(x => x.id === id);
  if (!c) { root.append(h('p', null, 'Course not found. ', h('a', { href: '#school' }, 'Back'))); return; }
  const r = computeCourse(c);
  const warnings = passWarnings(c);
  const nf = neededOnFinal(c);
  const wk = weekKey(dayKey(new Date(app.now())));
  const mine = s.sessions.filter(x => x.courseId === id && x.status === 'completed');
  const total = mine.reduce((a, x) => a + x.minutes, 0);
  const week = mine.filter(x => weekKey(dayKey(new Date(x.startedAt))) === wk).reduce((a, x) => a + x.minutes, 0);
  const isEditing = editing.has(id);

  const setCourse = (mut, msg) => { const st = clone(app.state); mut(st.term.courses.find(x => x.id === id)); app.commit(st); if (msg) toast(msg); };

  const onScore = (item, input) => {
    const v = parseScore(input.value);
    if (v === undefined) { input.classList.add('bad'); toast('Enter a % like 81, or a fraction like 17/20', { bad: true }); return; }
    input.classList.remove('bad');
    if (v === item.score) return;
    const { state, receipt } = fileMark(app.state, id, item.id, v, app.now());
    const paid = receipt.filing + receipt.beat;
    app.commit(state);
    if (paid) { playCash(); toast(`+${money(paid)} ${receipt.beat ? 'filing + beat-target bonus' : 'filing bonus'}`); }
    for (const a of receipt.newAchievements) toast(`🏆 ${achievementById(a).name}`);
  };

  const target = h('input', { class: 'input', type: 'number', inputmode: 'decimal', min: 0, max: 100, value: c.target, style: { width: '90px' },
    onchange: e => { const t = e.target.value.trim(), v = Number(t); if (t !== '' && v >= 0 && v <= 100) setCourse(x => { x.target = v; }); else { e.target.value = c.target; toast('Target must be 0–100', { bad: true }); } } });
  const finalDate = h('input', { class: 'input', type: 'date', value: c.finalDate || '', style: { maxWidth: '180px' },
    onchange: e => setCourse(x => { x.finalDate = e.target.value || null; }, 'Final date saved') });

  const comps = c.components.map((comp, ci) => {
    const per = comp.weight / comp.items.length;
    return h('div', { class: 'card stack' },
      h('div', { class: 'between' },
        isEditing ? h('input', { class: 'input', value: comp.name, onchange: e => setCourse(x => { x.components[ci].name = e.target.value; }) }) : h('b', null, comp.name),
        isEditing ? h('input', { class: 'input', type: 'number', inputmode: 'decimal', value: comp.weight, style: { width: '84px' }, 'aria-label': 'Weight',
          onchange: e => { const v = Number(e.target.value); if (v >= 0) setCourse(x => { x.components[ci].weight = v; }); } }) : h('span', { class: 'mono dim small' }, `${comp.weight}%`)),
      h('div', { class: 'list' }, comp.items.map((it, ii) => isEditing
        ? h('div', { class: 'li' },
            h('input', { class: 'input', value: it.name, onchange: e => setCourse(x => { x.components[ci].items[ii].name = e.target.value; }) }),
            h('input', { class: 'input', type: 'date', value: it.date || '', style: { maxWidth: '150px' }, onchange: e => setCourse(x => { x.components[ci].items[ii].date = e.target.value || null; }) }),
            h('button', { class: 'icon-btn', 'aria-label': 'Remove', disabled: comp.items.length <= 1, onclick: () => setCourse(x => { x.components[ci].items.splice(ii, 1); }) }, '✕'))
        : h('div', { class: 'li' },
            h('div', { class: 'name' }, h('div', null, it.name), h('div', { class: 'small dim mono' }, `${fmtDate(it.date)} · ${per.toFixed(per % 1 ? 2 : 0)}%`)),
            h('input', { class: 'input score', inputmode: 'decimal', placeholder: '—', value: it.score ?? '', 'aria-label': `${it.name} score`,
              onchange: e => onScore(it, e.target), onkeydown: e => { if (e.key === 'Enter') e.target.blur(); } })))),
      isEditing ? h('button', { class: 'btn btn-ghost', onclick: () => setCourse(x => { const cc = x.components[ci]; cc.items.push({ id: 'n' + Date.now().toString(36), name: `Item ${cc.items.length + 1}`, date: null, score: null }); }) }, '+ Add item') : null);
  });

  const weightSum = c.components.reduce((a, x) => a + x.weight, 0);

  root.append(h('div', { class: 'stack' },
    h('div', { class: 'topbar' }, h('a', { class: 'icon-btn', href: '#school', 'aria-label': 'Back' }, '‹'),
      h('div', { class: 'center' }, h('b', null, c.code), h('div', { class: 'small dim' }, c.name)),
      h('button', { class: 'icon-btn', 'aria-label': isEditing ? 'Done editing' : 'Edit', onclick: () => {
        if (isEditing && Math.abs(weightSum - 100) > 0.001) { toast(`Weights add to ${weightSum}%, they need to add to 100%`, { bad: true }); return; }
        isEditing ? editing.delete(id) : editing.add(id); app.render();
      } }, isEditing ? '✓' : '✎')),
    h('div', { class: 'split' },
      h('div', { class: 'stack' },
        h('div', { class: 'card stack' },
          h('div', { class: 'between' }, h('span', { class: 'label' }, 'Current'), statusChip(r, c)),
          h('div', { class: 'big' }, gradeText(c, r.current)),
          r.current !== null ? bar(r.current, r.current >= c.target ? 'green' : 'red') : null,
          h('div', { class: r.status === 'behind' || r.status === 'out-of-reach' ? 'red small' : 'small' }, neededText(c, r)),
          nf !== null && r.remaining && r.status !== 'out-of-reach' && r.status !== 'locked' ? h('div', { class: 'small dim' }, nf === Infinity
            ? `The final alone can't get you to ${c.target}% unless your other remaining work beats your current average.`
            : `On the final alone (if the rest matches your current average): ${nf.toFixed(1)}%`) : null,
          warnings.map(w => h('div', { class: 'red small' }, '⚠ ' + w)),
          h('div', { class: 'between small' }, h('span', { class: 'dim' }, 'Target %'), target),
          h('div', { class: 'between small' }, h('span', { class: 'dim' }, 'Final exam date'), finalDate),
          c.bonus ? h('div', { class: 'between small' }, h('span', { class: 'dim' }, `${c.bonus.label} (max ${c.bonus.max})`),
            h('input', { class: 'input score', inputmode: 'decimal', value: c.bonus.value ?? '', placeholder: '0',
              onchange: e => { const t = e.target.value.trim(); const v = t === '' ? null : Number(t); if (v === null || (v >= 0 && v <= c.bonus.max)) setCourse(x => { x.bonus.value = v; }); else toast(`Bonus is 0–${c.bonus.max}`, { bad: true }); } })) : null),
        h('div', { class: 'card grid2' },
          h('div', null, h('div', { class: 'label' }, 'Studied'), h('div', { class: 'mono', style: { fontSize: '20px', fontWeight: 800 } }, fmtMin(total))),
          h('div', null, h('div', { class: 'label' }, 'This week'), h('div', { class: 'mono', style: { fontSize: '20px', fontWeight: 800 } }, fmtMin(week)))),
        isEditing ? h('div', { class: 'card small ' + (Math.abs(weightSum - 100) > 0.001 ? 'red' : 'dim') }, `Weights total ${weightSum}% (must be 100%)`) : null),
      h('div', { class: 'stack' }, comps))));
}
