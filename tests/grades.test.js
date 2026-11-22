import { describe, it, expect } from './harness.js';
import { componentScore, finalGrade, computeCourse, neededOnFinal, twelvePoint, passWarnings, overallAverage, parseScore } from '../js/grades.js';

const items = (scores) => scores.map((score, i) => ({ id: 'i' + i, name: 'I' + i, date: null, score }));
const course = (components, extra = {}) => ({ id: 'X', code: 'X', name: 'X', school: 'waterloo', target: 80, finalDate: null, bonus: null, passRule: null, components, ...extra });

const c137 = () => course([
  { id: 'quizzes', name: 'Quizzes', weight: 20, rule: { type: 'bestOf', keep: 9 }, items: items(Array(10).fill(90)) },
  { id: 'mid', name: 'Midterm', weight: 30, rule: { type: 'avg' }, items: items([70]) },
  { id: 'final', name: 'Final', weight: 50, rule: { type: 'avg' }, items: items([null]) },
]);

describe('grades', () => {
  it('bestOf drops the lowest', () => {
    const q = { weight: 20, rule: { type: 'bestOf', keep: 9 }, items: items([0, 80, 80, 80, 80, 80, 80, 80, 80, 80]) };
    expect(componentScore(q, null)).toBe(80);
  });
  it('ranked 8/2 weighting (EC120 quizzes)', () => {
    expect(componentScore({ weight: 10, rule: { type: 'ranked', weights: [8, 2] }, items: items([50, 90]) }, null)).toBe(82);
  });
  it('partial dropLowest uses plain mean until complete', () => {
    const c = { weight: 19, rule: { type: 'dropLowest', n: 1 }, items: items([60, 100, null, null, null]) };
    expect(componentScore(c, null)).toBe(80);
    expect(componentScore(c, 100)).toBe(100); // 60 dropped once filled
  });
  it('current and needed for MATH 137 example', () => {
    const r = computeCourse(c137());
    expect(r.current).toBeCloseTo(78, 1);
    expect(r.needed).toBeCloseTo(82, 1);
    expect(r.status).toBe('behind');
    expect(neededOnFinal(c137())).toBeCloseTo(82, 1);
  });
  it('out of reach and locked', () => {
    const bad = c137(); bad.components[1].items[0].score = 0; bad.components[0].items.forEach(i => i.score = 0);
    expect(computeCourse(bad).status).toBe('out-of-reach');
    expect(computeCourse(bad).maxPossible).toBeCloseTo(50, 1);
    const good = c137(); good.target = 30;
    expect(computeCourse(good).status).toBe('locked');
  });
  it('no data never NaN', () => {
    const empty = c137(); empty.components.forEach(c => c.items.forEach(i => i.score = null));
    const r = computeCourse(empty);
    expect(r.status).toBe('no-data');
    expect(r.current).toBeNull();
    expect(Number.isNaN(r.needed)).toBe(false);
    expect(r.needed).toBeCloseTo(80, 1);
  });
  it('partial component weights current by graded share', () => {
    const c = course([
      { id: 'a', name: 'A', weight: 40, rule: { type: 'avg' }, items: items([100, null, null, null]) },
      { id: 'final', name: 'F', weight: 60, rule: { type: 'avg' }, items: items([50]) },
    ]);
    // 10 weight graded at 100, 60 at 50 → (1000+3000)/70
    expect(computeCourse(c).current).toBeCloseTo(4000 / 70, 1);
  });
  it('bonus points add to the grade', () => {
    const c = c137(); c.bonus = { label: 'b', max: 2, value: 2 };
    expect(finalGrade(c, 100)).toBeCloseTo(18 + 21 + 50 + 2, 1);
  });
  it('twelve point scale', () => {
    expect(twelvePoint(84.6)).toEqual({ letter: 'A', points: 11 });
    expect(twelvePoint(90)).toEqual({ letter: 'A+', points: 12 });
    expect(twelvePoint(79.4)).toEqual({ letter: 'B+', points: 9 });
    expect(twelvePoint(49.4)).toEqual({ letter: 'F', points: 0 });
  });
  it('cs115 pass warning', () => {
    const c = course([
      { id: 'assign', name: 'A', weight: 20, rule: { type: 'avg' }, items: items([100]) },
      { id: 'labq', name: 'L', weight: 10, rule: { type: 'avg' }, items: items([30]) },
      { id: 'mid', name: 'M', weight: 25, rule: { type: 'avg' }, items: items([30]) },
      { id: 'final', name: 'F', weight: 45, rule: { type: 'avg' }, items: items([null]) },
    ], { passRule: 'cs115' });
    expect(passWarnings(c).length).toBe(1);
    c.components[1].items[0].score = 90; c.components[2].items[0].score = 90;
    expect(passWarnings(c).length).toBe(0);
  });
  it('bu111 pass warning', () => {
    const c = course([
      { id: 'mid', name: 'M', weight: 20, rule: { type: 'avg' }, items: items([40]) },
      { id: 'final', name: 'F', weight: 24, rule: { type: 'avg' }, items: items([null]) },
      { id: 'other', name: 'O', weight: 56, rule: { type: 'avg' }, items: items([90]) },
    ], { passRule: 'bu111' });
    expect(passWarnings(c)[0]).toContain('must pass the final');
    c.components[1].items[0].score = 45;
    expect(passWarnings(c)[0]).toContain('Must pass one exam');
  });
  it('overall average over courses with data', () => {
    const empty = c137(); empty.components.forEach(c => c.items.forEach(i => i.score = null));
    expect(overallAverage([c137(), empty])).toBeCloseTo(78, 1);
    expect(overallAverage([empty])).toBeNull();
  });
  it('parseScore accepts 81, 81%, 17/20', () => {
    expect(parseScore('81')).toBe(81);
    expect(parseScore('81%')).toBe(81);
    expect(parseScore('17/20')).toBe(85);
    expect(parseScore('')).toBeNull();
    expect(parseScore('abc')).toBe(undefined);
    expect(parseScore('5/0')).toBe(undefined);
  });
});
