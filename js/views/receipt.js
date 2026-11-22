// Shared payout receipt, promotion card and achievement list.
import { h, money, fmtMin, openSheet } from '../dom.js';
import { achievementById } from '../achievements.js';
import { contractLabel } from '../contracts.js';
import { ITEMS } from '../items.js';
import { playCash, playPromo, playFail } from '../sound.js';

export function achievementList(ids) {
  if (!ids || !ids.length) return null;
  return h('div', { class: 'card gold-edge stack' },
    h('div', { class: 'label' }, 'Achievements unlocked'),
    ids.map(id => {
      const a = achievementById(id);
      const reward = ITEMS.find(i => i.achievement === id);
      return h('div', null, h('b', { class: 'gold' }, '🏆 ', a ? a.name : id),
        h('div', { class: 'small dim' }, a ? a.desc : '', reward ? ` · Unlocked ${reward.art} ${reward.name}` : ''));
    }));
}

export function showPromotion(rank) {
  playPromo();
  return new Promise(res => {
    const close = openSheet(h('div', { class: 'celebrate stack' },
      h('div', { style: { fontSize: '54px' } }, '📈'),
      h('div', { class: 'label' }, 'Promotion'),
      h('div', { class: 'rank' }, rank),
      h('p', { class: 'dim' }, 'Higher pay rate unlocked. Check the Office for new items.'),
      h('button', { class: 'btn btn-gold btn-block', onclick: () => close() }, 'LET\'S GO')),
    { center: true, onClose: res });
  });
}

/** Shows the session receipt. courseCode for labels. Returns when closed. */
export function showReceipt(receipt, { courseCode = '', recovered = false } = {}) {
  const ok = receipt.status === 'completed';
  if (ok) playCash(); else playFail();
  const title = ok ? 'Shift complete' : recovered ? 'You left the office' : receipt.status === 'failed' ? 'You left the office' : 'Walked out';
  const sub = ok ? `${fmtMin(receipt.minutes)} billed${courseCode ? ' to ' + courseCode : ''}`
    : recovered ? 'The app was closed mid-session, so it counts as leaving.'
    : receipt.status === 'failed' ? 'You were away for more than 10 seconds.' : 'You clocked out before your target.';
  return new Promise(res => {
    const close = openSheet(h('div', { class: 'stack' },
      h('div', { class: 'center' },
        h('div', { style: { fontSize: '44px' } }, ok ? '💰' : '🚪'),
        h('h2', null, title), h('div', { class: 'dim small' }, sub)),
      h('div', { class: 'card' },
        ok ? h('div', { class: 'receipt-line' }, h('span', null, 'Salary'), h('b', { class: 'gold' }, '+' + money(receipt.earned))) : null,
        (receipt.bonuses || []).map(b => h('div', { class: 'receipt-line small dim' }, h('span', null, b), h('span', null, '✓'))),
        receipt.contractCash ? h('div', { class: 'receipt-line' }, h('span', null, 'Contracts'), h('b', { class: 'green' }, '+' + money(receipt.contractCash))) : null,
        (receipt.contractsDone || []).map(id => h('div', { class: 'receipt-line small dim' }, h('span', null, '✔ ' + contractLabel(id)), h('span'))),
        receipt.fine ? h('div', { class: 'receipt-line' }, h('span', null, 'Fine (10%)'), h('b', { class: 'red' }, '−' + money(receipt.fine))) : null,
        ok && receipt.streakExtended ? h('div', { class: 'receipt-line' }, h('span', null, 'Streak'), h('b', null, '🔥 extended')) : null,
        !ok ? h('div', { class: 'receipt-line small dim' }, h('span', null, 'No pay, no streak credit'), h('span')) : null),
      achievementList(receipt.newAchievements),
      h('button', { class: 'btn btn-gold btn-block', onclick: () => close() }, ok ? 'COLLECT' : 'BACK TO WORK')),
    { center: true, onClose: async () => { if (receipt.promotedTo) await showPromotion(receipt.promotedTo); res(); } });
  });
}
