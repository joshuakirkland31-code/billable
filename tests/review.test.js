import { describe, it, expect } from './harness.js';
import { weeklyReview, markReviewed } from '../js/review.js';
import { defaultState } from '../js/store.js';

const s = (y, m, d, minutes, courseId = 'MATH137', status = 'completed') =>
  ({ id: 'x' + Math.random(), courseId, startedAt: new Date(y, m, d, 12).getTime(), minutes, status, targetMin: 25, earned: 0, fine: 0 });

describe('weekly review', () => {
  it('reviews last week vs the week before, with bonus when beaten', () => {
    const st = defaultState();
    st.sessions.push(s(2026, 10, 10, 60), s(2026, 10, 17, 90, 'CS115'), s(2026, 10, 18, 30), s(2026, 10, 18, 50, 'MATH137', 'failed'));
    const r = weeklyReview(st, '2026-11-23');
    expect(r.weekKey).toBe('2026-11-16');
    expect(r.minutes).toBe(120);
    expect(r.prevMinutes).toBe(60);
    expect(r.sessions).toBe(2);
    expect(r.byCourse).toEqual({ CS115: 90, MATH137: 30 });
    expect(r.beat).toBe(true);
    expect(r.bonus).toBe(300);
    const after = markReviewed(st, r);
    expect(after.career.cash).toBe(300);
    expect(weeklyReview(after, '2026-11-25')).toBeNull();
  });
  it('no review when last week had no sessions', () => {
    expect(weeklyReview(defaultState(), '2026-11-23')).toBeNull();
  });
  it('no bonus when not beaten', () => {
    const st = defaultState();
    st.sessions.push(s(2026, 10, 10, 200), s(2026, 10, 17, 90));
    const r = weeklyReview(st, '2026-11-23');
    expect(r.beat).toBe(false);
    expect(r.bonus).toBe(0);
  });
});
