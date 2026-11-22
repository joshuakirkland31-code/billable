// Entering marks: updates the course and pays filing / beat-target bonuses once per item.
import { rankIndex, rateFor } from './economy.js';
import { evaluateAchievements } from './achievements.js';

export const FILING_MIN = 2, BEAT_MIN = 10;

export function fileMark(state, courseId, itemId, score, now) {
  const s = JSON.parse(JSON.stringify(state));
  const course = s.term.courses.find(c => c.id === courseId);
  const item = course && course.components.flatMap(c => c.items).find(i => i.id === itemId);
  if (!item) throw new Error('Unknown assessment');
  item.score = score;
  const c = s.career;
  const rate = rateFor(rankIndex(c.xp), c.prestige);
  const key = `${courseId}:${itemId}`;
  const receipt = { filing: 0, beat: 0, newAchievements: [] };
  if (score !== null && score !== undefined) {
    if (!c.filedMarks[key]) { c.filedMarks[key] = true; receipt.filing = Math.round(FILING_MIN * rate); }
    if (score >= course.target && !c.beatMarks[key]) { c.beatMarks[key] = true; receipt.beat = Math.round(BEAT_MIN * rate); }
  }
  c.cash += receipt.filing + receipt.beat;
  const ach = evaluateAchievements(s, now);
  receipt.newAchievements = ach.newly;
  return { state: ach.state, receipt };
}
