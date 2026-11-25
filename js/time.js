// Local-time date helpers. Never use toISOString() (UTC shift).
export const DAY_START_HOUR = 4;

const pad = n => String(n).padStart(2, '0');
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12); // noon avoids DST edges
}

/** Study "day" for a moment; days start at 04:00 local. */
export function dayKey(date = new Date()) {
  const d = new Date(date.getTime());
  if (d.getHours() < DAY_START_HOUR) d.setDate(d.getDate() - 1);
  return keyOf(d);
}

export function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return keyOf(d);
}

/** Monday of the week containing this dayKey. */
export function weekKey(key) {
  const d = parseKey(key);
  const dow = (d.getDay() + 6) % 7; // Mon=0
  d.setDate(d.getDate() - dow);
  return keyOf(d);
}

export function daysBetween(a, b) {
  return Math.round((parseKey(b) - parseKey(a)) / 86400000);
}

/** Exam season = the 23 days ending at the current term's latest final (fallback Dec 1-23, 2026). */
export function examSeasonRange(state) {
  const finals = ((state && state.term && state.term.courses) || []).map(c => c.finalDate).filter(Boolean).sort();
  if (!finals.length) return { start: '2026-12-01', end: '2026-12-23' };
  const end = finals[finals.length - 1];
  return { start: addDays(end, -22), end };
}

export function isExamSeason(date = new Date(), state = null) {
  const { start, end } = examSeasonRange(state);
  const k = keyOf(date); // calendar date
  return k >= start && k <= end;
}

export function todayKey() { return dayKey(new Date()); }
