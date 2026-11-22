// Career economy: ranks, pay, fines, prestige.
export const RANKS = [
  { name: 'Intern I', hours: 0, rate: 10 },
  { name: 'Intern II', hours: 2, rate: 12 },
  { name: 'Intern III', hours: 5, rate: 14 },
  { name: 'Analyst I', hours: 10, rate: 18 },
  { name: 'Analyst II', hours: 18, rate: 21 },
  { name: 'Analyst III', hours: 28, rate: 24 },
  { name: 'Associate I', hours: 40, rate: 30 },
  { name: 'Associate II', hours: 55, rate: 34 },
  { name: 'Associate III', hours: 75, rate: 38 },
  { name: 'VP', hours: 100, rate: 50 },
  { name: 'Director', hours: 140, rate: 65 },
  { name: 'Managing Director', hours: 200, rate: 80 },
  { name: 'Partner', hours: 300, rate: 100 },
];

export const RANK_THRESHOLDS = RANKS.reduce((acc, r, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1] + (r.hours - RANKS[i - 1].hours) * 60 * RANKS[i - 1].rate);
  return acc;
}, []);

export const PARTNER = RANKS.length - 1;
export const CITIES = ['Waterloo', 'Toronto', 'New York', 'London', 'Hong Kong', 'Singapore'];

export function rankIndex(xp) {
  let i = 0;
  while (i + 1 < RANK_THRESHOLDS.length && xp >= RANK_THRESHOLDS[i + 1]) i++;
  return i;
}

export function rateFor(rankIdx, prestige = 0) {
  return RANKS[rankIdx].rate * (1 + 0.1 * prestige);
}

export function streakMultiplier(count) {
  return Math.min(2, Math.round((1 + 0.05 * count) * 100) / 100);
}

export function lengthBonus(minutes) {
  return minutes >= 90 ? 0.25 : minutes >= 50 ? 0.10 : 0;
}

/** ctx = { rankIdx, prestige, streakCount, unwatched, examMult } */
export function payFor(minutes, ctx) {
  if (!(minutes > 0)) return 0;
  const rate = rateFor(ctx.rankIdx, ctx.prestige || 0);
  return Math.round(minutes * rate * streakMultiplier(ctx.streakCount || 0) * (1 + lengthBonus(minutes))
    * (ctx.examMult || 1) * (ctx.unwatched ? 0.8 : 1));
}

export function fineFor(targetMin, ctx) {
  return Math.round(0.1 * payFor(targetMin, ctx));
}

export function canPrestige(career) {
  return rankIndex(career.xp) === PARTNER;
}

export function doPrestige(career) {
  return { ...career, xp: RANK_THRESHOLDS[3], prestige: (career.prestige || 0) + 1 };
}

export function cityFor(prestige) {
  return CITIES[Math.min(prestige || 0, CITIES.length - 1)];
}

export function cityLabel(prestige) {
  const p = prestige || 0;
  return p >= CITIES.length ? `${CITIES[CITIES.length - 1]} ×${p - CITIES.length + 2}` : CITIES[p];
}

export function progressToNext(xp, prestige = 0) {
  const i = rankIndex(xp);
  if (i === PARTNER) return { rank: RANKS[i].name, next: null, pct: 100, minutesLeft: 0 };
  const lo = RANK_THRESHOLDS[i], hi = RANK_THRESHOLDS[i + 1];
  return {
    rank: RANKS[i].name,
    next: RANKS[i + 1].name,
    pct: ((xp - lo) / (hi - lo)) * 100,
    minutesLeft: Math.ceil((hi - xp) / rateFor(i, prestige)),
  };
}

/** Context for pay/fine from state. examMult supplied by caller. */
export function payCtx(career, { unwatched = false, examMult = 1 } = {}) {
  return { rankIdx: rankIndex(career.xp), prestige: career.prestige || 0, streakCount: career.streak.count, unwatched, examMult };
}
