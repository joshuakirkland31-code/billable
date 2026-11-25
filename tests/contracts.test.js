import { describe, it, expect } from './harness.js';
import { buildDailyContracts, addStepToToday, evaluateDailyContracts, contractText, GENERIC_CONTRACTS, MAX_CONTRACTS } from '../js/contracts.js';
import { createGoal, addStep, tickStep } from '../js/goals.js';
import { ensureDay } from '../js/session.js';
import { defaultState } from '../js/store.js';
import { addDays } from '../js/time.js';

const T0 = new Date(2026, 10, 20, 9, 0).getTime();
const H = 3600000;
const DAY = '2026-11-20';
const at = (h, m = 0) => new Date(2026, 10, 20, h, m).getTime();

function withGoal(n, tier = 'short', now = T0 - 2 * H) {
  let s = defaultState();
  const g = createGoal(s, { title: 'G', tier }, now); s = g.state;
  const ids = [];
  for (let i = 0; i < n; i++) { const a = addStep(s, g.goal.id, `step ${i}`, now + i); s = a.state; ids.push(a.step.id); }
  return { s, gid: g.goal.id, ids };
}
const sess = (o) => ({ id: 'x' + Math.random(), courseId: 'MATH137', startedAt: at(9), endedAt: at(10), minutes: 30, status: 'completed', earned: 0, fine: 0, goalMin: null, ...o });

describe('contracts v2', () => {
  it('constants and pool', () => {
    expect(MAX_CONTRACTS).toBe(5);
    expect(GENERIC_CONTRACTS.map(c => c.id).includes('goal_hit')).toBe(true);
  });
  it('no goals → 3 random contracts, deterministic per day, varying across days', () => {
    const s = defaultState();
    const a = buildDailyContracts(s, DAY).map(i => i.key);
    expect(a.length).toBe(3);
    expect(a.every(k => k.startsWith('rand:'))).toBe(true);
    expect(buildDailyContracts(s, DAY).map(i => i.key)).toEqual(a);
    let differs = false;
    for (let i = 1; i <= 7; i++) if (buildDailyContracts(s, addDays(DAY, i)).map(x => x.key).join() !== a.join()) differs = true;
    expect(differs).toBe(true);
    expect(new Set(a).size).toBe(3);
  });
  it('today steps first, then up to 2 auto steps, then randoms to reach 3', () => {
    let { s, gid, ids } = withGoal(5);
    s.career.todaySteps[DAY] = [`${gid}:${ids[3]}`, `${gid}:${ids[4]}`];
    const items = buildDailyContracts(s, DAY);
    expect(items.map(i => i.key)).toEqual([`step:${gid}:${ids[3]}`, `step:${gid}:${ids[4]}`, `step:${gid}:${ids[0]}`, `step:${gid}:${ids[1]}`]);
    const one = withGoal(1);
    const items2 = buildDailyContracts(one.s, DAY);
    expect(items2.length).toBe(3);
    expect(items2[0].key).toBe(`step:${one.gid}:${one.ids[0]}`);
    expect(items2[1].kind).toBe('random');
  });
  it('caps at 5', () => {
    let { s, gid, ids } = withGoal(7);
    s.career.todaySteps[DAY] = ids.slice(0, 6).map(id => `${gid}:${id}`);
    expect(buildDailyContracts(s, DAY).length).toBe(5);
  });
  it('a behind-target course gets the first random slot', () => {
    const s = defaultState();
    const m = s.term.courses.find(c => c.id === 'MATH135');
    m.components.find(c => c.id === 'mid').items[0].score = 50;
    const items = buildDailyContracts(s, DAY);
    expect(items[0].key).toBe('rand:course_behind:MATH135');
    expect(contractText(items[0], s)).toBe('30 min on MATH 135 (behind target) · 2×');
  });
  it('addStepToToday appends once and respects the cap', () => {
    let { s, gid, ids } = withGoal(8);
    s = ensureDay(s, T0);
    expect(s.career.contracts.items.length).toBe(3);
    let r = addStepToToday(s, gid, ids[5], DAY);
    expect(r.added).toBe(true);
    expect(r.state.career.contracts.items.length).toBe(4);
    expect(addStepToToday(r.state, gid, ids[5], DAY).added).toBe(false);
    r = addStepToToday(r.state, gid, ids[6], DAY);
    expect(r.state.career.contracts.items.length).toBe(5);
    expect(addStepToToday(r.state, gid, ids[7], DAY).added).toBe(false);
  });
  it('a ticked step completes its contract without extra pay', () => {
    let { s, gid, ids } = withGoal(2);
    s = ensureDay(s, T0);
    s = tickStep(s, gid, ids[0], true, T0).state;
    const cash = s.career.cash;
    const r = evaluateDailyContracts(s, DAY);
    expect(r.newly.includes(`step:${gid}:${ids[0]}`)).toBe(true);
    expect(r.state.career.cash).toBe(cash + r.cash);
    expect(r.state.career.contracts.items.find(i => i.key === `step:${gid}:${ids[0]}`).done).toBe(true);
  });
  it('random contracts pay once from sessions; all done pays a bonus once', () => {
    let s = defaultState();
    s.career.contracts = { day: DAY, allPaid: false, items: [
      { key: 'rand:deep_work', kind: 'random', ref: 'deep_work', done: false, paid: false },
      { key: 'rand:goal_hit', kind: 'random', ref: 'goal_hit', done: false, paid: false },
      { key: 'rand:two_courses', kind: 'random', ref: 'two_courses', done: false, paid: false },
    ] };
    s.sessions = [sess({ minutes: 50, goalMin: 50 }), sess({ courseId: 'CS115', startedAt: at(11), minutes: 20 })];
    const r = evaluateDailyContracts(s, DAY);
    expect(r.newly.length).toBe(3);
    // 20 + 10 + 15 min at $10 + 30 min all-done bonus
    expect(r.cash).toBe(200 + 100 + 150 + 300);
    expect(r.state.career.contracts.allPaid).toBe(true);
    expect(r.state.career.perfectContractDays).toBe(1);
    expect(evaluateDailyContracts(r.state, DAY).cash).toBe(0);
  });
  it('goal_hit needs a session that reached its goal', () => {
    let s = defaultState();
    s.career.contracts = { day: DAY, allPaid: false, items: [{ key: 'rand:goal_hit', kind: 'random', ref: 'goal_hit', done: false, paid: false }] };
    s.sessions = [sess({ minutes: 40, goalMin: 50 })];
    expect(evaluateDailyContracts(s, DAY).newly.length).toBe(0);
  });
});
