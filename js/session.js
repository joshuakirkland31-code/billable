// Study session state machine (pure) and the payout that ends it.
import { dayKey, isExamSeason } from './time.js';
import { RANKS, rankIndex, rateFor, payFor, fineFor, payCtx } from './economy.js';
import { rolloverStreak, applySessionToStreak } from './streak.js';
import { dailyContracts, evaluateContracts, byId, ALL_DONE_BONUS_MIN } from './contracts.js';
import { computeCourse } from './grades.js';
import { evaluateAchievements } from './achievements.js';

export const GRACE_MS = 10000;
const LIVE = new Set(['running', 'overtime']);
const clone = o => JSON.parse(JSON.stringify(o));

export function startSession({ courseId, targetMin, watched, now }) {
  return { id: 's' + now.toString(36) + Math.floor(Math.random() * 1e6).toString(36),
    courseId, targetMin, watched, startedAt: now, awayMs: 0, hiddenAt: null, status: 'running', endedAt: null };
}

export function onHide(a, now) {
  if (!LIVE.has(a.status) || a.hiddenAt !== null) return a;
  return { ...a, hiddenAt: now };
}

export function onShow(a, now) {
  if (a.hiddenAt === null) return a;
  const away = now - a.hiddenAt;
  if (LIVE.has(a.status) && away > GRACE_MS) {
    // Target already met: leaving just clocks you out at the moment you left.
    if (tick(a, a.hiddenAt).status === 'overtime') return { ...a, status: 'completed', endedAt: a.hiddenAt };
    return { ...a, status: 'failed', endedAt: a.hiddenAt };
  }
  return { ...a, awayMs: a.awayMs + away, hiddenAt: null };
}

/** Record that the app was alive at `now` (used to date a session if the app is killed). */
export function heartbeat(a, now) {
  return { ...a, lastSeenAt: now };
}

export function elapsedMs(a, now) {
  const end = a.endedAt ?? (a.hiddenAt ?? now);
  return Math.max(0, end - a.startedAt - a.awayMs);
}

export function tick(a, now) {
  if (a.status === 'running' && elapsedMs(a, now) >= a.targetMin * 60000) return { ...a, status: 'overtime' };
  return a;
}

export function clockOut(a, now) {
  return { ...a, status: 'completed', endedAt: now };
}

export function walkOut(a, now) {
  const t = tick(a, now);
  if (t.status === 'overtime') return clockOut(t, now);
  return { ...t, status: 'walkedout', endedAt: now };
}

export function recoverActive(a, now) {
  if (!LIVE.has(a.status)) return a;
  const end = a.hiddenAt ?? a.lastSeenAt ?? now;
  const reached = a.status === 'overtime' || elapsedMs({ ...a, hiddenAt: null, endedAt: end }, end) >= a.targetMin * 60000;
  return { ...a, status: reached ? 'completed' : 'failed', endedAt: end };
}

/** Course most behind its target (status 'behind'), or null. */
export function behindCourse(state) {
  let best = null, gap = 0;
  for (const c of state.term.courses) {
    const r = computeCourse(c);
    if (r.status === 'behind' && c.target - r.current > gap) { gap = c.target - r.current; best = c.id; }
  }
  return best;
}

/** Start-of-day housekeeping: streak rollover and today's contracts. */
export function ensureDay(state, now) {
  const s = clone(state);
  const day = dayKey(new Date(now));
  s.career.streak = rolloverStreak(s.career.streak, day);
  if (s.career.contracts.day !== day) {
    const behind = behindCourse(s);
    s.career.contracts = { day, ids: dailyContracts(day, { behind }).map(c => c.id), done: [], allPaid: false, behind };
  }
  return s;
}

export function examMultFor(state, courseId, now) {
  const d = new Date(now);
  if (!isExamSeason(d)) return 1;
  const today = dayKey(d);
  const upcoming = state.term.courses.filter(c => c.finalDate && c.finalDate >= today)
    .sort((a, b) => a.finalDate.localeCompare(b.finalDate));
  return upcoming.length && upcoming[0].id === courseId ? 2 : 1.5;
}

/** Settle a finished session into state. Pure. */
export function finalizeSession(state, a, now, evaluate = evaluateAchievements) {
  let s = ensureDay(state, a.endedAt ?? now);
  const c = s.career;
  const day = dayKey(new Date(a.startedAt));
  const completed = a.status === 'completed';
  const minutes = Math.floor(elapsedMs(a, now) / 60000);
  const ctx = payCtx(c, { unwatched: !a.watched, examMult: examMultFor(s, a.courseId, a.startedAt) });
  const rankBefore = rankIndex(c.xp);
  const receipt = { earned: 0, fine: 0, bonuses: [], promotedTo: null, newAchievements: [], contractsDone: [], contractCash: 0, streakExtended: false, minutes, status: a.status };

  if (completed) {
    const earned = payFor(minutes, ctx);
    receipt.earned = earned;
    if (minutes >= 90) receipt.bonuses.push('Marathon bonus +25%');
    else if (minutes >= 50) receipt.bonuses.push('Deep work bonus +10%');
    if (ctx.examMult > 1) receipt.bonuses.push(`Exam season ×${ctx.examMult}`);
    if (!a.watched) receipt.bonuses.push('Unwatched ×0.8');
    c.xp += earned; c.lifetime += earned; c.cash += earned;
    const r = applySessionToStreak(c.streak, day, minutes, true);
    c.streak = r.streak; receipt.streakExtended = r.extended;
  } else {
    receipt.fine = fineFor(a.targetMin, ctx);
    c.cash = Math.max(0, c.cash - receipt.fine);
  }

  s.sessions.push({ id: a.id, courseId: a.courseId, startedAt: a.startedAt, endedAt: a.endedAt ?? now,
    targetMin: a.targetMin, minutes, status: a.status, earned: receipt.earned, fine: receipt.fine,
    watched: a.watched, hasTimelapse: false, starred: false });
  s.active = null;

  // Contracts (today's)
  if (c.contracts.day === dayKey(new Date(now))) {
    const todays = s.sessions.filter(x => dayKey(new Date(x.startedAt)) === c.contracts.day);
    const ev = evaluateContracts(c.contracts.ids, c.contracts.done, todays, { behind: c.contracts.behind });
    const rate = rateFor(rankIndex(c.xp), c.prestige);
    for (const id of ev.newly) {
      const pay = Math.round(byId(id).rewardMin * rate);
      c.cash += pay; receipt.contractCash += pay;
      receipt.contractsDone.push(id);
      c.contractsCompleted = (c.contractsCompleted || 0) + 1;
    }
    c.contracts.done = [...c.contracts.done, ...ev.newly];
    if (ev.allDone && !c.contracts.allPaid) {
      const pay = Math.round(ALL_DONE_BONUS_MIN * rate);
      c.cash += pay; receipt.contractCash += pay; c.contracts.allPaid = true;
      receipt.bonuses.push('All contracts closed');
    }
  }

  const rankAfter = rankIndex(c.xp);
  if (rankAfter > rankBefore) receipt.promotedTo = RANKS[rankAfter].name;

  const ach = evaluate(s, now);
  s = ach.state; receipt.newAchievements = ach.newly;
  return { state: s, receipt };
}
