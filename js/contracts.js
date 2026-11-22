// Daily "client contracts": 3 per day, deterministic per date.
const done = s => s.filter(x => x.status === 'completed');
const mins = (s, pred = () => true) => done(s).filter(pred).reduce((a, x) => a + x.minutes, 0);
const hourOf = x => new Date(x.startedAt).getHours();

export const CONTRACTS = [
  { id: 'two_courses', label: 'Study 2 different courses', rewardMin: 15,
    check: s => new Set(done(s).map(x => x.courseId)).size >= 2 },
  { id: 'early_bird', label: 'Clock in before 10 am', rewardMin: 15,
    check: s => done(s).some(x => { const h = hourOf(x); return h >= 4 && h < 10; }) },
  { id: 'deep_work', label: 'One session of 50+ min', rewardMin: 20,
    check: s => done(s).some(x => x.minutes >= 50) },
  { id: 'marathon', label: 'Bill 90 minutes total', rewardMin: 20,
    check: s => mins(s) >= 90 },
  { id: 'triple', label: 'Finish 3 sessions', rewardMin: 20,
    check: s => done(s).length >= 3 },
  { id: 'night_shift', label: 'Clock in after 9 pm', rewardMin: 10,
    check: s => done(s).some(x => { const h = hourOf(x); return h >= 21 || h < 4; }) },
  { id: 'math_day', label: '30 min on MATH 135 or 137', rewardMin: 15,
    check: s => mins(s, x => x.courseId === 'MATH135' || x.courseId === 'MATH137') >= 30 },
  { id: 'econ_day', label: '30 min on EC120', rewardMin: 15,
    check: s => mins(s, x => x.courseId === 'EC120') >= 30 },
  { id: 'code_day', label: '30 min on CS 115', rewardMin: 15,
    check: s => mins(s, x => x.courseId === 'CS115') >= 30 },
  { id: 'biz_day', label: '30 min on BU111', rewardMin: 15,
    check: s => mins(s, x => x.courseId === 'BU111') >= 30 },
  { id: 'no_walkouts', label: '2 sessions, zero walk-outs', rewardMin: 15,
    check: s => done(s).length >= 2 && !s.some(x => x.status !== 'completed') },
  { id: 'study_behind', label: '30 min on your behind-target course', rewardMin: 60, special: true,
    check: (s, ctx) => !!ctx.behind && mins(s, x => x.courseId === ctx.behind) >= 30 },
];

export const ALL_DONE_BONUS_MIN = 30;

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const byId = id => CONTRACTS.find(c => c.id === id);

/** ctx = { behind: courseId|null } */
export function dailyContracts(dayKey, ctx = {}) {
  const rnd = mulberry32(hash(dayKey));
  const pool = CONTRACTS.filter(c => !c.special);
  const out = [];
  if (ctx.behind) out.push(byId('study_behind'));
  while (out.length < 3) {
    const c = pool[Math.floor(rnd() * pool.length)];
    if (!out.includes(c)) out.push(c);
  }
  return out;
}

/** Returns contract ids newly satisfied (not in doneIds) and whether all are done. */
export function evaluateContracts(ids, doneIds, todaySessions, ctx) {
  const newly = ids.filter(id => !doneIds.includes(id) && byId(id) && byId(id).check(todaySessions, ctx));
  const allDone = ids.every(id => doneIds.includes(id) || newly.includes(id));
  return { newly, allDone };
}

export function contractLabel(id, ctx = {}, courseCode = null) {
  if (id === 'study_behind' && courseCode) return `30 min on ${courseCode} (behind target) · 2×`;
  return byId(id) ? byId(id).label : id;
}
