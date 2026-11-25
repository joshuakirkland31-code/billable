// Home: goals (your why), salary & rank, streak, contracts, course portfolio, clock in.
import { h, money, fmtMin, fmtPct, fmtDate, bar, openSheet } from '../dom.js';
import { progressToNext, rankIndex, streakMultiplier, cityLabel } from '../economy.js';
import { computeCourse, twelvePoint, overallAverage, neededOnFinal } from '../grades.js';
import { contractText } from '../contracts.js';
import { tickAndToast } from './goals.js';
import { elapsedMs } from '../session.js';
import { fmtClock } from '../dom.js';
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

function goalsCard(s) {
  const longs = s.goals.filter(g => g.tier === 'long' && !g.doneAt && !g.archived);
  const shortGoal = s.goals.find(g => g.tier === 'short' && !g.doneAt && !g.archived) || s.goals.find(g => g.tier === 'medium' && !g.doneAt && !g.archived);
  const next = shortGoal && shortGoal.steps.find(x => !x.done);
  const done = shortGoal ? shortGoal.steps.filter(x => x.done).length : 0;
  if (!s.goals.length) return h('a', { class: 'card why tap', href: '#goals', style: { textDecoration: 'none', color: 'inherit' } },
    h('div', { class: 'label' }, 'Goals'), h('div', { style: { fontWeight: 600, marginTop: '4px' } }, 'Set your first goal →'));
  return h('a', { class: 'card why tap stack', href: '#goals', style: { textDecoration: 'none', color: 'inherit' } },
    longs.length ? h('div', null, h('div', { class: 'label' }, 'Why I grind'), h('ul', null, longs.map(g => h('li', null, g.title)))) : null,
    shortGoal ? h('div', { class: 'stack', style: { gap: '6px' } },
      h('div', { class: 'between' }, h('span', { class: 'label' }, 'Now'), h('span', { class: 'mono small dim' }, `${done}/${shortGoal.steps.length}`)),
      h('b', null, shortGoal.title),
      shortGoal.steps.length ? bar((done / shortGoal.steps.length) * 100) : null,
      h('div', { class: 'small dim' }, next ? `Next: ${next.text}` : shortGoal.steps.length ? 'All steps done — complete it in Goals' : 'Add steps in Goals')) : null);
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

  root.append(
    h('div', { class: 'topbar' },
      h('div', null, h('div', { class: 'label' }, 'Billable'), h('div', { class: 'small dim' }, `${cityLabel(c.prestige)} · ${shellFor(ri).name}`)),
      h('div', { class: 'row', style: { gap: '8px' } }, h('a', { class: 'icon-btn', href: '#stats', 'aria-label': 'Stats' }, '📊'), h('a', { class: 'icon-btn', href: '#settings', 'aria-label': 'Settings' }, '⚙'))),
    h('div', { class: 'home-grid' },
      isIOS && !standalone ? h('div', { class: 'card gold-edge span2 small' }, h('b', null, 'Install: '), 'tap Share ', h('b', null, '⎙'), ' then ', h('b', null, 'Add to Home Screen'), ' so it runs full-screen and keeps your data.') : null,
      goalsCard(s),
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
        h('div', { class: 'between' }, h('span', { class: 'label' }, 'Client contracts'), h('span', { class: 'mono small' }, `${c.contracts.items.filter(i => i.done).length}/${c.contracts.items.length}`)),
        h('div', { class: 'list' }, c.contracts.items.map(it => {
          const text = contractText(it, s);
          if (it.kind === 'step') return h('div', { class: 'li small' },
            h('button', { class: 'check' + (it.done ? ' on' : ''), 'aria-label': it.done ? 'Mark not done' : 'Mark done', onclick: () => tickAndToast(app, it.ref.goalId, it.ref.stepId, !it.done) }, it.done ? '✓' : ''),
            h('span', { class: 'grow' + (it.done ? ' dim' : '') }, text), h('span', { class: 'pill small' }, 'STEP'));
          return h('div', { class: 'li small' }, h('span', { class: it.done ? 'dim' : '' }, (it.done ? '✔ ' : '○ ') + text), it.done ? h('span', { class: 'green mono' }, 'PAID') : null);
        })),
        c.contracts.items.some(i => i.kind === 'step') ? null : h('a', { href: '#goals', class: 'small' }, 'Add goal steps to turn them into contracts →')),
      isExamSeason(new Date(now), s) ? h('div', { class: 'card gold-edge small' }, h('b', { class: 'gold' }, 'EXAM SEASON '), 'All study pays ×1.5; your next final\'s course pays ×2.') : null,
      nf ? (() => {
        const need = neededOnFinal(nf);
        const days = daysBetween(today, nf.finalDate);
        return h('a', { class: 'card tap', href: `#school/${nf.id}`, style: { textDecoration: 'none', color: 'inherit' } },
          h('div', { class: 'label' }, 'Next final'),
          h('div', { class: 'between' }, h('b', null, nf.code), h('span', { class: 'mono gold' }, days === 0 ? 'TODAY' : `${days} day${days === 1 ? '' : 's'}`)),
          h('div', { class: 'small dim' }, need === null || need === Infinity ? `Can't reach ${nf.target}% even with 100% on the final` : need <= 0 ? `${nf.target}% is locked in` : `Need ${need.toFixed(0)}% on the final for ${nf.target}%`));
      })() : null,
      h('div', { class: 'card portfolio' },
        h('div', { class: 'between' }, h('span', { class: 'label' }, 'Portfolio'), h('span', { class: 'mono small dim' }, 'Term avg ' + fmtPct(avg))),
        h('div', { class: 'list' }, s.term.courses.map(co => courseRow(co, () => app.go('#school/' + co.id))))),
      backupStale && s.sessions.length ? h('a', { class: 'card small tap', href: '#settings', style: { textDecoration: 'none', color: 'inherit' } }, '💾 ', h('b', null, 'Back up your progress'), h('span', { class: 'dim' }, ' — it\'s been a while. Tap to save a copy to Files.')) : null,
      s.active
        ? h('button', { class: 'btn btn-gold btn-xl btn-block span2 clockin', onclick: () => app.go('#session') }, `● RESUME  ${fmtClock(elapsedMs(s.active, now))}`)
        : h('button', { class: 'btn btn-gold btn-xl btn-block span2 clockin', onclick: () => app.go('#session') }, '▶  CLOCK IN')));

  const review = weeklyReview(s, today);
  if (review && reviewShownFor !== review.reviewWeek) { reviewShownFor = review.reviewWeek; setTimeout(() => showReview(app, review), 300); }
}
