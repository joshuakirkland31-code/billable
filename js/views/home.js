// Home: why, salary & rank, streak, contracts, course portfolio, clock in.
import { h, money, fmtMin, fmtPct, fmtDate, bar, openSheet } from '../dom.js';
import { progressToNext, rankIndex, streakMultiplier, cityLabel } from '../economy.js';
import { computeCourse, twelvePoint, overallAverage, neededOnFinal } from '../grades.js';
import { contractLabel } from '../contracts.js';
import { dayKey, isExamSeason, daysBetween } from '../time.js';
import { weeklyReview, markReviewed } from '../review.js';
import { shellFor } from '../office.js';
import { playCash } from '../sound.js';

let reviewShownFor = null;

export function courseRow(c, onclick) {
  const r = computeCourse(c);
  const up = r.status === 'on-track' || r.status === 'locked';
  const down = r.status === 'behind' || r.status === 'out-of-reach';
  const tp = c.school === 'laurier' && r.current !== null ? ` · ${twelvePoint(r.current).letter}` : '';
  return h('div', { class: 'li', onclick, style: { cursor: onclick ? 'pointer' : null } },
    h('span', { class: 'name' }, c.code),
    h('span', { class: (up ? 'green ticker-up' : down ? 'red ticker-down' : 'dim') }, fmtPct(r.current) + tp));
}

function nextFinal(courses, today) {
  return courses.filter(c => c.finalDate && c.finalDate >= today).sort((a, b) => a.finalDate.localeCompare(b.finalDate))[0] || null;
}

function showReview(app, review) {
  const courses = app.state.term.courses;
  const name = id => (courses.find(c => c.id === id) || { code: id === 'OTHER' ? 'Other' : id }).code;
  const close = openSheet(h('div', { class: 'stack' },
    h('div', { class: 'label' }, 'Weekly performance review'),
    h('h2', null, `Week of ${fmtDate(review.weekKey)}`),
    h('div', { class: 'grid2' },
      h('div', { class: 'card' }, h('div', { class: 'label' }, 'Billed'), h('div', { class: 'big' }, fmtMin(review.minutes))),
      h('div', { class: 'card' }, h('div', { class: 'label' }, 'Week before'), h('div', { class: 'big dim' }, fmtMin(review.prevMinutes)))),
    h('div', { class: 'card list' }, Object.entries(review.byCourse).sort((a, b) => b[1] - a[1]).map(([id, m]) =>
      h('div', { class: 'li' }, h('span', null, name(id)), h('span', { class: 'mono' }, fmtMin(m))))),
    h('p', { class: review.beat ? 'green' : 'dim' }, review.beat
      ? `You beat last week. Performance bonus: ${money(review.bonus)}.`
      : 'No bonus this time. Beat this week\'s hours next week to earn one.'),
    h('button', { class: 'btn btn-gold btn-block', onclick: () => close() }, review.beat ? 'COLLECT BONUS' : 'GOT IT')),
  { center: true, onClose: () => { if (review.bonus) playCash(); app.commit(markReviewed(app.state, review)); } });
}

