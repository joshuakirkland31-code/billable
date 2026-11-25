import { describe, it, expect } from './harness.js';
import { ACHIEVEMENTS, evaluateAchievements, achievementsFor } from '../js/achievements.js';
import { fileMark } from '../js/marks.js';
import { defaultState } from '../js/store.js';

const T = new Date(2026, 10, 20, 12).getTime();
const sess = (over = {}) => ({ id: 'x' + Math.random(), courseId: 'MATH137', startedAt: T, endedAt: T, targetMin: 25, minutes: 25, status: 'completed', earned: 0, fine: 0, watched: true, ...over });

describe('achievements', () => {
  it('50+ unique ids including required ones', () => {
    const all = achievementsFor(defaultState());
    expect(all.length >= 50).toBe(true);
    const ids = all.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['first_shift', 'streak_3', 'streak_7', 'streak_14', 'streak_30', 'streak_60', 'streak_100', 'hours_10', 'hours_50', 'hours_100', 'hours_300', 'deep_90', 'early_bird', 'night_owl', 'course_MATH137_10h', 'deans_list', 'beat_target_5', 'comeback', 'contracts_50', 'perfect_week', 'phoenix', 'prestige_1', 'collector_25'])
      expect(ids.includes(id)).toBe(true);
  });
  it('first_shift granted once with its reward item', () => {
    let s = defaultState();
    s.sessions.push(sess());
    const r = evaluateAchievements(s, T);
    expect(r.newly.includes('first_shift')).toBe(true);
    expect(r.state.career.owned.first_paycheck).toBe(true);
    expect(evaluateAchievements(r.state, T).newly.includes('first_shift')).toBe(false);
  });
  it('streak_100 grants the gold watch', () => {
    const s = defaultState();
    s.career.streak.best = 100;
    const r = evaluateAchievements(s, T);
    expect(r.newly.includes('streak_100')).toBe(true);
    expect(r.state.career.owned.gold_watch).toBe(true);
  });
  it('perfect week needs all 7 days of one week', () => {
    const s = defaultState();
    for (let d = 16; d <= 21; d++) s.sessions.push(sess({ startedAt: new Date(2026, 10, d, 12).getTime(), minutes: 20 }));
    expect(evaluateAchievements(s, T).newly.includes('perfect_week')).toBe(false);
    s.sessions.push(sess({ startedAt: new Date(2026, 10, 22, 12).getTime(), minutes: 20 }));
    expect(evaluateAchievements(s, T).newly.includes('perfect_week')).toBe(true);
  });
  it('deans list needs 3 courses averaging 80+', () => {
    const s = defaultState();
    for (const id of ['MATH137', 'CS115', 'EC120']) s.term.courses.find(c => c.id === id).components.find(c => c.id === 'mid').items[0].score = 85;
    expect(evaluateAchievements(s, T).newly.includes('deans_list')).toBe(true);
  });
});

describe('fileMark', () => {
  it('pays filing once and beat-target once', () => {
    let s = defaultState();
    let r = fileMark(s, 'MATH137', 'mid1', 90, T);
    expect(r.receipt.filing).toBe(20);
    expect(r.receipt.beat).toBe(100);
    expect(r.state.career.cash).toBe(120);
    expect(r.state.term.courses.find(c => c.id === 'MATH137').components.find(c => c.id === 'mid').items[0].score).toBe(90);
    r = fileMark(r.state, 'MATH137', 'mid1', 95, T);
    expect(r.receipt.filing).toBe(0);
    expect(r.receipt.beat).toBe(0);
    expect(r.state.career.cash).toBe(120);
  });
  it('below target pays filing only; clearing pays nothing', () => {
    let r = fileMark(defaultState(), 'CS115', 'mid1', 60, T);
    expect(r.receipt.filing).toBe(20);
    expect(r.receipt.beat).toBe(0);
    r = fileMark(defaultState(), 'CS115', 'mid1', null, T);
    expect(r.receipt.filing).toBe(0);
  });
});

import { createGoal, addStep, tickStep, completeGoal } from '../js/goals.js';

describe('achievements v2', () => {
  it('course achievements follow the courses you have', () => {
    const s = defaultState();
    expect(achievementsFor(s).some(a => a.id === 'course_MATH137_10h')).toBe(true);
    expect(achievementsFor(s).some(a => a.id === 'course_CS116_10h')).toBe(false);
    s.pastTerms.push({ id: 'W27', name: 'Winter 2027', courses: [{ id: 'CS116', code: 'CS 116', components: [] }] });
    expect(achievementsFor(s).some(a => a.id === 'course_CS116_25h')).toBe(true);
  });
  it('has the new goal achievements', () => {
    const ids = achievementsFor(defaultState()).map(a => a.id);
    for (const id of ['first_step', 'steps_25', 'steps_100', 'first_goal', 'goal_long', 'goal_hit_10', 'contracts_perfect_7'])
      expect(ids.includes(id)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('first_step and goal_long are granted', () => {
    const T = new Date(2026, 10, 20, 9).getTime(), H = 3600000;
    let s = defaultState();
    const g = createGoal(s, { title: 'Career', tier: 'long' }, T); s = g.state;
    const a = addStep(s, g.goal.id, 'Resume', T); s = a.state;
    const b = addStep(s, g.goal.id, 'Apply', T); s = b.state;
    let r = tickStep(s, g.goal.id, a.step.id, true, T + H);
    expect(r.receipt.newAchievements.includes('first_step')).toBe(true);
    r = tickStep(r.state, g.goal.id, b.step.id, true, T + H);
    const c = completeGoal(r.state, g.goal.id, T + H);
    expect(c.receipt.newAchievements.includes('goal_long')).toBe(true);
    expect(c.receipt.newAchievements.includes('first_goal')).toBe(true);
  });
});
