import { describe, it, expect } from './harness.js';
import { dayKey, weekKey, addDays, isExamSeason, examSeasonRange } from '../js/time.js';

describe('time', () => {
  it('dayKey uses a 4am boundary', () => {
    expect(dayKey(new Date(2026, 10, 22, 3, 59))).toBe('2026-11-21');
    expect(dayKey(new Date(2026, 10, 22, 4, 0))).toBe('2026-11-22');
  });
  it('weekKey returns that week\'s Monday', () => {
    expect(weekKey('2026-11-22')).toBe('2026-11-16');
    expect(weekKey('2026-11-23')).toBe('2026-11-23');
  });
  it('addDays crosses months', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-01', -1)).toBe('2026-11-30');
  });
  it('exam season falls back to Dec 1-23 without final dates', () => {
    const st = { term: { courses: [{ id: 'A', finalDate: null }] } };
    expect(examSeasonRange(st)).toEqual({ start: '2026-12-01', end: '2026-12-23' });
    expect(isExamSeason(new Date(2026, 11, 5, 12), st)).toBe(true);
    expect(isExamSeason(new Date(2026, 11, 24, 12), st)).toBe(false);
    expect(isExamSeason(new Date(2026, 10, 30, 12), st)).toBe(false);
  });
  it('exam season ends at the latest final date', () => {
    const st = { term: { courses: [{ id: 'CS115', finalDate: '2026-12-18' }, { id: 'MATH137', finalDate: '2026-12-12' }] } };
    expect(examSeasonRange(st)).toEqual({ start: '2026-11-26', end: '2026-12-18' });
    expect(isExamSeason(new Date(2026, 10, 26, 12), st)).toBe(true);
    expect(isExamSeason(new Date(2026, 11, 19, 12), st)).toBe(false);
  });
});
