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

export function isExamSeason(date = new Date()) {
  return date.getFullYear() === 2026 && date.getMonth() === 11 && date.getDate() <= 23;
}

export function todayKey() { return dayKey(new Date()); }
