import { describe, it, expect } from './harness.js';
import { defaultState, migrate, SCHEMA, needsSafetyCopy } from '../js/store.js';

function v1Save() {
  const s = defaultState();
  s.schema = 1;
  s.career.why = ['Make money', 'Get a good job', 'Happy with grades'];
  delete s.goals; delete s.events; delete s.pastTerms; delete s.study;
  delete s.career.stepPay; delete s.career.todaySteps;
  s.settings = { sound: false, capMB: 300 };
  s.career.contracts = { day: '2026-11-20', ids: ['two_courses'], done: [], allPaid: false, behind: null };
  s.career.owned = { desk_basic: true };
  s.term.courses.find(c => c.id === 'MATH137').components.find(c => c.id === 'mid').items[0].score = 70;
  s.sessions = [
    { id: 'a', courseId: 'MATH137', startedAt: 1, endedAt: 2, targetMin: 25, minutes: 25, status: 'completed', earned: 250, fine: 0, watched: true, hasTimelapse: true, starred: false },
    { id: 'b', courseId: 'CS115', startedAt: 3, endedAt: 4, targetMin: 50, minutes: 5, status: 'walkedout', earned: 0, fine: 55, watched: true, hasTimelapse: false, starred: false },
  ];
  return JSON.parse(JSON.stringify(s));
}

describe('store v2', () => {
  it('default state is schema 2 with goals, events, past terms and study', () => {
    const s = defaultState();
    expect(SCHEMA).toBe(2);
    expect(s.schema).toBe(2);
    expect(s.goals).toEqual([]);
    expect(s.events).toEqual([]);
    expect(s.pastTerms).toEqual([]);
    expect(s.study).toEqual({ mistakes: [], quizzes: [], attempts: [], plans: [] });
    expect(s.settings.weekStart).toBe('sun');
    expect(s.career.why).toBe(undefined);
    expect(s.career.stepPay).toEqual({ day: null, count: 0 });
    expect(s.active).toBeNull();
  });
  it('migrate round-trips a v2 state', () => {
    const s = defaultState(); s.career.cash = 123;
    expect(migrate(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
  it('migrates a full v1 save', () => {
    const m = migrate(v1Save());
    expect(m.schema).toBe(2);
    expect(m.goals.map(g => g.title)).toEqual(['Make money', 'Get a good job', 'Happy with grades']);
    expect(m.goals.every(g => g.tier === 'long' && g.steps.length === 0)).toBe(true);
    expect(m.sessions.length).toBe(2);
    expect(m.sessions[1].status).toBe('walkedout');
    expect(m.career.owned.desk_basic).toBe(true);
    expect(m.term.courses.find(c => c.id === 'MATH137').components.find(c => c.id === 'mid').items[0].score).toBe(70);
    expect(m.settings.capMB).toBe(undefined);
    expect(m.settings.sound).toBe(false);
    expect(m.career.why).toBe(undefined);
    expect(m.career.contracts.items).toEqual([]);
    expect(m.career.contracts.day).toBeNull();
  });
  it('safety copy only for v1 records', () => {
    expect(needsSafetyCopy({ schema: 1 })).toBe(true);
    expect(needsSafetyCopy({ schema: 2 })).toBe(false);
    expect(needsSafetyCopy(undefined)).toBe(false);
  });
  it('rejects junk and future schemas', () => {
    expect(() => migrate({})).toThrow('bad-backup');
    expect(() => migrate(null)).toThrow('bad-backup');
    expect(() => migrate({ schema: 3 })).toThrow('bad-backup');
  });
});
