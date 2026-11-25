// Goals (short / medium / long term) with steps. All rewards go to cash, never rank.
import { dayKey } from './time.js';
import { rankIndex, rateFor } from './economy.js';
import { evaluateAchievements } from './achievements.js';

export const TIERS = ['short', 'medium', 'long'];
export const TIER_NAMES = { short: 'Short term', medium: 'Medium term', long: 'Long term' };
export const GOAL_REWARD_MIN = { short: 60, medium: 180, long: 600 };
export const STEP_REWARD_MIN = 15;
export const STEP_DAILY_PAY_CAP = 10;
export const STEP_MIN_AGE_MS = 3600000;
export const GOAL_DAILY_PAY_CAP = 2;

let seq = 0;
export const uid = (p, now) => p + now.toString(36) + (seq++).toString(36) + Math.floor(Math.random() * 1e4).toString(36);
const clone = o => JSON.parse(JSON.stringify(o));
const rate = s => rateFor(rankIndex(s.career.xp), s.career.prestige);

function findGoal(s, goalId) {
  const g = s.goals.find(x => x.id === goalId);
  if (!g) throw new Error('Unknown goal');
  return g;
}
function findStep(g, stepId) {
  const st = g.steps.find(x => x.id === stepId);
  if (!st) throw new Error('Unknown step');
  return st;
}

/** v1 "Why I grind" lines -> long-term goals with no steps. */
export function migrateWhy(why, now) {
  return why.map(t => String(t || '').trim()).filter(Boolean).map((title, i) => ({
    id: `gwhy${i}`, title, tier: 'long', courseId: null, due: null, steps: [],
    createdAt: now, doneAt: null, archived: false, paid: false,
  }));
}

export function createGoal(state, { title, tier, courseId = null, due = null }, now) {
  if (!TIERS.includes(tier)) throw new Error('Bad tier');
  const s = clone(state);
  const goal = { id: uid('g', now), title: String(title).trim() || 'Untitled goal', tier, courseId, due, steps: [],
    createdAt: now, doneAt: null, archived: false, paid: false };
  s.goals.push(goal);
  return { state: s, goal };
}

export function updateGoal(state, goalId, patch) {
  const s = clone(state);
  const g = findGoal(s, goalId);
  for (const k of ['title', 'tier', 'courseId', 'due', 'archived']) if (k in patch) g[k] = patch[k];
  if (!TIERS.includes(g.tier)) throw new Error('Bad tier');
  return s;
}

export function deleteGoal(state, goalId) {
  const s = clone(state);
  s.goals = s.goals.filter(g => g.id !== goalId);
  return s;
}

export function addStep(state, goalId, text, now) {
  const s = clone(state);
  const step = { id: uid('t', now), text: String(text).trim() || 'New step', done: false, doneAt: null, createdAt: now, paid: false };
  findGoal(s, goalId).steps.push(step);
  return { state: s, step };
}

export function editStep(state, goalId, stepId, text) {
  const s = clone(state);
  findStep(findGoal(s, goalId), stepId).text = String(text).trim() || 'New step';
  return s;
}

export function deleteStep(state, goalId, stepId) {
  const s = clone(state);
  const g = findGoal(s, goalId);
  g.steps = g.steps.filter(x => x.id !== stepId);
  return s;
}

export function moveStep(state, goalId, stepId, dir) {
  const s = clone(state);
  const g = findGoal(s, goalId);
  const i = g.steps.findIndex(x => x.id === stepId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= g.steps.length) return s;
  [g.steps[i], g.steps[j]] = [g.steps[j], g.steps[i]];
  return s;
}

