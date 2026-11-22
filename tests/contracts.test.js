import { describe, it, expect } from './harness.js';
import { dailyContracts, CONTRACTS, evaluateContracts } from '../js/contracts.js';
import { addDays } from '../js/time.js';

const at = (h, m = 0) => new Date(2026, 10, 20, h, m).getTime();

describe('contracts', () => {
  it('pool has at least 10 contracts', () => {
    expect(CONTRACTS.length >= 10).toBe(true);
  });
  it('deterministic per day, 3 unique', () => {
    const a = dailyContracts('2026-11-20', { behind: null }).map(c => c.id);
    const b = dailyContracts('2026-11-20', { behind: null }).map(c => c.id);
    expect(a).toEqual(b);
    expect(a.length).toBe(3);
    expect(new Set(a).size).toBe(3);
  });
  it('varies across days', () => {
    const first = dailyContracts('2026-11-20', { behind: null }).map(c => c.id).join();
    let differs = false;
    for (let i = 1; i <= 7; i++) if (dailyContracts(addDays('2026-11-20', i), { behind: null }).map(c => c.id).join() !== first) differs = true;
    expect(differs).toBe(true);
  });
  it('behind course forces study_behind first', () => {
    const c = dailyContracts('2026-11-20', { behind: 'MATH135' });
    expect(c[0].id).toBe('study_behind');
    expect(new Set(c.map(x => x.id)).size).toBe(3);
  });
  it('checks evaluate sessions', () => {
    const two = CONTRACTS.find(c => c.id === 'two_courses');
    const sess = [
      { courseId: 'MATH137', startedAt: at(9), minutes: 20, status: 'completed' },
      { courseId: 'CS115', startedAt: at(11), minutes: 20, status: 'completed' },
    ];
    expect(two.check(sess, {})).toBe(true);
    expect(two.check(sess.slice(0, 1), {})).toBe(false);
    const early = CONTRACTS.find(c => c.id === 'early_bird');
    expect(early.check(sess, {})).toBe(true);
    const behind = CONTRACTS.find(c => c.id === 'study_behind');
    expect(behind.check([{ courseId: 'MATH135', startedAt: at(12), minutes: 30, status: 'completed' }], { behind: 'MATH135' })).toBe(true);
    expect(behind.check([{ courseId: 'MATH135', startedAt: at(12), minutes: 30, status: 'failed' }], { behind: 'MATH135' })).toBe(false);
  });
  it('evaluateContracts returns newly done ids and all-done flag', () => {
    const ids = ['two_courses', 'early_bird', 'night_shift'];
    const sess = [
      { courseId: 'MATH137', startedAt: at(9), minutes: 20, status: 'completed' },
      { courseId: 'CS115', startedAt: at(22), minutes: 20, status: 'completed' },
    ];
    const r = evaluateContracts(ids, ['early_bird'], sess, {});
    expect(r.newly).toEqual(['two_courses', 'night_shift']);
    expect(r.allDone).toBe(true);
  });
});
