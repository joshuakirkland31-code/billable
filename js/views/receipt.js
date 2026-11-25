// Shared payout receipt, promotion card and achievement list.
import { h, money, fmtMin, openSheet } from '../dom.js';
import { achievementById } from '../achievements.js';
import { contractText } from '../contracts.js';
import { ITEMS } from '../items.js';
import { playCash, playPromo } from '../sound.js';

const END_TEXT = {
  clockout: null,
  left: 'Ended when you left the app.',
  idle: 'Ended at your last tap (no answer to "Still studying?").',
  recovered: 'The app closed — saved up to when it was last open.',
};

export function achievementList(ids, state = null) {
  if (!ids || !ids.length) return null;
  return h('div', { class: 'card gold-edge stack' },
    h('div', { class: 'label' }, 'Achievements unlocked'),
    ids.map(id => {
      const a = achievementById(id, state);
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

/** Shows the session receipt. Returns when closed (and after any promotion card). */
export function showReceipt(receipt, { app = null, courseCode = '' } = {}) {
  const state = app && app.state;
  if (receipt.discarded) {
    return new Promise(res => {
      const close = openSheet(h('div', { class: 'stack center' },
        h('div', { style: { fontSize: '40px' } }, '⏱'),
        h('h2', null, 'Not saved'),
        h('p', { class: 'dim' }, `That session was ${fmtMin(receipt.minutes)} — under 5 minutes isn't saved.`),
        h('button', { class: 'btn btn-gold btn-block', onclick: () => close() }, 'OK')), { center: true, onClose: res });
    });
  }
  playCash();
  const step = receipt.stepId && state && state.goals.flatMap(g => g.steps.map(st => ({ g, st }))).find(x => x.st.id === receipt.stepId);
  const stepBtn = step && !step.st.done ? h('button', { class: 'btn btn-block', onclick: async () => {
    stepBtn.disabled = true; stepBtn.textContent = '✓ Step marked done';
    const { tickAndToast } = await import('./goals.js');
    await tickAndToast(app, step.g.id, step.st.id, true);
  } }, `☐  Mark "${step.st.text}" done`) : null;
  return new Promise(res => {
    const close = openSheet(h('div', { class: 'stack' },
      h('div', { class: 'center' },
        h('div', { style: { fontSize: '44px' } }, receipt.goalHit ? '🎯' : '💰'),
        h('h2', null, receipt.goalHit ? 'Goal hit — shift complete' : 'Shift complete'),
        h('div', { class: 'dim small' }, `${fmtMin(receipt.minutes)} billed${courseCode ? ' to ' + courseCode : ''}`),
        END_TEXT[receipt.endReason] ? h('div', { class: 'small gold', style: { marginTop: '4px' } }, END_TEXT[receipt.endReason]) : null),
      h('div', { class: 'card' },
        h('div', { class: 'receipt-line' }, h('span', null, 'Salary'), h('b', { class: 'gold' }, '+' + money(receipt.earned))),
        (receipt.bonuses || []).map(b => h('div', { class: 'receipt-line small dim' }, h('span', null, b), h('span', null, '✓'))),
        receipt.contractCash ? h('div', { class: 'receipt-line' }, h('span', null, 'Contracts'), h('b', { class: 'green' }, '+' + money(receipt.contractCash))) : null,
        state ? (receipt.contractsDone || []).filter(k => k.startsWith('rand:')).map(k => h('div', { class: 'receipt-line small dim' }, h('span', null, '✔ ' + contractText({ kind: 'random', ref: k.slice(5) }, state)), h('span'))) : null,
        receipt.streakExtended ? h('div', { class: 'receipt-line' }, h('span', null, 'Streak'), h('b', null, '🔥 extended')) : null),
      achievementList(receipt.newAchievements, state),
      stepBtn,
      h('button', { class: 'btn btn-gold btn-block', onclick: () => close() }, 'COLLECT')),
    { center: true, onClose: async () => { if (receipt.promotedTo) await showPromotion(receipt.promotedTo); res(); } });
  });
}