export function render(root, app) {
  const s = app.state, c = s.career, now = app.now();
  const today = dayKey(new Date(now));
  const prog = progressToNext(c.xp, c.prestige);
  const ri = rankIndex(c.xp);
  const todays = s.sessions.filter(x => dayKey(new Date(x.startedAt)) === today);
  const todayEarned = todays.reduce((a, x) => a + x.earned, 0);
  const todayMin = todays.filter(x => x.status === 'completed').reduce((a, x) => a + x.minutes, 0);
  const avg = overallAverage(s.term.courses);
  const nf = nextFinal(s.term.courses, today);
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  const backupStale = !c.lastBackup || now - c.lastBackup > 7 * 86400000;
  const behindCode = c.contracts.behind && (s.term.courses.find(x => x.id === c.contracts.behind) || {}).code;

  root.append(
    h('div', { class: 'topbar' },
      h('div', null, h('div', { class: 'label' }, 'Billable'), h('div', { class: 'small dim' }, `${cityLabel(c.prestige)} · ${shellFor(ri).name}`)),
      h('a', { class: 'icon-btn', href: '#settings', 'aria-label': 'Settings' }, '⚙')),
    h('div', { class: 'home-grid' },
      isIOS && !standalone ? h('div', { class: 'card gold-edge span2 small' }, h('b', null, 'Install: '), 'tap Share ', h('b', null, '⎙'), ' then ', h('b', null, 'Add to Home Screen'), ' so it runs full-screen and keeps your data.') : null,
      h('a', { class: 'card why tap', href: '#settings', style: { textDecoration: 'none', color: 'inherit' } },
        h('div', { class: 'label' }, 'Why I grind'),
        h('ul', null, c.why.filter(Boolean).map(w => h('li', null, w)))),
      h('div', { class: 'card stack' },
        h('div', { class: 'between' }, h('span', { class: 'label' }, prog.rank), todayEarned ? h('span', { class: 'green mono small' }, `▲ +${money(todayEarned)} today`) : h('span', { class: 'dim mono small' }, 'Nothing billed today')),
        h('div', { class: 'big gold', 'aria-label': 'Cash' }, money(c.cash)),
        bar(prog.pct),
        h('div', { class: 'between small dim mono' },
          h('span', null, prog.next ? `${fmtMin(prog.minutesLeft)} to ${prog.next}` : 'Partner. Open your own firm in the Office.'),
          h('span', null, `Lifetime ${money(c.lifetime)}`))),
      h('div', { class: 'grid3' },
        h('div', { class: 'card' }, h('div', { class: 'label' }, 'Streak'), h('div', { class: 'mono', style: { fontSize: '20px', fontWeight: 800 } }, `🔥 ${c.streak.count}d`), h('div', { class: 'small gold mono' }, `×${streakMultiplier(c.streak.count).toFixed(2)} pay`)),
        h('div', { class: 'card' }, h('div', { class: 'label' }, 'Today'), h('div', { class: 'mono', style: { fontSize: '20px', fontWeight: 800 } }, fmtMin(todayMin)), h('div', { class: 'small dim mono' }, c.streak.lastDay === today ? 'streak safe ✓' : '15 min keeps it')),
        h('div', { class: 'card' }, h('div', { class: 'label' }, 'PTO'), h('div', { class: 'mono', style: { fontSize: '20px', fontWeight: 800 } }, `🏖️ ${c.streak.pto}`), h('div', { class: 'small dim mono' }, 'streak savers'))),
      h('div', { class: 'card stack' },
        h('div', { class: 'between' }, h('span', { class: 'label' }, 'Client contracts'), h('span', { class: 'mono small' }, `${c.contracts.done.length}/${c.contracts.ids.length}`)),
        h('div', { class: 'list' }, c.contracts.ids.map(id => {
          const d = c.contracts.done.includes(id);
          return h('div', { class: 'li small' }, h('span', { class: d ? 'dim' : '' }, (d ? '✔ ' : '○ ') + contractLabel(id, {}, behindCode)), d ? h('span', { class: 'green mono' }, 'PAID') : null);
        }))),
      isExamSeason(new Date(now), s) ? h('div', { class: 'card gold-edge small' }, h('b', { class: 'gold' }, 'EXAM SEASON '), 'All study pays ×1.5; your next final\'s course pays ×2.') : null,
      nf ? (() => {
        const need = neededOnFinal(nf);
        const days = daysBetween(today, nf.finalDate);
        return h('a', { class: 'card tap', href: `#marks/${nf.id}`, style: { textDecoration: 'none', color: 'inherit' } },
          h('div', { class: 'label' }, 'Next final'),
          h('div', { class: 'between' }, h('b', null, nf.code), h('span', { class: 'mono gold' }, days === 0 ? 'TODAY' : `${days} day${days === 1 ? '' : 's'}`)),
          h('div', { class: 'small dim' }, need === null || need === Infinity ? `Can't reach ${nf.target}% even with 100% on the final` : need <= 0 ? `${nf.target}% is locked in` : `Need ${need.toFixed(0)}% on the final for ${nf.target}%`));
      })() : null,
      h('div', { class: 'card portfolio' },
        h('div', { class: 'between' }, h('span', { class: 'label' }, 'Portfolio'), h('span', { class: 'mono small dim' }, 'Term avg ' + fmtPct(avg))),
        h('div', { class: 'list' }, s.term.courses.map(co => courseRow(co, () => app.go('#marks/' + co.id))))),
      backupStale && s.sessions.length ? h('a', { class: 'card small tap', href: '#settings', style: { textDecoration: 'none', color: 'inherit' } }, '💾 ', h('b', null, 'Back up your progress'), h('span', { class: 'dim' }, ' — it\'s been a while. Tap to save a copy to Files.')) : null,
      h('button', { class: 'btn btn-gold btn-xl btn-block span2 clockin', onclick: () => app.go('#session') }, '▶  CLOCK IN')));

  const review = weeklyReview(s, today);
  if (review && reviewShownFor !== review.reviewWeek) { reviewShownFor = review.reviewWeek; setTimeout(() => showReview(app, review), 300); }
}
