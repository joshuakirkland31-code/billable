import { describe, it, expect } from './harness.js';
import { defaultState, migrate, SCHEMA } from '../js/store.js';

describe('store', () => {
  it('default state has schema 1 and the why lines', () => {
    const s = defaultState();
    expect(SCHEMA).toBe(1);
    expect(s.schema).toBe(1);
    expect(s.career.why).toEqual(['Make money', 'Land the internship', "Grades I'm proud of"]);
    expect(s.settings.capMB).toBe(300);
    expect(s.active).toBeNull();
  });
  it('migrate round-trips a valid state', () => {
    const s = defaultState();
    s.career.cash = 123;
    expect(migrate(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
  it('migrate rejects junk and future schemas', () => {
    expect(() => migrate({})).toThrow('bad-backup');
    expect(() => migrate(null)).toThrow('bad-backup');
    expect(() => migrate({ schema: 99 })).toThrow('bad-backup');
  });
  it('migrate fills missing sections with defaults', () => {
    const s = defaultState();
    delete s.settings;
    delete s.career.streak;
    const m = migrate(JSON.parse(JSON.stringify(s)));
    expect(m.settings.sound).toBe(true);
    expect(m.career.streak.count).toBe(0);
  });
});
