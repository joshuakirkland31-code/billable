// Achievements: definitions and evaluation. Some grant exclusive office items.
import { dayKey, weekKey, addDays } from './time.js';
import { rankIndex } from './economy.js';
import { finalGrade, componentScore } from './grades.js';
import { ITEMS } from './items.js';

const done = s => s.sessions.filter(x => x.status === 'completed');
const totalMin = (s, pred = () => true) => done(s).filter(pred).reduce((a, x) => a + x.minutes, 0);
const hourOf = x => new Date(x.startedAt).getHours();
const count = (s, pred) => done(s).filter(pred).length;
const owned = s => Object.keys(s.career.owned).length;

function perfectWeek(s) {
  const days = new Set(done(s).filter(x => x.minutes >= 15).map(x => dayKey(new Date(x.startedAt))));
  const weeks = new Set([...days].map(weekKey));
  for (const w of weeks) {
    let all = true;
    for (let i = 0; i < 7; i++) if (!days.has(addDays(w, i))) { all = false; break; }
    if (all) return true;
  }
  return false;
}

function cleanRun(s, n) {
  let run = 0;
  for (const x of s.sessions) { run = x.status === 'completed' ? run + 1 : 0; if (run >= n) return true; }
  return false;
}

function deansList(s) {
  const vals = s.term.courses.map(c => finalGrade(c, null)).filter(v => v !== null);
  return vals.length >= 3 && vals.reduce((a, b) => a + b, 0) / vals.length >= 80;
}

function comeback(s) {
  return s.term.courses.some(c => {
    const m = c.components.find(x => x.id === 'mid'), f = c.components.find(x => x.id === 'final');
    const ms = m && componentScore(m, null), fs = f && componentScore(f, null);
    return ms !== null && ms !== undefined && fs !== null && fs !== undefined && fs > ms;
  });
}

const A = (id, name, desc, check, secret = false) => ({ id, name, desc, check, secret });
const COURSE_IDS = ['MATH137', 'CS115', 'MATH135', 'EC120', 'BU111'];

