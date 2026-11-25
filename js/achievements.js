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

export const ACHIEVEMENTS = [
  A('first_shift', 'First Shift', 'Complete your first session', s => done(s).length >= 1),
  ...[3, 7, 14, 30, 60, 100].map(n => A(`streak_${n}`, `${n}-Day Streak`, `Reach a ${n}-day streak`, s => (s.career.streak.best || 0) >= n)),
  ...[1, 5, 10, 25, 50, 100, 200, 300, 500].map(n => A(`hours_${n}`, `${n} Billable Hour${n > 1 ? 's' : ''}`, `Study ${n} hours in total`, s => totalMin(s) >= n * 60)),
  ...[10, 50, 100, 250].map(n => A(`sessions_${n}`, `${n} Sessions`, `Complete ${n} sessions`, s => done(s).length >= n)),
  A('deep_90', 'Marathon', 'One session of 90+ minutes', s => done(s).some(x => x.minutes >= 90)),
  A('deep_50_x10', 'Deep Worker', '10 sessions of 50+ minutes', s => count(s, x => x.minutes >= 50) >= 10),
  A('overtime_30', 'Overtime', 'Go 30+ minutes past your session goal', s => done(s).some(x => { const g = x.goalMin ?? x.targetMin; return g && x.minutes >= g + 30; })),
  A('early_bird', 'Early Bird', '5 sessions started before 8 am', s => count(s, x => { const h = hourOf(x); return h >= 4 && h < 8; }) >= 5),
  A('night_owl', 'Night Owl', '5 sessions started after 10 pm', s => count(s, x => { const h = hourOf(x); return h >= 22 || h < 4; }) >= 5),
  A('weekend_warrior', 'Weekend Warrior', '5 sessions on weekends', s => count(s, x => [0, 6].includes(new Date(x.startedAt).getDay())) >= 5),
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
  A('full_house', 'Full House', 'Study every course in one week', s => {
    const by = {};
    for (const x of done(s)) { const w = weekKey(dayKey(new Date(x.startedAt))); (by[w] = by[w] || new Set()).add(x.courseId); }
    const ids = s.term.courses.map(c => c.id);
    return ids.length > 0 && Object.values(by).some(v => ids.every(id => v.has(id)));
  }, true),
  A('first_step', 'First Step', 'Tick off a goal step', s => (s.career.stepsTicked || 0) >= 1),
  A('steps_25', 'Momentum', 'Tick off 25 goal steps', s => (s.career.stepsTicked || 0) >= 25),
  A('steps_100', 'Unstoppable', 'Tick off 100 goal steps', s => (s.career.stepsTicked || 0) >= 100),
  A('first_goal', 'Goal Getter', 'Complete a goal', s => { const g = s.career.goalsDone || {}; return (g.short || 0) + (g.medium || 0) + (g.long || 0) >= 1; }),
  A('goal_long', 'The Long Game', 'Complete a long-term goal', s => ((s.career.goalsDone || {}).long || 0) >= 1),
  A('goal_hit_10', 'On Target', 'Reach your session goal 10 times', s => done(s).filter(x => x.goalMin && x.minutes >= x.goalMin).length >= 10),
  A('contracts_perfect_7', 'Perfect Week of Contracts', 'Close every contract on 7 days', s => (s.career.perfectContractDays || 0) >= 7),
];

function courseAchievements(state) {
  const courses = [...(state.term ? state.term.courses : []), ...(state.pastTerms || []).flatMap(t => t.courses || [])];
  const seen = new Set();
  return courses.filter(c => !seen.has(c.id) && seen.add(c.id)).flatMap(c => [
    A(`course_${c.id}_10h`, `${c.code || c.id} Specialist`, `10 hours on ${c.code || c.id}`, s => totalMin(s, x => x.courseId === c.id) >= 600),
    A(`course_${c.id}_25h`, `${c.code || c.id} Expert`, `25 hours on ${c.code || c.id}`, s => totalMin(s, x => x.courseId === c.id) >= 1500),
  ]);
}

/** Every achievement that applies to this save: the base list plus one pair per course you've taken. */
export function achievementsFor(state) {
  return [...ACHIEVEMENTS, ...courseAchievements(state)];
}

export const achievementById = (id, state = null) => {
  const a = ACHIEVEMENTS.find(x => x.id === id);
  if (a) return a;
  const m = /^course_(.+)_(10|25)h$/.exec(id);
  if (!m) return null;
  const course = state && [...state.term.courses, ...(state.pastTerms || []).flatMap(t => t.courses || [])].find(c => c.id === m[1]);
  const code = course ? course.code : m[1];
  return { id, name: `${code} ${m[2] === '10' ? 'Specialist' : 'Expert'}`, desc: `${m[2]} hours on ${code}`, secret: false };
};

/** Grants every newly met achievement (and its reward item). Pure. */
export function evaluateAchievements(state, now) {
  const s = JSON.parse(JSON.stringify(state));
  const newly = [];
  for (const a of achievementsFor(s)) {
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
