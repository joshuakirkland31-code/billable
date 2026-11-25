import { describe, it, expect } from './harness.js';
import { interpretStored, withTimeout, defaultState } from '../js/store.js';
import { orphanIds } from '../js/timelapse.js';
import { neededOnFinal } from '../js/grades.js';
import { COURSES } from '../js/courses-data.js';


describe('review fixes', () => {
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
