import { describe, it, expect } from './harness.js';
import { startSession, clockOut, finalizeSession, ensureDay } from '../js/session.js';
import { createGoal, addStep, tickStep, completeGoal, deleteStep, GOAL_DAILY_PAY_CAP } from '../js/goals.js';
import { evaluateDailyContracts } from '../js/contracts.js';
import { evaluateAchievements } from '../js/achievements.js';
import { defaultState } from '../js/store.js';

const MIN = 60000, H = 3600000;
const T0 = new Date(2026, 10, 20, 9, 0).getTime();
const rand = id => ({ key: `rand:${id}`, kind: 'random', ref: id, done: false, paid: false });

describe('v2 review fixes', () => {
  it('C1: finalizing a missing or malformed session changes nothing', () => {
    const s = ensureDay(defaultState(), T0);
    s.career.streak = { count: 20, best: 20, lastDay: '2026-11-19', pto: 0, brokenFrom: 0 };
    for (const bad of [null, undefined, { status: 'completed', endedAt: T0, endReason: 'clockout' }]) {
      const r = finalizeSession(s, bad, T0);
      expect(r.receipt.discarded).toBe(true);
      expect(r.state.sessions.length).toBe(0);
      expect(r.state.career.streak).toEqual(s.career.streak);
    }
  });
  it('I1: a 3:30–4:30 am session completes contracts on the list for the day it ended', () => {
    const s0 = new Date(2026, 10, 21, 3, 30).getTime(), end = s0 + 60 * MIN;
    const st = ensureDay(defaultState(), end);
    st.career.contracts = { day: '2026-11-21', allPaid: false, items: [rand('deep_work'), rand('night_shift'), rand('marathon')] };
    const a = clockOut(startSession({ courseId: 'X', now: s0 }), end);
    const r = finalizeSession(st, a, end);
    expect(r.receipt.contractsDone.includes('rand:deep_work')).toBe(true);
  });
  it('I1: with the app open since before 4 am, the outgoing day\'s list is evaluated first', () => {
    const s0 = new Date(2026, 10, 21, 3, 30).getTime(), end = s0 + 60 * MIN;
    const st = ensureDay(defaultState(), s0);
    st.career.contracts = { day: '2026-11-20', allPaid: false, items: [rand('deep_work'), rand('night_shift'), rand('marathon')] };
    const a = clockOut(startSession({ courseId: 'X', now: s0 }), end);
    const r = finalizeSession(st, a, end);
    expect(r.receipt.contractsDone.includes('rand:deep_work')).toBe(true);
    expect(r.state.career.contracts.day).toBe('2026-11-21');
  });
  it('I1: a session crossing 4 am extends the streak instead of breaking it', () => {
    const s0 = new Date(2026, 10, 21, 3, 30).getTime(), end = s0 + 60 * MIN;
    const st = ensureDay(defaultState(), s0);
    st.career.streak = { count: 5, best: 5, lastDay: '2026-11-19', pto: 0, brokenFrom: 0 };
    const r = finalizeSession(st, clockOut(startSession({ courseId: 'X', now: s0 }), end), end);
    expect(r.state.career.streak.count).toBe(6);
    expect(r.state.career.streak.lastDay).toBe('2026-11-20');
  });
  it('I2: steps ticked within an hour of being added don\'t qualify a goal for its bonus', () => {
    let s = defaultState();
    const g = createGoal(s, { title: 'Farm', tier: 'long' }, T0); s = g.state;
    const a = addStep(s, g.goal.id, 'a', T0); s = a.state;
    const b = addStep(s, g.goal.id, 'b', T0); s = b.state;
    s = tickStep(s, g.goal.id, a.step.id, true, T0 + 1000).state;
    s = tickStep(s, g.goal.id, b.step.id, true, T0 + 1000).state;
    const r = completeGoal(s, g.goal.id, T0 + 2000);
    expect(r.receipt.reason).toBe('too-new');
    expect(r.receipt.paid).toBe(0);
    expect(r.state.goals[0].doneAt).toBeNull(); // not completed unless you choose to
    const f = completeGoal(s, g.goal.id, T0 + 2000, { force: true });
    expect(f.receipt.paid).toBe(0);
    expect(f.state.goals[0].doneAt).toBe(T0 + 2000);
    expect(f.state.career.cash).toBe(s.career.cash);
  });
  it('I2: at most 2 paid goal completions per day', () => {
    expect(GOAL_DAILY_PAY_CAP).toBe(2);
    let s = defaultState();
    const ids = [];
    for (let i = 0; i < 3; i++) {
      const g = createGoal(s, { title: 'G' + i, tier: 'short' }, T0); s = g.state;
      for (let j = 0; j < 2; j++) { const st = addStep(s, g.goal.id, 's', T0); s = st.state; s = tickStep(s, g.goal.id, st.step.id, true, T0 + H).state; }
      ids.push(g.goal.id);
    }
    const paid = [];
    for (const id of ids) { const r = completeGoal(s, id, T0 + H); s = r.state; paid.push(r.receipt.reason); }
    expect(paid).toEqual(['ok', 'ok', 'cap']);
    expect(s.goals.find(g => g.id === ids[2]).doneAt).toBeNull(); // left open for tomorrow
  });
  it('M4: contracts for deleted steps are dropped so the day can still close', () => {
    let s = defaultState();
    const g = createGoal(s, { title: 'G', tier: 'short' }, T0 - 2 * H); s = g.state;
    const a = addStep(s, g.goal.id, 'a', T0 - 2 * H); s = a.state;
    s.career.contracts = { day: '2026-11-20', allPaid: false, items: [{ key: `step:${g.goal.id}:${a.step.id}`, kind: 'step', ref: { goalId: g.goal.id, stepId: a.step.id }, done: false, paid: false }] };
    s = deleteStep(s, g.goal.id, a.step.id);
    const r = evaluateDailyContracts(s, '2026-11-20');
    expect(r.state.career.contracts.items.length).toBe(0);
  });
  it('M3: overtime_30 is earned by going 30+ min past a session goal', () => {
    const s = defaultState();
    s.sessions.push({ id: 'a', courseId: 'X', startedAt: T0, endedAt: T0 + 80 * MIN, minutes: 80, goalMin: 50, status: 'completed', earned: 0, fine: 0 });
    expect(evaluateAchievements(s, T0).newly.includes('overtime_30')).toBe(true);
  });
});
