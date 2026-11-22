import { describe, it, expect } from './harness.js';
import { startSession, onHide, onShow, elapsedMs, tick, walkOut, clockOut, recoverActive, finalizeSession, GRACE_MS, examMultFor, ensureDay } from '../js/session.js';
import { defaultState } from '../js/store.js';

const T0 = new Date(2026, 10, 20, 9, 0).getTime(); // Fri Nov 20, 9am (not exam season)
const MIN = 60000;

describe('session machine', () => {
  it('short absence continues and is not credited', () => {
    let a = startSession({ courseId: 'MATH137', targetMin: 25, watched: true, now: T0 });
    a = onHide(a, T0 + MIN);
    a = onShow(a, T0 + MIN + 5000);
    expect(a.status).toBe('running');
    expect(a.awayMs).toBe(5000);
    expect(elapsedMs(a, T0 + 2 * MIN)).toBe(2 * MIN - 5000);
    expect(GRACE_MS).toBe(10000);
  });
  it('absence beyond grace fails', () => {
    let a = startSession({ courseId: 'MATH137', targetMin: 25, watched: true, now: T0 });
    a = onHide(a, T0 + MIN);
    a = onShow(a, T0 + MIN + 11000);
    expect(a.status).toBe('failed');
    expect(a.endedAt).toBe(T0 + MIN);
  });
  it('elapsed excludes current hidden time', () => {
    let a = startSession({ courseId: 'X', targetMin: 25, watched: true, now: T0 });
    a = onHide(a, T0 + MIN);
    expect(elapsedMs(a, T0 + 3 * MIN)).toBe(MIN);
  });
  it('recoverActive fails a killed session', () => {
    let a = startSession({ courseId: 'X', targetMin: 25, watched: true, now: T0 });
    a = onHide(a, T0 + MIN);
    const r = recoverActive(a, T0 + 60 * MIN);
    expect(r.status).toBe('failed');
    expect(r.endedAt).toBe(T0 + MIN);
    const r2 = recoverActive(startSession({ courseId: 'X', targetMin: 25, watched: true, now: T0 }), T0 + 5 * MIN);
    expect(r2.status).toBe('failed');
  });
  it('target → overtime → clock out; walk out before target', () => {
    let a = startSession({ courseId: 'X', targetMin: 15, watched: true, now: T0 });
    a = tick(a, T0 + 14 * MIN);
    expect(a.status).toBe('running');
    expect(walkOut(a, T0 + 14 * MIN).status).toBe('walkedout');
    a = tick(a, T0 + 15 * MIN);
    expect(a.status).toBe('overtime');
    expect(walkOut(a, T0 + 20 * MIN).status).toBe('completed');
    expect(clockOut(a, T0 + 20 * MIN).status).toBe('completed');
  });
});

describe('finalize', () => {
  it('completed 25 min at Intern I pays 250 and starts streak', () => {
    let st = ensureDay(defaultState(), T0);
    let a = startSession({ courseId: 'MATH137', targetMin: 25, watched: true, now: T0 });
    a = clockOut(tick(a, T0 + 25 * MIN), T0 + 25 * MIN);
    const { state, receipt } = finalizeSession(st, a, T0 + 25 * MIN);
    expect(receipt.earned).toBe(250);
    expect(state.career.xp).toBe(250);
    expect(state.career.lifetime).toBe(250);
    expect(state.career.streak.count).toBe(1);
    expect(receipt.streakExtended).toBe(true);
    expect(state.sessions.length).toBe(1);
    expect(state.sessions[0].status).toBe('completed');
    expect(state.sessions[0].minutes).toBe(25);
    expect(state.active).toBeNull();
    expect(state.career.cash >= 250).toBe(true); // + any contract payouts
  });
  it('walk out fines 10% and clamps cash at 0', () => {
    const st = ensureDay(defaultState(), T0);
    st.career.cash = 20;
    const a = walkOut(startSession({ courseId: 'X', targetMin: 50, watched: true, now: T0 }), T0 + 5 * MIN);
    const { state, receipt } = finalizeSession(st, a, T0 + 5 * MIN);
    expect(receipt.fine).toBe(55);
    expect(receipt.earned).toBe(0);
    expect(state.career.cash).toBe(0);
    expect(state.career.streak.count).toBe(0);
    expect(state.sessions[0].status).toBe('walkedout');
  });
  it('unwatched sessions pay 80%', () => {
    const st = ensureDay(defaultState(), T0);
    let a = startSession({ courseId: 'X', targetMin: 25, watched: false, now: T0 });
    a = clockOut(tick(a, T0 + 25 * MIN), T0 + 25 * MIN);
    expect(finalizeSession(st, a, T0 + 25 * MIN).receipt.earned).toBe(200);
  });
  it('reports promotion', () => {
    const st = ensureDay(defaultState(), T0);
    st.career.xp = 1100;
    let a = startSession({ courseId: 'X', targetMin: 15, watched: true, now: T0 });
    a = clockOut(tick(a, T0 + 15 * MIN), T0 + 15 * MIN);
    expect(finalizeSession(st, a, T0 + 15 * MIN).receipt.promotedTo).toBe('Intern II');
  });
  it('exam multiplier', () => {
    const st = defaultState();
    const dec5 = new Date(2026, 11, 5, 10).getTime();
    expect(examMultFor(st, 'MATH137', T0)).toBe(1);
    expect(examMultFor(st, 'MATH137', dec5)).toBe(1.5);
    st.term.courses.find(c => c.id === 'CS115').finalDate = '2026-12-12';
    st.term.courses.find(c => c.id === 'MATH137').finalDate = '2026-12-15';
    expect(examMultFor(st, 'CS115', dec5)).toBe(2);
    expect(examMultFor(st, 'MATH137', dec5)).toBe(1.5);
  });
  it('ensureDay rolls contracts once per day', () => {
    const st = ensureDay(defaultState(), T0);
    expect(st.career.contracts.day).toBe('2026-11-20');
    expect(st.career.contracts.ids.length).toBe(3);
    const again = ensureDay(st, T0 + MIN);
    expect(again.career.contracts.ids).toEqual(st.career.contracts.ids);
  });
});
