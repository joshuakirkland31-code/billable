import { describe, it, expect } from './harness.js';
import { startSession, onHide, onShow, tick, recoverActive, finalizeSession, ensureDay, heartbeat } from '../js/session.js';
import { interpretStored, withTimeout, defaultState } from '../js/store.js';
import { orphanIds } from '../js/timelapse.js';
import { neededOnFinal } from '../js/grades.js';
import { COURSES } from '../js/courses-data.js';

const T0 = new Date(2026, 10, 20, 9, 0).getTime();
const MIN = 60000;

describe('review fixes', () => {
  it('C2: leaving during overtime clocks out at the moment you left (completed, not failed)', () => {
    let a = tick(startSession({ courseId: 'X', targetMin: 15, watched: true, now: T0 }), T0 + 16 * MIN);
    expect(a.status).toBe('overtime');
    a = onShow(onHide(a, T0 + 20 * MIN), T0 + 40 * MIN);
    expect(a.status).toBe('completed');
    expect(a.endedAt).toBe(T0 + 20 * MIN);
    const { receipt } = finalizeSession(ensureDay(defaultState(), T0), a, T0 + 40 * MIN);
    expect(receipt.earned).toBe(200);
    expect(receipt.fine).toBe(0);
  });
  it('C2: an app killed during overtime is settled as completed', () => {
    let a = tick(startSession({ courseId: 'X', targetMin: 15, watched: true, now: T0 }), T0 + 16 * MIN);
    a = heartbeat(a, T0 + 18 * MIN);
    const r = recoverActive(a, T0 + 600 * MIN);
    expect(r.status).toBe('completed');
    expect(r.endedAt).toBe(T0 + 18 * MIN);
  });
  it('minor4: recovered pre-target session ends at the last heartbeat, not at relaunch', () => {
    const a = heartbeat(startSession({ courseId: 'X', targetMin: 50, watched: true, now: T0 }), T0 + 5 * MIN);
    const r = recoverActive(a, T0 + 600 * MIN);
    expect(r.status).toBe('failed');
    expect(r.endedAt).toBe(T0 + 5 * MIN);
  });
  it('C1: stored data is never replaced by defaults when it cannot be read', () => {
    expect(interpretStored(undefined).schema).toBe(2);
    const s = defaultState(); s.career.cash = 5;
    expect(interpretStored(JSON.parse(JSON.stringify(s))).career.cash).toBe(5);
    expect(() => interpretStored({ schema: 99 })).toThrow('load-failed');
    expect(() => interpretStored('garbage')).toThrow('load-failed');
  });
  it('I1: withTimeout rejects a hung promise', async () => {
    await expect(withTimeout(new Promise(() => {}), 20)).toReject('timeout');
    expect(await withTimeout(Promise.resolve(7), 20)).toBe(7);
  });
  it('I2: orphan frame sweeping', () => {
    const keys = ['a#000000', 'a#000001', 'b#000000', 'live#000000'];
    expect(orphanIds(keys, ['a'], 'live')).toEqual(['b']);
  });
  it('I3: needed on the final above 100% is unreachable', () => {
    const c = JSON.parse(JSON.stringify(COURSES.find(x => x.id === 'MATH137')));
    c.components.find(x => x.id === 'mid').items[0].score = 50;
    expect(neededOnFinal(c)).toBe(Infinity);
    c.components.find(x => x.id === 'mid').items[0].score = 90;
    expect(neededOnFinal(c) <= 100).toBe(true);
  });
});
