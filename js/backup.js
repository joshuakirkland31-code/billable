// Backup to a JSON file (everything except time-lapse frames) and restore.
import { migrate } from './store.js';

export function exportBackup(state, now = new Date()) {
  const body = JSON.stringify({ app: 'billable', exportedAt: now.getTime(), state });
  const pad = n => String(n).padStart(2, '0');
  const cal = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`; // calendar date, not study day
  return new File([body], `billable-backup-${cal}.json`, { type: 'application/json' });
}

export function parseBackup(text) {
  let obj;
  try { obj = JSON.parse(text); } catch { throw new Error('bad-backup'); }
  if (!obj || obj.app !== 'billable' || !obj.state) throw new Error('bad-backup');
  return migrate(obj.state);
}

export async function shareBackup(state) {
  const file = exportBackup(state);
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Billable backup' }); return true; }
    catch (e) { if (e && e.name === 'AbortError') return false; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = file.name;
  document.body.append(a); a.click(); a.remove();
  return true;
}
