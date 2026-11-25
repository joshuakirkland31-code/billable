import { describe, it, expect } from './harness.js';
import { TIERS, GOAL_REWARD_MIN, STEP_REWARD_MIN, STEP_DAILY_PAY_CAP, STEP_MIN_AGE_MS, createGoal, updateGoal, deleteGoal,
  addStep, editStep, deleteStep, moveStep, tickStep, completeGoal, openSteps, migrateWhy } from '../js/goals.js';
import { defaultState } from '../js/store.js';

const T0 = new Date(2026, 10, 20, 9, 0).getTime();
const H = 3600000;
const goalOf = (s, id) => s.goals.find(g => g.id === id);

function withSteps(n, tier = 'short') {
  let s = defaultState();
  const r = createGoal(s, { title: 'Finals prep', tier }, T0);
  s = r.state;
  const ids = [];
  for (let i = 0; i < n; i++) { const a = addStep(s, r.goal.id, `Step ${i}`, T0); s = a.state; ids.push(a.step.id); }
  return { s, gid: r.goal.id, ids };
}

describe('goals', () => {
  it('constants', () => {
    expect(TIERS).toEqual(['short', 'medium', 'long']);
    expect(GOAL_REWARD_MIN).toEqual({ short: 60, medium: 180, long: 600 });
    expect(STEP_REWARD_MIN).toBe(15);
    expect(STEP_DAILY_PAY_CAP).toBe(10);
    expect(STEP_MIN_AGE_MS).toBe(H);
  });
  it('create, update, add/edit/move/delete steps, delete goal', () => {
    let { s, gid, ids } = withSteps(3);
    expect(goalOf(s, gid).tier).toBe('short');
    s = updateGoal(s, gid, { title: 'Exam prep', courseId: 'EC120', due: '2026-12-15' });
    expect(goalOf(s, gid).title).toBe('Exam prep');
    expect(goalOf(s, gid).courseId).toBe('EC120');
    s = editStep(s, gid, ids[0], 'Read ch. 5');
    expect(goalOf(s, gid).steps[0].text).toBe('Read ch. 5');
    s = moveStep(s, gid, ids[2], -1);
    expect(goalOf(s, gid).steps.map(x => x.id)).toEqual([ids[0], ids[2], ids[1]]);
    s = moveStep(s, gid, ids[0], -1); // already first: no change
    expect(goalOf(s, gid).steps[0].id).toBe(ids[0]);
    s = deleteStep(s, gid, ids[1]);
    expect(goalOf(s, gid).steps.length).toBe(2);
    s = deleteGoal(s, gid);
    expect(s.goals.length).toBe(0);
  });
  it('a step under an hour old does not pay', () => {
    const { s, gid, ids } = withSteps(1);
    const r = tickStep(s, gid, ids[0], true, T0 + 10 * 60000);
    expect(r.receipt.reason).toBe('too-new');
    expect(r.receipt.paid).toBe(0);
    expect(goalOf(r.state, gid).steps[0].done).toBe(true);
    expect(r.state.career.cash).toBe(0);
  });
  it('ticking pays 15 min of cash once, never xp', () => {
    const { s, gid, ids } = withSteps(1);
    let r = tickStep(s, gid, ids[0], true, T0 + H);
    expect(r.receipt.reason).toBe('ok');
    expect(r.receipt.paid).toBe(150);
    expect(r.state.career.cash).toBe(150);
    expect(r.state.career.xp).toBe(0);
    expect(r.state.career.stepsTicked).toBe(1);
    r = tickStep(r.state, gid, ids[0], false, T0 + H);
    expect(r.receipt.reason).toBe('undone');
    r = tickStep(r.state, gid, ids[0], true, T0 + H);
    expect(r.receipt.reason).toBe('already');
    expect(r.state.career.cash).toBe(150);
  });
  it('caps paid steps at 10 per day, resets next day', () => {
    let { s, gid, ids } = withSteps(12);
    let r;
    for (let i = 0; i < 10; i++) { r = tickStep(s, gid, ids[i], true, T0 + H); s = r.state; }
    expect(s.career.cash).toBe(1500);
    r = tickStep(s, gid, ids[10], true, T0 + H);
    expect(r.receipt.reason).toBe('cap');
    expect(r.state.career.cash).toBe(1500);
    r = tickStep(r.state, gid, ids[11], true, T0 + 25 * H);
    expect(r.receipt.reason).toBe('ok');
  });
  it('completing a goal needs 2+ steps all done; pays once by tier', () => {
    let { s, gid, ids } = withSteps(1);
    s = tickStep(s, gid, ids[0], true, T0 + H).state;
    expect(completeGoal(s, gid, T0 + H).receipt.reason).toBe('needs-steps');
    const two = withSteps(2);
    let st = two.s;
    for (const id of two.ids) st = tickStep(st, two.gid, id, true, T0 + H).state;
    const cashBefore = st.career.cash;
    const r = completeGoal(st, two.gid, T0 + H);
    expect(r.receipt.reason).toBe('ok');
    expect(r.state.career.cash - cashBefore).toBe(600);
    expect(goalOf(r.state, two.gid).doneAt).toBe(T0 + H);
    expect(r.state.career.goalsDone.short).toBe(1);
    expect(completeGoal(r.state, two.gid, T0 + H).receipt.reason).toBe('already');
    const L = withSteps(2, 'long');
    let ls = L.s;
    for (const id of L.ids) ls = tickStep(ls, L.gid, id, true, T0 + H).state;
    const before = ls.career.cash;
    expect(completeGoal(ls, L.gid, T0 + H).state.career.cash - before).toBe(6000);
  });
  it('a goal with open steps cannot complete', () => {
    const { s, gid, ids } = withSteps(2);
    const st = tickStep(s, gid, ids[0], true, T0 + H).state;
    expect(completeGoal(st, gid, T0 + H).receipt.reason).toBe('needs-steps');
  });
  it('openSteps orders short before medium before long, then by age', () => {
    let s = defaultState();
    const m = createGoal(s, { title: 'M', tier: 'medium' }, T0); s = m.state;
    s = addStep(s, m.goal.id, 'medium step', T0).state;
    const sh = createGoal(s, { title: 'S', tier: 'short' }, T0 + H); s = sh.state;
    s = addStep(s, sh.goal.id, 'short newer', T0 + 2 * H).state;
    s = addStep(s, sh.goal.id, 'short older', T0 + H).state;
    expect(openSteps(s).map(x => x.step.text)).toEqual(['short older', 'short newer', 'medium step']);
  });
  it('migrateWhy', () => {
    const g = migrateWhy(['Make money', '', ' Grades '], T0);
    expect(g.map(x => x.title)).toEqual(['Make money', 'Grades']);
    expect(g.every(x => x.tier === 'long' && x.steps.length === 0)).toBe(true);
  });
});
