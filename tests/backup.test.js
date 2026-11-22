import { describe, it, expect } from './harness.js';
import { exportBackup, parseBackup } from '../js/backup.js';
import { defaultState } from '../js/store.js';

describe('backup', () => {
  it('round trips', async () => {
    const s = defaultState();
    s.career.cash = 4242;
    s.sessions.push({ id: 'a', courseId: 'CS115', startedAt: 1, endedAt: 2, targetMin: 25, minutes: 25, status: 'completed', earned: 250, fine: 0, watched: true, hasTimelapse: false, starred: false });
    const f = exportBackup(s, new Date(2026, 10, 22));
    expect(f.name).toBe('billable-backup-2026-11-22.json');
    expect(parseBackup(await f.text())).toEqual(s);
  });
  it('rejects junk, wrong app, future schema', () => {
    expect(() => parseBackup('not json')).toThrow('bad-backup');
    expect(() => parseBackup(JSON.stringify({ app: 'other', state: defaultState() }))).toThrow('bad-backup');
    const fut = defaultState(); fut.schema = 99;
    expect(() => parseBackup(JSON.stringify({ app: 'billable', state: fut }))).toThrow('bad-backup');
    expect(() => parseBackup(JSON.stringify({ app: 'billable' }))).toThrow('bad-backup');
  });
});
