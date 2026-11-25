import { describe, it, expect } from './harness.js';
import { startSession, onHide, onShow, heartbeat, touch, elapsedMs, goalReached, idleState, endIdle, clockOut, recoverActive,
  finalizeSession, examMultFor, ensureDay, GRACE_MS, MIN_SAVE_MIN, IDLE_MS, IDLE_GRACE_MS } from '../js/session.js';
import { defaultState } from '../js/store.js';

const T0 = new Date(2026, 10, 20, 9, 0).getTime(); // Fri Nov 20, 9am (not exam season)
const MIN = 60000;
const fresh = () => ensureDay(defaultState(), T0);

describe('stopwatch machine', () => {
  it('constants', () => {
    expect(GRACE_MS).toBe(10000);
    expect(MIN_SAVE_MIN).toBe(5);
    expect(IDLE_MS).toBe(7200000);
    expect(IDLE_GRACE_MS).toBe(600000);
  });
  it('starts running with goal and step', () => {
    const a = startSession({ courseId: 'MATH137', goalMin: 50, stepId: 'st1', now: T0 });
    expect(a.status).toBe('running');
    expect(a.goalMin).toBe(50);
    expect(a.stepId).toBe('st1');
    expect(a.lastTapAt).toBe(T0);
    expect(a.lastSeenAt).toBe(T0);
  });
  it('short absence continues, long absence completes at the moment you left', () => {
    let a = startSession({ courseId: 'MATH137', goalMin: null, now: T0 });
    a = onShow(onHide(a, T0 + MIN), T0 + MIN + 5000);
    expect(a.status).toBe('running');
    expect(a.awayMs).toBe(5000);
    expect(elapsedMs(a, T0 + 2 * MIN)).toBe(2 * MIN - 5000);
    a = onShow(onHide(a, T0 + 20 * MIN), T0 + 40 * MIN);
    expect(a.status).toBe('completed');
    expect(a.endedAt).toBe(T0 + 20 * MIN);
    expect(a.endReason).toBe('left');
  });
  it('goalReached', () => {
    const a = startSession({ courseId: 'X', goalMin: 25, now: T0 });
    expect(goalReached(a, T0 + 24 * MIN)).toBe(false);
    expect(goalReached(a, T0 + 25 * MIN)).toBe(true);
    expect(goalReached(startSession({ courseId: 'X', goalMin: null, now: T0 }), T0 + 99 * MIN)).toBe(false);
  });
  it('idle guard asks after 2h and expires 10 min later; a tap resets it', () => {
    const b = startSession({ courseId: 'X', now: T0 });
    expect(idleState(b, T0 + IDLE_MS - 1)).toBe('ok');
    expect(idleState(b, T0 + IDLE_MS)).toBe('ask');
    expect(idleState(b, T0 + IDLE_MS + IDLE_GRACE_MS)).toBe('expired');
    const t = touch(b, T0 + 30 * MIN);
    expect(idleState(t, T0 + IDLE_MS)).toBe('ok');
    const e = endIdle(t);
    expect(e.status).toBe('completed');
    expect(e.endedAt).toBe(T0 + 30 * MIN);
    expect(e.endReason).toBe('idle');
  });
  it('clock out', () => {
    const a = clockOut(startSession({ courseId: 'X', now: T0 }), T0 + 30 * MIN);
    expect(a.status).toBe('completed');
    expect(a.endReason).toBe('clockout');
  });
  it('recovers a killed session at the last heartbeat', () => {
    const a = heartbeat(startSession({ courseId: 'X', now: T0 }), T0 + 18 * MIN);
    const r = recoverActive(a, T0 + 600 * MIN);
    expect(r.status).toBe('completed');
    expect(r.endedAt).toBe(T0 + 18 * MIN);
    expect(r.endReason).toBe('recovered');
  });
  it('recovers a legacy v1 active session', () => {
    const r = recoverActive({ id: 'v1', courseId: 'X', targetMin: 15, watched: true, startedAt: T0, awayMs: 0, hiddenAt: T0 + 20 * MIN, status: 'overtime', endedAt: null }, T0 + 600 * MIN);
    expect(r.status).toBe('completed');
    expect(r.endedAt).toBe(T0 + 20 * MIN);
    expect(r.endReason).toBe('recovered');
  });
});

