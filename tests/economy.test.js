import { describe, it, expect } from './harness.js';
import { RANKS, RANK_THRESHOLDS, rankIndex, payFor, streakMultiplier, doPrestige, canPrestige, progressToNext, cityFor } from '../js/economy.js';

const base = { rankIdx: 0, prestige: 0, streakCount: 0, examMult: 1 };

describe('economy', () => {
  it('has 13 ranks with the spec thresholds', () => {
    expect(RANKS.length).toBe(13);
    expect(RANK_THRESHOLDS[0]).toBe(0);
    expect(RANK_THRESHOLDS[1]).toBe(1200);
    expect(RANK_THRESHOLDS[3]).toBe(7560);
    expect(RANK_THRESHOLDS[12]).toBe(1004880);
  });
  it('rankIndex', () => {
    expect(rankIndex(0)).toBe(0);
    expect(rankIndex(7559)).toBe(2);
    expect(rankIndex(7560)).toBe(3);
    expect(rankIndex(5e7)).toBe(12);
  });
  it('payFor applies rate, length bonus, goal bonus, streak and exam', () => {
    expect(payFor(25, base)).toBe(250);
    expect(payFor(50, base)).toBe(550);
    expect(payFor(90, { ...base, streakCount: 10, examMult: 1.5 }))
      .toBe(Math.round(90 * 10 * 1.5 * 1.25 * 1.5));
    expect(payFor(10, { ...base, prestige: 1 })).toBe(110);
    expect(payFor(0, base)).toBe(0);
    expect(payFor(50, { ...base, goalHit: true })).toBe(600);
    expect(payFor(90, { ...base, goalHit: true })).toBe(Math.round(90 * 10 * 1.35));
  });
  it('streak multiplier caps at 2', () => {
    expect(streakMultiplier(0)).toBe(1);
    expect(streakMultiplier(4)).toBe(1.2);
    expect(streakMultiplier(40)).toBe(2);
  });
  it('prestige', () => {
    expect(canPrestige({ xp: RANK_THRESHOLDS[11] })).toBe(false);
    expect(canPrestige({ xp: RANK_THRESHOLDS[12] })).toBe(true);
    const c = doPrestige({ xp: RANK_THRESHOLDS[12], prestige: 0 });
    expect(c.xp).toBe(7560);
    expect(c.prestige).toBe(1);
    expect(cityFor(0)).toBe('Waterloo');
    expect(cityFor(1)).toBe('Toronto');
    expect(cityFor(9)).toBe('Singapore');
  });
  it('progressToNext', () => {
    const p = progressToNext(600);
    expect(p.rank).toBe('Intern I');
    expect(p.next).toBe('Intern II');
    expect(p.pct).toBeCloseTo(50, 1);
    expect(p.minutesLeft).toBe(60);
    expect(progressToNext(RANK_THRESHOLDS[12]).next).toBeNull();
  });
});
