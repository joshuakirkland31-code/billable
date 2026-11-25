// Stopwatch study session state machine (pure) and the payout that ends it.
import { dayKey, isExamSeason } from './time.js';
import { RANKS, rankIndex, payFor, payCtx } from './economy.js';
import { rolloverStreak, applySessionToStreak } from './streak.js';
import { buildDailyContracts, evaluateDailyContracts, behindCourse } from './contracts.js';
import { evaluateAchievements } from './achievements.js';

export const GRACE_MS = 10000;          // leave the app longer than this and the session ends
export const MIN_SAVE_MIN = 5;          // shorter sessions aren't saved
export const IDLE_MS = 2 * 3600000;     // no tap for this long → "Still studying?"
export const IDLE_GRACE_MS = 10 * 60000; // unanswered for this long → ends at last tap
const LIVE = new Set(['running', 'overtime']); // 'overtime' only exists on legacy v1 records
const clone = o => JSON.parse(JSON.stringify(o));

export function startSession({ courseId, goalMin = null, stepId = null, now }) {
  return {
    id: 's' + now.toString(36) + Math.floor(Math.random() * 1e6).toString(36),
    courseId, goalMin, stepId, startedAt: now, awayMs: 0, hiddenAt: null,
    lastSeenAt: now, lastTapAt: now, status: 'running', endedAt: null, endReason: null,
  };
}

export function onHide(a, now) {
  if (!LIVE.has(a.status) || a.hiddenAt !== null) return a;
  return { ...a, hiddenAt: now };
}

export function onShow(a, now) {
  if (a.hiddenAt === null) return a;
  const away = now - a.hiddenAt;
  if (LIVE.has(a.status) && away > GRACE_MS) return { ...a, status: 'completed', endedAt: a.hiddenAt, endReason: 'left' };
  return { ...a, awayMs: a.awayMs + away, hiddenAt: null };
}

export function heartbeat(a, now) { return { ...a, lastSeenAt: now }; }
export function touch(a, now) { return { ...a, lastTapAt: now }; }

export function elapsedMs(a, now) {
  const end = a.endedAt ?? (a.hiddenAt ?? now);
  return Math.max(0, end - a.startedAt - a.awayMs);
}

export function goalReached(a, now) {
  return !!a.goalMin && elapsedMs(a, now) >= a.goalMin * 60000;
}

export function idleState(a, now) {
  const idle = now - (a.lastTapAt ?? a.startedAt);
  if (idle >= IDLE_MS + IDLE_GRACE_MS) return 'expired';
  if (idle >= IDLE_MS) return 'ask';
  return 'ok';
}

export function endIdle(a) {
  return { ...a, status: 'completed', endedAt: a.lastTapAt ?? a.startedAt, endReason: 'idle', hiddenAt: null };
}

export function clockOut(a, now) {
  return { ...a, status: 'completed', endedAt: now, endReason: 'clockout' };
}

/** A session found still running at launch (app was killed): settle it as completed at the last sign of life. */
export function recoverActive(a, now) {
  if (!LIVE.has(a.status)) return a;
  return { ...a, status: 'completed', endedAt: a.hiddenAt ?? a.lastSeenAt ?? now, endReason: 'recovered' };
}

export { behindCourse };

/** Start-of-day housekeeping: streak rollover and today's contracts. */
export function ensureDay(state, now) {
  const s = clone(state);
  const day = dayKey(new Date(now));
  s.career.streak = rolloverStreak(s.career.streak, day);
  if (s.career.contracts.day !== day || !Array.isArray(s.career.contracts.items)) {
    s.career.contracts = { day, items: buildDailyContracts(s, day), allPaid: false };
  }
  return s;
}

export function examMultFor(state, courseId, now) {
  const d = new Date(now);
  if (!isExamSeason(d, state)) return 1;
  const today = dayKey(d);
  const upcoming = state.term.courses.filter(c => c.finalDate && c.finalDate >= today)
    .sort((a, b) => a.finalDate.localeCompare(b.finalDate));
  return upcoming.length && upcoming[0].id === courseId ? 2 : 1.5;
}

/** A session record we can settle: has an id, a start time and a finished status. */
function settleable(a) {
  return !!a && typeof a === 'object' && typeof a.id === 'string' && Number.isFinite(a.startedAt) && a.status === 'completed';
}

/** Settle a finished session into state. Pure. Anything malformed is ignored (state unchanged, receipt.discarded). */
export function finalizeSession(state, a, now, evaluate = evaluateAchievements) {
  const ok = settleable(a);
  const minutes = ok ? Math.floor(elapsedMs(a, now) / 60000) : 0;
  const receipt = { discarded: false, minutes, earned: 0, bonuses: [], goalHit: false, promotedTo: null, streakExtended: false,
    contractsDone: [], contractCash: 0, newAchievements: [], endReason: (a && a.endReason) || 'clockout', stepId: (a && a.stepId) || null };
  if (!ok || minutes < MIN_SAVE_MIN) {
    const s = clone(state);
    if (ok) s.active = null; // a real but too-short session ends; a malformed one never touches state
    receipt.discarded = true;
    return { state: s, receipt };
  }
  let s = clone(state);
  const c = s.career;
  const startDay = dayKey(new Date(a.startedAt));
  const goalHit = !!a.goalMin && minutes >= a.goalMin;
  const ctx = payCtx(c, { examMult: examMultFor(s, a.courseId, a.startedAt), goalHit });
  const rankBefore = rankIndex(c.xp);

  const earned = payFor(minutes, ctx);
  receipt.earned = earned; receipt.goalHit = goalHit;
  if (minutes >= 90) receipt.bonuses.push('Marathon bonus +25%');
  else if (minutes >= 50) receipt.bonuses.push('Deep work bonus +10%');
  if (goalHit) receipt.bonuses.push('Goal hit +10%');
  if (ctx.examMult > 1) receipt.bonuses.push(`Exam season ×${ctx.examMult}`);
  c.xp += earned; c.lifetime += earned; c.cash += earned;
  // Streak is credited to the day the session started (roll over only up to that day first).
  c.streak = rolloverStreak(c.streak, startDay);
  const r = applySessionToStreak(c.streak, startDay, minutes, true);
  c.streak = r.streak; receipt.streakExtended = r.extended;

  s.sessions.push({ id: a.id, courseId: a.courseId, startedAt: a.startedAt, endedAt: a.endedAt ?? now,
    goalMin: a.goalMin ?? null, stepId: a.stepId ?? null, endReason: receipt.endReason,
    minutes, status: 'completed', earned, fine: 0 });
  s.active = null;

  // Contracts: first the list that was showing (may be the day before 4 am), then today's if the day rolled over.
  const allPaidBefore = c.contracts.allPaid;
  const absorb = ev => {
    s = ev.state;
    receipt.contractsDone.push(...ev.newly); receipt.contractCash += ev.cash;
  };
  if (c.contracts.day) absorb(evaluateDailyContracts(s, c.contracts.day));
  const endDay = dayKey(new Date(a.endedAt ?? now));
  const before = s.career.contracts.day;
  s = ensureDay(s, a.endedAt ?? now);
  if (s.career.contracts.day !== before) absorb(evaluateDailyContracts(s, endDay));
  if (s.career.contracts.allPaid && (!allPaidBefore || s.career.contracts.day !== before)) receipt.bonuses.push('All contracts closed');

  const rankAfter = rankIndex(s.career.xp);
  if (rankAfter > rankBefore) receipt.promotedTo = RANKS[rankAfter].name;

  const ach = evaluate(s, now);
  s = ach.state; receipt.newAchievements = ach.newly;
  return { state: s, receipt };
}
