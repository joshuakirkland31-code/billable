// Dev-only seeded states (loaded only on localhost with ?demo=...).
import { defaultState } from './store.js';
import { RANK_THRESHOLDS } from './economy.js';
import { evaluateAchievements } from './achievements.js';
import { ensureDay } from './session.js';

export function demoState(kind, now) {
  let s = defaultState();
  if (kind === 'fresh') return ensureDay(s, now);
  const ids = ['MATH137', 'CS115', 'MATH135', 'EC120', 'BU111'];
  for (let d = 40; d >= 1; d--) {
    if (d % 6 === 0) continue;
    const t = now - d * 86400000;
    const start = new Date(t); start.setHours(9 + (d % 10), 0, 0, 0);
    const m = 20 + (d * 7) % 70;
    s.sessions.push({ id: 'd' + d, courseId: ids[d % 5], startedAt: start.getTime(), endedAt: start.getTime() + m * 60000, targetMin: 25,
      minutes: m, status: d % 9 === 0 ? 'walkedout' : 'completed', earned: d % 9 === 0 ? 0 : m * 18, fine: d % 9 === 0 ? 30 : 0, watched: true, hasTimelapse: false, starred: false });
  }
  const set = (cid, comp, idx, v) => { s.term.courses.find(c => c.id === cid).components.find(c => c.id === comp).items[idx].score = v; };
  set('MATH137', 'mid', 0, 70); for (let i = 0; i < 9; i++) set('MATH137', 'quizzes', i, 90);
  set('CS115', 'mid', 0, 88); set('CS115', 'assign', 0, 95); set('CS115', 'labq', 0, 80);
  set('MATH135', 'mid', 0, 64); for (let i = 0; i < 6; i++) set('MATH135', 'weekly', i, 75);
  set('EC120', 'mid', 0, 82); set('EC120', 'quizzes', 0, 78);
  set('BU111', 'mid', 0, 77); set('BU111', 'comm', 0, 90);
  s.term.courses.find(c => c.id === 'MATH137').finalDate = '2026-12-14';
  s.career.streak = { count: 6, best: 9, lastDay: null, pto: 1, brokenFrom: 0 };
  s.career.xp = kind === 'rich' ? RANK_THRESHOLDS[9] + 5000 : 30000;
  s.career.lifetime = s.career.xp;
  s.career.cash = kind === 'rich' ? 900000 : 12400;
  s.career.owned = { desk_basic: true, pc_laptop: true, acc_mug: true };
  s.career.equipped = { desk: 'desk_basic', computer: 'pc_laptop', deskAcc: 'acc_mug' };
  s = evaluateAchievements(s, now).state;
  return ensureDay(s, now);
}