describe('finalize (stopwatch)', () => {
  it('25 min without a goal pays 250 and starts the streak', () => {
    const a = clockOut(startSession({ courseId: 'MATH137', now: T0 }), T0 + 25 * MIN);
    const { state, receipt } = finalizeSession(fresh(), a, T0 + 25 * MIN);
    expect(receipt.earned).toBe(250);
    expect(receipt.discarded).toBe(false);
    expect(receipt.goalHit).toBe(false);
    expect(state.career.xp).toBe(250);
    expect(state.career.streak.count).toBe(1);
    expect(state.sessions.length).toBe(1);
    expect(state.sessions[0].goalMin).toBeNull();
    expect(state.sessions[0].endReason).toBe('clockout');
    expect(state.active).toBeNull();
  });
  it('hitting a 50 min goal adds 10%', () => {
    const a = clockOut(startSession({ courseId: 'MATH137', goalMin: 50, now: T0 }), T0 + 50 * MIN);
    const { receipt } = finalizeSession(fresh(), a, T0 + 50 * MIN);
    expect(receipt.earned).toBe(600);
    expect(receipt.goalHit).toBe(true);
    expect(receipt.bonuses.includes('Goal hit +10%')).toBe(true);
  });
  it('under 5 minutes is discarded', () => {
    const st = fresh(); st.active = startSession({ courseId: 'X', now: T0 });
    const a = clockOut(st.active, T0 + 4 * MIN);
    const { state, receipt } = finalizeSession(st, a, T0 + 4 * MIN);
    expect(receipt.discarded).toBe(true);
    expect(receipt.earned).toBe(0);
    expect(state.sessions.length).toBe(0);
    expect(state.career.cash).toBe(0);
    expect(state.active).toBeNull();
  });
  it('leaving early still pays (no fine)', () => {
    let a = startSession({ courseId: 'X', goalMin: 90, now: T0 });
    a = onShow(onHide(a, T0 + 30 * MIN), T0 + 31 * MIN);
    const { receipt, state } = finalizeSession(fresh(), a, T0 + 31 * MIN);
    expect(receipt.earned).toBe(300);
    expect(receipt.endReason).toBe('left');
    expect(state.sessions[0].status).toBe('completed');
  });
  it('credits a session crossing 4 am to its start day', () => {
    const s0 = new Date(2026, 10, 21, 3, 30).getTime();
    const a = clockOut(startSession({ courseId: 'X', now: s0 }), s0 + 60 * MIN);
    const { state } = finalizeSession(ensureDay(defaultState(), s0), a, s0 + 60 * MIN);
    expect(state.career.streak.lastDay).toBe('2026-11-20');
  });
  it('reports promotion', () => {
    const st = fresh(); st.career.xp = 1100;
    const a = clockOut(startSession({ courseId: 'X', now: T0 }), T0 + 15 * MIN);
    expect(finalizeSession(st, a, T0 + 15 * MIN).receipt.promotedTo).toBe('Intern II');
  });
  it('exam multiplier uses the term\'s final dates', () => {
    const st = defaultState();
    const dec5 = new Date(2026, 11, 5, 10).getTime();
    expect(examMultFor(st, 'MATH137', T0)).toBe(1);
    expect(examMultFor(st, 'MATH137', dec5)).toBe(1.5);
    st.term.courses.find(c => c.id === 'CS115').finalDate = '2026-12-12';
    st.term.courses.find(c => c.id === 'MATH137').finalDate = '2026-12-15';
    expect(examMultFor(st, 'CS115', dec5)).toBe(2);
    expect(examMultFor(st, 'MATH137', dec5)).toBe(1.5);
  });
});
