// Daily "client contracts": your goal steps first, then random study contracts. Max 5, min 3.
import { dayKey } from './time.js';
import { rankIndex, rateFor } from './economy.js';
import { computeCourse } from './grades.js';
import { openSteps, findGoalStep } from './goals.js';

export const MAX_CONTRACTS = 5, MIN_CONTRACTS = 3, AUTO_STEPS = 2;
export const ALL_DONE_BONUS_MIN = 30;

const done = s => s.filter(x => x.status === 'completed');
const mins = (s, pred = () => true) => done(s).filter(pred).reduce((a, x) => a + x.minutes, 0);
const hourOf = x => new Date(x.startedAt).getHours();

export const GENERIC_CONTRACTS = [
  { id: 'two_courses', label: 'Study 2 different courses', rewardMin: 15, check: s => new Set(done(s).map(x => x.courseId)).size >= 2 },
  { id: 'early_bird', label: 'Clock in before 10 am', rewardMin: 15, check: s => done(s).some(x => { const h = hourOf(x); return h >= 4 && h < 10; }) },
  { id: 'deep_work', label: 'One session of 50+ min', rewardMin: 20, check: s => done(s).some(x => x.minutes >= 50) },
  { id: 'marathon', label: 'Bill 90 minutes total', rewardMin: 20, check: s => mins(s) >= 90 },
  { id: 'triple', label: 'Finish 3 sessions', rewardMin: 20, check: s => done(s).length >= 3 },
  { id: 'night_shift', label: 'Clock in after 9 pm', rewardMin: 10, check: s => done(s).some(x => { const h = hourOf(x); return h >= 21 || h < 4; }) },
  { id: 'goal_hit', label: 'Hit a session goal', rewardMin: 10, check: s => done(s).some(x => x.goalMin && x.minutes >= x.goalMin) },
];

const codeOf = (state, id) => ((state.term.courses.find(c => c.id === id)) || { code: id }).code;

/** Resolve a random contract id (generic or "course:<id>" / "course_behind:<id>"). */
export function randomContract(id, state) {
  const g = GENERIC_CONTRACTS.find(c => c.id === id);
  if (g) return g;
  const [kind, cid] = id.split(':');
  if (kind === 'course') return { id, label: `30 min on ${codeOf(state, cid)}`, rewardMin: 15, check: s => mins(s, x => x.courseId === cid) >= 30 };
  if (kind === 'course_behind') return { id, label: `30 min on ${codeOf(state, cid)} (behind target) · 2×`, rewardMin: 30, check: s => mins(s, x => x.courseId === cid) >= 30 };
  return null;
}

/** Course most behind its target (status 'behind'), or null. */
export function behindCourse(state) {
  let best = null, gap = 0;
  for (const c of state.term.courses) {
    const r = computeCourse(c);
    if (r.status === 'behind' && c.target - r.current > gap) { gap = c.target - r.current; best = c.id; }
  }
  return best;
}

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

const stepItem = (gid, sid) => ({ key: `step:${gid}:${sid}`, kind: 'step', ref: { goalId: gid, stepId: sid }, done: false, paid: false });
const randItem = id => ({ key: `rand:${id}`, kind: 'random', ref: id, done: false, paid: false });

export function buildDailyContracts(state, day) {
  const items = [];
  const has = k => items.some(i => i.key === k);
  for (const ref of (state.career.todaySteps[day] || [])) {
    if (items.length >= MAX_CONTRACTS) break;
    const [gid, sid] = ref.split(':');
    if (findGoalStep(state, gid, sid) && !has(`step:${gid}:${sid}`)) items.push(stepItem(gid, sid));
  }
  let auto = 0;
  for (const { goal, step } of openSteps(state).filter(x => x.goal.tier !== 'long')) {
    if (auto >= AUTO_STEPS || items.length >= MAX_CONTRACTS) break;
    if (has(`step:${goal.id}:${step.id}`)) continue;
    items.push(stepItem(goal.id, step.id)); auto++;
  }
  if (items.length < MIN_CONTRACTS) {
    const behind = behindCourse(state);
    const pool = [...GENERIC_CONTRACTS.map(c => c.id), ...state.term.courses.filter(c => c.id !== behind).map(c => `course:${c.id}`)];
    const rnd = mulberry32(hash(day));
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    if (behind) pool.unshift(`course_behind:${behind}`);
    for (const id of pool) { if (items.length >= MIN_CONTRACTS) break; items.push(randItem(id)); }
  }
  return items;
}

/** "+ Today" on a step: remember it for the day and append it to today's contracts if there's room. */
export function addStepToToday(state, goalId, stepId, day) {
  const s = JSON.parse(JSON.stringify(state));
  const ref = `${goalId}:${stepId}`;
  const list = s.career.todaySteps[day] || (s.career.todaySteps[day] = []);
  if (!list.includes(ref)) list.push(ref);
  // keep only today's list
  for (const k of Object.keys(s.career.todaySteps)) if (k !== day) delete s.career.todaySteps[k];
  const c = s.career.contracts;
  if (c.day !== day || c.items.some(i => i.key === `step:${ref}`) || c.items.length >= MAX_CONTRACTS) return { state: s, added: false };
  c.items.push(stepItem(goalId, stepId));
  return { state: s, added: true };
}

/** Mark newly met contracts done; random ones pay; all done pays a bonus once. */
export function evaluateDailyContracts(state, day) {
  const s = JSON.parse(JSON.stringify(state));
  const c = s.career;
  const out = { state: s, newly: [], cash: 0 };
  if (c.contracts.day !== day) return out;
  // A session counts for the day it started and the day it ended (sessions can cross 4 am).
  const todays = s.sessions.filter(x => dayKey(new Date(x.startedAt)) === day || dayKey(new Date(x.endedAt ?? x.startedAt)) === day);
  // Steps deleted since the list was made can never be done: drop their contracts.
  c.contracts.items = c.contracts.items.filter(it => it.kind !== 'step' || it.done || findGoalStep(s, it.ref.goalId, it.ref.stepId));
  const rate = rateFor(rankIndex(c.xp), c.prestige);
  for (const it of c.contracts.items) {
    if (it.done) continue;
    if (it.kind === 'step') {
      const gs = findGoalStep(s, it.ref.goalId, it.ref.stepId);
      if (gs && gs.step.done) { it.done = true; out.newly.push(it.key); }
    } else {
      const def = randomContract(it.ref, s);
      if (def && def.check(todays)) {
        it.done = true; it.paid = true;
        const pay = Math.round(def.rewardMin * rate);
        c.cash += pay; out.cash += pay;
        out.newly.push(it.key);
      }
    }
  }
  c.contractsCompleted = (c.contractsCompleted || 0) + out.newly.length;
  if (c.contracts.items.length && c.contracts.items.every(i => i.done) && !c.contracts.allPaid) {
    const pay = Math.round(ALL_DONE_BONUS_MIN * rate);
    c.cash += pay; out.cash += pay;
    c.contracts.allPaid = true;
    c.perfectContractDays = (c.perfectContractDays || 0) + 1;
  }
  return out;
}

export function contractText(item, state) {
  if (item.kind === 'step') {
    const gs = findGoalStep(state, item.ref.goalId, item.ref.stepId);
    return gs ? gs.step.text : '(deleted step)';
  }
  const def = randomContract(item.ref, state);
  return def ? def.label : item.ref;
}
