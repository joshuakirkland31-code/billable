// Daily streak with PTO protection. A day counts with one completed session >= 15 min.
import { addDays, daysBetween } from './time.js';

export const PTO_MAX = 2;
export const PTO_PRICE_MIN = 120; // price = 120 minutes of pay at current rate
export const STREAK_MIN_MINUTES = 15;

/** Apply missed days before today: consume PTO, else break the streak. */
export function rolloverStreak(streak, today) {
  const s = { ...streak };
  if (!s.lastDay || s.count === 0) return s;
  const gap = daysBetween(s.lastDay, today);
  if (gap <= 1) return s;
  const missed = gap - 1;
  if (s.pto >= missed) {
    s.pto -= missed;
    s.lastDay = addDays(today, -1);
  } else {
    s.brokenFrom = s.count;
    s.count = 0;
  }
  return s;
}

export function applySessionToStreak(streak, day, minutes, completed) {
  const s = { ...streak };
  if (!completed || minutes < STREAK_MIN_MINUTES || s.lastDay === day) return { streak: s, extended: false };
  s.count = s.lastDay === addDays(day, -1) && s.count > 0 ? s.count + 1 : 1;
  s.best = Math.max(s.best || 0, s.count);
  s.lastDay = day;
  return { streak: s, extended: true };
}
