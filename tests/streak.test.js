import { describe, it, expect } from './harness.js';
import { rolloverStreak, applySessionToStreak, PTO_MAX } from '../js/streak.js';

const s0 = () => ({ count: 0, best: 0, lastDay: null, pto: 0, brokenFrom: 0 });

describe('streak', () => {
  it('consecutive days increment, same day does not', () => {
    let s = applySessionToStreak(s0(), '2026-11-20', 20, true).streak;
    expect(s.count).toBe(1);
    const r = applySessionToStreak(s, '2026-11-20', 30, true);
    expect(r.extended).toBe(false);
    expect(r.streak.count).toBe(1);
    s = applySessionToStreak(rolloverStreak(s, '2026-11-21'), '2026-11-21', 15, true).streak;
    expect(s.count).toBe(2);
    expect(s.best).toBe(2);
  });
  it('short or failed sessions do not count', () => {
    expect(applySessionToStreak(s0(), '2026-11-20', 14, true).extended).toBe(false);
    expect(applySessionToStreak(s0(), '2026-11-20', 60, false).extended).toBe(false);
  });
  it('PTO covers a missed day', () => {
    const s = { count: 5, best: 5, lastDay: '2026-11-18', pto: 1, brokenFrom: 0 };
    const r = rolloverStreak(s, '2026-11-20');
    expect(r.count).toBe(5);
    expect(r.pto).toBe(0);
    expect(applySessionToStreak(r, '2026-11-20', 20, true).streak.count).toBe(6);
  });
  it('not enough PTO resets', () => {
    const s = { count: 5, best: 5, lastDay: '2026-11-17', pto: 1, brokenFrom: 0 };
    const r = rolloverStreak(s, '2026-11-20');
    expect(r.count).toBe(0);
    expect(r.brokenFrom).toBe(5);
    expect(r.best).toBe(5);
    expect(applySessionToStreak(r, '2026-11-20', 20, true).streak.count).toBe(1);
  });
  it('yesterday is not a miss', () => {
    const s = { count: 3, best: 3, lastDay: '2026-11-19', pto: 0, brokenFrom: 0 };
    expect(rolloverStreak(s, '2026-11-20').count).toBe(3);
    expect(PTO_MAX).toBe(2);
  });
});
