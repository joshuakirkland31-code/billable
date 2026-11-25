// Settings: targets, sound, week start, backup/restore, reset.
import { h, toast, confirmSheet } from '../dom.js';
import { shareBackup, parseBackup } from '../backup.js';
import { defaultState } from '../store.js';
import { ensureDay } from '../session.js';

const clone = o => JSON.parse(JSON.stringify(o));

export function render(root, app) {
  const s = app.state;
  const set = mut => { const st = clone(app.state); mut(st); app.commit(st); };
  const fileIn = h('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' }, onchange: async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    let next;
    try { next = parseBackup(await f.text()); }
    catch { toast('That file isn\'t a Billable backup — nothing changed', { bad: true, ms: 4000 }); return; }
    const ok = await confirmSheet('Restore this backup?', `It has ${next.sessions.length} sessions. Your current progress on this phone will be replaced.`, 'Restore', { danger: true });
    if (!ok) return;
    next.active = null;
    await app.commit(ensureDay(next, app.now()));
    toast('Backup restored');
  } });

  root.append(h('div', { class: 'stack' },
    h('div', { class: 'topbar' }, h('a', { class: 'icon-btn', href: '#home', 'aria-label': 'Back' }, '‹'), h('h1', { style: { margin: 0 } }, 'Settings'), h('span', { style: { width: '44px' } })),
    h('div', { class: 'card stack' },
      h('div', { class: 'label' }, 'Course targets'),
      h('div', { class: 'list' }, s.term.courses.map((c, i) => h('div', { class: 'li' }, h('span', null, c.code),
        h('input', { class: 'input score', type: 'number', inputmode: 'decimal', min: 0, max: 100, value: c.target, 'aria-label': `${c.code} target`,
          onchange: e => { const t = e.target.value.trim(), v = Number(t); if (t !== '' && v >= 0 && v <= 100) set(st => { st.term.courses[i].target = v; }); else { e.target.value = c.target; toast('Target must be 0–100', { bad: true }); } } }))))),
    h('div', { class: 'card stack' },
      h('div', { class: 'between' }, h('span', null, 'Sounds'), h('button', { class: 'chip', 'aria-pressed': String(s.settings.sound), onclick: () => set(st => { st.settings.sound = !st.settings.sound; }) }, s.settings.sound ? 'On' : 'Off')),
      h('div', { class: 'between' }, h('span', null, 'Week starts on'), h('div', { class: 'chips' }, [['sun', 'Sunday'], ['mon', 'Monday']].map(([v, l]) =>
        h('button', { class: 'chip', 'aria-pressed': String(s.settings.weekStart === v), onclick: () => set(st => { st.settings.weekStart = v; }) }, l))))),
    h('div', { class: 'card stack' },
      h('div', { class: 'label' }, 'Backup'),
      h('div', { class: 'small dim' }, s.career.lastBackup ? `Last backup ${new Date(s.career.lastBackup).toLocaleString()}` : 'No backup yet.', ' Backups include everything: goals, sessions, marks and your office.'),
      h('div', { class: 'grid2' },
        h('button', { class: 'btn btn-gold', onclick: async () => {
          const ok = await shareBackup(app.state);
          if (ok) { set(st => { st.career.lastBackup = app.now(); }); toast('Backup saved'); }
        } }, '💾 BACK UP'),
        h('button', { class: 'btn', onclick: () => fileIn.click() }, 'Restore…')),
      fileIn),
    h('div', { class: 'card stack' },
      h('div', { class: 'label' }, 'Danger zone'),
      h('button', { class: 'btn btn-red', onclick: async () => {
        if (!(await confirmSheet('Reset everything?', 'All sessions, marks, cash, rank and office items on this phone will be erased.', 'Reset', { danger: true }))) return;
        if (!(await confirmSheet('Really reset?', 'This cannot be undone. Make a backup first if you might want it.', 'Erase it all', { danger: true }))) return;
        await app.commit(ensureDay(defaultState(), app.now()));
        toast('Fresh start');
        app.go('#home');
      } }, 'Reset all data')),
    h('div', { class: 'small dim center' }, 'Billable · all data stays on this phone.')));
}
