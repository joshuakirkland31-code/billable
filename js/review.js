// Weekly performance review: last week vs the week before.
import { dayKey, weekKey, addDays } from './time.js';
import { rankIndex, rateFor } from './economy.js';

export const REVIEW_BONUS_MIN = 30;

function weekStats(sessions, wk) {
  const end = addDays(wk, 7);
  const inWk = sessions.filter(x => { const d = dayKey(new Date(x.startedAt)); return d >= wk && d < end && x.status === 'completed'; });
  const byCourse = {};
  for (const x of inWk) byCourse[x.courseId] = (byCourse[x.courseId] || 0) + x.minutes;
  return { minutes: inWk.reduce((a, x) => a + x.minutes, 0), sessions: inWk.length, byCourse };
}

export function weeklyReview(state, todayKey) {
  const thisWeek = weekKey(todayKey);
  if (state.career.lastReviewWeek === thisWeek) return null;
  const wk = addDays(thisWeek, -7);
  const last = weekStats(state.sessions, wk);
  if (last.sessions === 0) return null;
  const prev = weekStats(state.sessions, addDays(wk, -7));
  const beat = last.minutes > prev.minutes;
  const rate = rateFor(rankIndex(state.career.xp), state.career.prestige);
  return { weekKey: wk, reviewWeek: thisWeek, minutes: last.minutes, prevMinutes: prev.minutes, sessions: last.sessions,
    byCourse: last.byCourse, beat, bonus: beat ? Math.round(REVIEW_BONUS_MIN * rate) : 0 };
}

export function markReviewed(state, review) {
  const s = JSON.parse(JSON.stringify(state));
  s.career.cash += review.bonus;
  s.career.lastReviewWeek = review.reviewWeek;
  return s;
}
