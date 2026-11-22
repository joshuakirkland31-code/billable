import { describe, it, expect } from './harness.js';
import { planPurge, wouldExceedCap, RETENTION_MS, saveFrame, loadFrames, saveMeta, deleteTimelapse, listMeta } from '../js/timelapse.js';

const DAY = 86400000;
const now = new Date(2026, 10, 22, 12).getTime();
const meta = (id, ageDays, bytes, starred = false) => ({ sessionId: id, createdAt: now - ageDays * DAY, bytes, frames: 1, starred });

describe('timelapse purge planning', () => {
  it('retention is 7 days', () => { expect(RETENTION_MS).toBe(7 * DAY); });
  it('deletes old unstarred, keeps starred and recent', () => {
    const ids = planPurge([meta('old', 8, 10), meta('star', 8, 10, true), meta('new', 6, 10)], now, 1e9);
    expect(ids).toEqual(['old']);
  });
  it('enforces the cap oldest-first', () => {
    expect(planPurge([meta('a', 3, 60), meta('b', 1, 60)], now, 100)).toEqual(['a']);
  });
  it('never deletes starred even over cap', () => {
    expect(planPurge([meta('s', 3, 200, true), meta('b', 1, 60)], now, 100)).toEqual(['b']);
  });
  it('wouldExceedCap counts starred only', () => {
    expect(wouldExceedCap([meta('s', 1, 80, true), meta('t', 1, 30, true), meta('u', 1, 500)], 100)).toBe(true);
    expect(wouldExceedCap([meta('s', 1, 80, true), meta('u', 1, 500)], 100)).toBe(false);
  });
});

describe('timelapse storage', () => {
  it('saves, loads and deletes frames', async () => {
    const id = 'test-' + Math.random();
    for (let i = 0; i < 3; i++) await saveFrame(id, i, new Blob(['f' + i], { type: 'image/jpeg' }));
    await saveMeta({ sessionId: id, createdAt: now, bytes: 6, frames: 3, starred: false });
    const frames = await loadFrames(id);
    expect(frames.length).toBe(3);
    expect(await frames[2].text()).toBe('f2');
    expect((await listMeta()).some(m => m.sessionId === id)).toBe(true);
    await deleteTimelapse(id);
    expect((await loadFrames(id)).length).toBe(0);
    expect((await listMeta()).some(m => m.sessionId === id)).toBe(false);
  });
});
