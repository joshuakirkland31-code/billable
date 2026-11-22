import { describe, it, expect } from './harness.js';
import { COURSES } from '../js/courses-data.js';
import { defaultState } from '../js/store.js';
import { computeCourse } from '../js/grades.js';

const get = id => COURSES.find(c => c.id === id);

describe('courses data', () => {
  it('has the five Fall 2026 courses', () => {
    expect(COURSES.map(c => c.id)).toEqual(['MATH137', 'CS115', 'MATH135', 'EC120', 'BU111']);
    expect(defaultState().term.courses.length).toBe(5);
  });
  it('weights sum to 100 and every course has a final', () => {
    for (const c of COURSES) {
      const sum = c.components.reduce((a, x) => a + x.weight, 0);
      expect(Math.round(sum * 1000) / 1000).toBe(100);
      expect(!!c.components.find(x => x.id === 'final')).toBe(true);
      expect(c.finalDate).toBeNull();
    }
  });
  it('rules match the outlines', () => {
    const q = get('MATH137').components.find(x => x.id === 'quizzes');
    expect(q.items.length).toBe(10);
    expect(q.rule).toEqual({ type: 'bestOf', keep: 9 });
    const a = get('CS115').components.find(x => x.id === 'assign');
    expect(a.items.length).toBe(5);
    expect(a.rule).toEqual({ type: 'dropLowest', n: 1 });
    expect(get('CS115').components.find(x => x.id === 'labq').rule).toEqual({ type: 'dropLowest', n: 1 });
    expect(get('EC120').components.find(x => x.id === 'quizzes').rule).toEqual({ type: 'ranked', weights: [8, 2] });
    expect(get('MATH135').components.find(x => x.id === 'weekly').items.length).toBe(11);
    expect(get('BU111').passRule).toBe('bu111');
    expect(get('CS115').passRule).toBe('cs115');
    expect(get('EC120').school).toBe('laurier');
    expect(get('MATH135').school).toBe('waterloo');
  });
  it('dates are null or YYYY-MM-DD and ids unique per course', () => {
    for (const c of COURSES) {
      const ids = new Set();
      for (const comp of c.components) for (const it of comp.items) {
        expect(it.date === null || /^\d{4}-\d{2}-\d{2}$/.test(it.date)).toBe(true);
        expect(it.score).toBeNull();
        ids.add(it.id);
      }
      expect(ids.size).toBe(c.components.reduce((a, x) => a + x.items.length, 0));
    }
  });
  it('a fresh course computes without NaN', () => {
    for (const c of COURSES) expect(computeCourse(c).status).toBe('no-data');
  });
});
