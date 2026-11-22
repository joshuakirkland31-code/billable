import { describe, it, expect } from './harness.js';
import { dayKey, weekKey, addDays, isExamSeason } from '../js/time.js';

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
  it('isExamSeason is Dec 1-23', () => {
    expect(isExamSeason(new Date(2026, 11, 1, 12))).toBe(true);
    expect(isExamSeason(new Date(2026, 11, 23, 23))).toBe(true);
    expect(isExamSeason(new Date(2026, 11, 24, 12))).toBe(false);
    expect(isExamSeason(new Date(2026, 10, 30, 12))).toBe(false);
  });
});