export const ACHIEVEMENTS = [
  A('first_shift', 'First Shift', 'Complete your first session', s => done(s).length >= 1),
  ...[3, 7, 14, 30, 60, 100].map(n => A(`streak_${n}`, `${n}-Day Streak`, `Reach a ${n}-day streak`, s => (s.career.streak.best || 0) >= n)),
  ...[1, 5, 10, 25, 50, 100, 200, 300, 500].map(n => A(`hours_${n}`, `${n} Billable Hour${n > 1 ? 's' : ''}`, `Study ${n} hours in total`, s => totalMin(s) >= n * 60)),
  ...[10, 50, 100, 250].map(n => A(`sessions_${n}`, `${n} Sessions`, `Complete ${n} sessions`, s => done(s).length >= n)),
  A('deep_90', 'Marathon', 'One session of 90+ minutes', s => done(s).some(x => x.minutes >= 90)),
  A('deep_50_x10', 'Deep Worker', '10 sessions of 50+ minutes', s => count(s, x => x.minutes >= 50) >= 10),
  A('overtime_30', 'Overtime', 'Go 30+ minutes past your target', s => done(s).some(x => x.minutes >= x.targetMin + 30)),
  A('early_bird', 'Early Bird', '5 sessions started before 8 am', s => count(s, x => { const h = hourOf(x); return h >= 4 && h < 8; }) >= 5),
  A('night_owl', 'Night Owl', '5 sessions started after 10 pm', s => count(s, x => { const h = hourOf(x); return h >= 22 || h < 4; }) >= 5),
  A('weekend_warrior', 'Weekend Warrior', '5 sessions on weekends', s => count(s, x => [0, 6].includes(new Date(x.startedAt).getDay())) >= 5),
  ...COURSE_IDS.map(id => A(`course_${id}_10h`, `${id} Specialist`, `10 hours on ${id}`, s => totalMin(s, x => x.courseId === id) >= 600)),
  ...COURSE_IDS.map(id => A(`course_${id}_25h`, `${id} Expert`, `25 hours on ${id}`, s => totalMin(s, x => x.courseId === id) >= 1500)),
  A('deans_list', "Dean's List", 'Average 80%+ across 3+ courses', deansList),
  ...[1, 5, 10].map(n => A(`beat_target_${n}`, n === 1 ? 'Above Target' : `Beat Target ×${n}`, `Beat your target on ${n} assessment${n > 1 ? 's' : ''}`, s => Object.keys(s.career.beatMarks || {}).length >= n)),
  A('comeback', 'Comeback', 'Score higher on a final than the midterm', comeback),
  A('filing_10', 'Paper Trail', 'Enter 10 marks', s => Object.keys(s.career.filedMarks || {}).length >= 10),
  ...[10, 50, 150].map(n => A(`contracts_${n}`, n === 50 ? 'Rainmaker' : `${n} Contracts`, `Close ${n} client contracts`, s => (s.career.contractsCompleted || 0) >= n)),
  A('perfect_week', 'Perfect Week', 'Study every day Monday to Sunday', perfectWeek),
  A('phoenix', 'Phoenix', 'Rebuild a broken 7+ streak back to 7', s => (s.career.streak.brokenFrom || 0) >= 7 && s.career.streak.count >= 7),
  A('clean_10', 'Clean Sheet', '10 sessions in a row without walking out', s => cleanRun(s, 10)),
  A('rank_analyst', 'Hired', 'Reach Analyst', s => rankIndex(s.career.xp) >= 3 || s.career.prestige > 0),
  A('rank_associate', 'Associate', 'Reach Associate', s => rankIndex(s.career.xp) >= 6 || s.career.prestige > 0),
  A('rank_vp', 'Vice President', 'Reach VP', s => rankIndex(s.career.xp) >= 9 || s.career.prestige > 0),
  A('rank_md', 'Managing Director', 'Reach Managing Director', s => rankIndex(s.career.xp) >= 11 || s.career.prestige > 0),
  A('rank_partner', 'Partner', 'Make Partner', s => rankIndex(s.career.xp) >= 12 || s.career.prestige > 0),
  A('prestige_1', 'Founder', 'Start your own firm', s => (s.career.prestige || 0) >= 1),
  A('prestige_3', 'Serial Founder', 'Open firms in 3 cities', s => (s.career.prestige || 0) >= 3),
  ...[5, 25, 50].map(n => A(`collector_${n}`, `Collector ${n}`, `Own ${n} office items`, s => owned(s) >= n)),
  A('millionaire', 'Seven Figures', 'Earn $1,000,000 lifetime', s => s.career.lifetime >= 1_000_000),
  A('all_nighter', 'All-Nighter', 'Start a session between 2 and 4 am', s => done(s).some(x => { const h = hourOf(x); return h >= 2 && h < 4; }), true),
  A('triple_threat', 'Triple Threat', 'Study 3 different courses in one day', s => {
    const by = {};
    for (const x of done(s)) { const d = dayKey(new Date(x.startedAt)); (by[d] = by[d] || new Set()).add(x.courseId); }
    return Object.values(by).some(v => v.size >= 3);
  }, true),
  A('walked_out', 'Walked Out', 'Walk out of a session (it happens)', s => s.sessions.some(x => x.status !== 'completed'), true),
  A('full_house', 'Full House', 'Study all 5 courses in one week', s => {
    const by = {};
    for (const x of done(s)) { const w = weekKey(dayKey(new Date(x.startedAt))); (by[w] = by[w] || new Set()).add(x.courseId); }
    return Object.values(by).some(v => COURSE_IDS.every(id => v.has(id)));
  }, true),
];

export const achievementById = id => ACHIEVEMENTS.find(a => a.id === id);

/** Grants every newly met achievement (and its reward item). Pure. */
export function evaluateAchievements(state, now) {
  const s = JSON.parse(JSON.stringify(state));
  const newly = [];
  for (const a of ACHIEVEMENTS) {
    if (s.career.achievements[a.id]) continue;
    let ok = false;
    try { ok = a.check(s); } catch { ok = false; }
    if (!ok) continue;
    s.career.achievements[a.id] = now;
    newly.push(a.id);
    for (const it of ITEMS.filter(i => i.achievement === a.id)) s.career.owned[it.id] = true;
  }
  return { state: s, newly };
}