/** Tick or untick a step. Pays 15 min of cash once, if the step is >= 1 h old and today's cap (10) isn't reached. */
export function tickStep(state, goalId, stepId, done, now) {
  let s = clone(state);
  const st = findStep(findGoal(s, goalId), stepId);
  const receipt = { paid: 0, reason: 'ok', newAchievements: [] };
  if (!done) {
    st.done = false; st.doneAt = null;
    receipt.reason = 'undone';
    return { state: s, receipt };
  }
  st.done = true; st.doneAt = now;
  const c = s.career;
  const day = dayKey(new Date(now));
  if (c.stepPay.day !== day) c.stepPay = { day, count: 0 };
  if (st.paid) receipt.reason = 'already';
  else if (now - st.createdAt < STEP_MIN_AGE_MS) receipt.reason = 'too-new';
  else if (c.stepPay.count >= STEP_DAILY_PAY_CAP) receipt.reason = 'cap';
  else {
    st.paid = true;
    c.stepPay.count += 1;
    c.stepsTicked = (c.stepsTicked || 0) + 1;
    receipt.paid = Math.round(STEP_REWARD_MIN * rate(s));
    c.cash += receipt.paid;
  }
  const ach = evaluateAchievements(s, now);
  s = ach.state; receipt.newAchievements = ach.newly;
  return { state: s, receipt };
}

export function canComplete(goal) {
  return goal.steps.length >= 2 && goal.steps.every(x => x.done);
}

/** Each step was finished at least an hour after it was added (stops instant goal farming). */
export function stepsMatured(goal) {
  return goal.steps.every(x => x.done && x.doneAt - x.createdAt >= STEP_MIN_AGE_MS);
}

/**
 * Complete a goal: pays 60/180/600 min of cash once, only with >= 2 steps, all done, each done >= 1 h after it was added,
 * and at most 2 paid completions per day. Returns reason 'too-new' / 'cap' without completing unless { force: true }
 * (force completes it with no bonus).
 */
export function completeGoal(state, goalId, now, { force = false } = {}) {
  let s = clone(state);
  const g = findGoal(s, goalId);
  const receipt = { paid: 0, reason: 'ok', newAchievements: [] };
  if (g.paid || g.doneAt) { receipt.reason = 'already'; return { state: s, receipt }; }
  if (!canComplete(g)) { receipt.reason = 'needs-steps'; return { state: s, receipt }; }
  const c = s.career;
  const day = dayKey(new Date(now));
  if (!c.goalPay || c.goalPay.day !== day) c.goalPay = { day, count: 0 };
  const blocked = !stepsMatured(g) ? 'too-new' : c.goalPay.count >= GOAL_DAILY_PAY_CAP ? 'cap' : null;
  if (blocked) {
    receipt.reason = blocked;
    if (!force) return { state: s, receipt };
    g.doneAt = now;
    const ach = evaluateAchievements(s, now);
    s = ach.state; receipt.newAchievements = ach.newly;
    return { state: s, receipt };
  }
  c.goalPay.count += 1;
  g.paid = true; g.doneAt = now;
  receipt.paid = Math.round(GOAL_REWARD_MIN[g.tier] * rate(s));
  s.career.cash += receipt.paid;
  s.career.goalsDone[g.tier] = (s.career.goalsDone[g.tier] || 0) + 1;
  const ach = evaluateAchievements(s, now);
  s = ach.state; receipt.newAchievements = ach.newly;
  return { state: s, receipt };
}

/** Open steps of active goals: short before medium before long, then oldest first. */
export function openSteps(state) {
  const order = { short: 0, medium: 1, long: 2 };
  return state.goals.filter(g => !g.doneAt && !g.archived)
    .flatMap(goal => goal.steps.filter(st => !st.done).map(step => ({ goal, step })))
    .sort((a, b) => order[a.goal.tier] - order[b.goal.tier] || a.step.createdAt - b.step.createdAt);
}

export function findGoalStep(state, goalId, stepId) {
  const goal = state.goals.find(g => g.id === goalId);
  const step = goal && goal.steps.find(x => x.id === stepId);
  return goal && step ? { goal, step } : null;
}
