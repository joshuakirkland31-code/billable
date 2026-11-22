// Office: the scene, slot editing, the shop, PTO and "start your own firm".
import { h, money, toast, openSheet, confirmSheet } from '../dom.js';
import { ITEMS, SLOT_NAMES, itemById, SHELLS } from '../items.js';
import { shellFor, slotsFor, canBuy, buy, equip, ownedForSlot, renderOffice, priceOf } from '../office.js';
import { rankIndex, RANKS, canPrestige, doPrestige, cityLabel, cityFor, CITIES } from '../economy.js';
import { evaluateAchievements } from '../achievements.js';
import { playCash, playPromo } from '../sound.js';

const filter = { slot: 'all', tier: 'all' };

function withCareer(app, fn) {
  const st = JSON.parse(JSON.stringify(app.state));
  st.career = fn(st.career);
  return st;
}

function slotSheet(app, slot) {
  const s = app.state, ri = rankIndex(s.career.xp);
  const owned = ownedForSlot(s.career, slot);
  const close = openSheet(h('div', { class: 'stack' },
    h('div', { class: 'label' }, SLOT_NAMES[slot]),
    owned.length ? h('div', { class: 'shop-grid' }, owned.map(it =>
      h('button', { class: `item ${it.tier}`, 'aria-pressed': String(s.career.equipped[slot] === it.id), style: { cursor: 'pointer', textAlign: 'left' },
        onclick: () => { app.commit(withCareer(app, c => equip(c, slot, it.id, ri))); close(); } },
        h('div', { class: 'art' }, it.art), h('b', { class: 'small' }, it.name),
        s.career.equipped[slot] === it.id ? h('span', { class: 'tier legendary' }, 'Placed') : h('span', { class: 'tier common' }, 'Tap to place'))))
      : h('p', { class: 'dim' }, 'You don\'t own anything for this spot yet.'),
    h('div', { class: 'grid2' },
      s.career.equipped[slot] ? h('button', { class: 'btn', onclick: () => { app.commit(withCareer(app, c => equip(c, slot, null, ri))); close(); } }, 'Clear spot') : h('span'),
      h('button', { class: 'btn btn-gold', onclick: () => { filter.slot = slot; filter.tier = 'all'; close(); app.render(); setTimeout(() => document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' }), 50); } }, 'SHOP THIS SPOT'))));
}

async function doBuy(app, it) {
  const ri = rankIndex(app.state.career.xp);
  const price = priceOf(it, app.state.career, ri);
  const ok = await confirmSheet(`Buy ${it.name}?`, `${it.art}  ${money(price)} from your cash. Your rank isn't affected.`, 'Buy');
  if (!ok) return;
  try {
    let st = withCareer(app, c => buy(c, it.id, ri));
    const slots = slotsFor(ri);
    if (it.slot !== 'none' && slots.includes(it.slot) && !st.career.equipped[it.slot]) st.career = equip(st.career, it.slot, it.id, ri);
    const ach = evaluateAchievements(st, app.now());
    playCash();
    await app.commit(ach.state);
    toast(it.id === 'pto' ? '🏖️ PTO day banked' : `${it.art} ${it.name} is yours`);
    for (const a of ach.newly) toast('🏆 Achievement unlocked');
  } catch (e) { toast(e.message, { bad: true }); }
}

async function prestige(app) {
  const next = cityFor((app.state.career.prestige || 0) + 1);
  const ok = await confirmSheet('Start your own firm?', `You'll open a firm in ${next}. Your rank resets to Analyst I, and you keep all your cash, items, trophies and stats. You also get a permanent +10% pay. City-exclusive items unlock.`, 'Open the firm');
  if (!ok) return;
  const ok2 = await confirmSheet('Are you sure?', 'Your rank goes back to Analyst I. This can\'t be undone.', `Move to ${next}`);
  if (!ok2) return;
  let st = withCareer(app, c => doPrestige(c));
  st = evaluateAchievements(st, app.now()).state;
  playPromo();
  await app.commit(st);
  toast(`🏙️ Welcome to ${next}`);
}

export function render(root, app) {
  const s = app.state, c = s.career, ri = rankIndex(c.xp);
  const shell = shellFor(ri);
  const nextShell = SHELLS.find(x => x.minRank > ri);
  const available = slotsFor(ri);
  const slotChoices = ['all', ...new Set(ITEMS.map(i => i.slot))];
  const items = ITEMS.filter(i => (filter.slot === 'all' || i.slot === filter.slot) && (filter.tier === 'all' || i.tier === filter.tier))
    .sort((a, b) => (a.slot === 'none' ? -1 : 0) - (b.slot === 'none' ? -1 : 0) || (canBuy(c, b, ri).ok - canBuy(c, a, ri).ok) || a.price - b.price);

  root.append(h('div', { class: 'stack' },
    h('div', { class: 'topbar' },
      h('div', null, h('h1', { style: { marginBottom: 0 } }, shell.name), h('div', { class: 'small dim' }, `${cityLabel(c.prestige)} · ${RANKS[ri].name}`)),
      h('div', { class: 'right' }, h('div', { class: 'label' }, 'Cash'), h('div', { class: 'gold mono', style: { fontWeight: 800, fontSize: '18px' } }, money(c.cash)))),
    h('div', { class: 'office-wrap' }, renderOffice(c, ri, slot => slotSheet(app, slot))),
    h('div', { class: 'small dim center' }, 'Tap a spot to place items. ', nextShell ? `Bigger office (${nextShell.name}) at ${RANKS[nextShell.minRank].name}.` : 'You have the penthouse.'),
    canPrestige(c) ? h('div', { class: 'card gold-edge stack' },
      h('b', { class: 'gold' }, '🏙️ Start your own firm'),
      h('div', { class: 'small' }, `You've made Partner. Open a firm in ${cityFor((c.prestige || 0) + 1)} for a permanent +10% pay and new city items.`),
      h('button', { class: 'btn btn-gold', onclick: () => prestige(app) }, 'OPEN THE FIRM')) : null,
    h('div', { id: 'shop', class: 'stack' },
      h('h2', null, 'Shop'),
      h('div', { class: 'chips scroll' }, slotChoices.map(sl => h('button', { class: 'chip', 'aria-pressed': String(filter.slot === sl),
        onclick: () => { filter.slot = sl; app.render(); } }, sl === 'all' ? 'All' : sl === 'none' ? 'PTO' : SLOT_NAMES[sl]))),
      h('div', { class: 'chips' }, ['all', 'common', 'rare', 'legendary'].map(t => h('button', { class: 'chip', 'aria-pressed': String(filter.tier === t),
        onclick: () => { filter.tier = t; app.render(); } }, t === 'all' ? 'Any tier' : t[0].toUpperCase() + t.slice(1)))),
      h('div', { class: 'shop-grid' }, items.map(it => {
        const chk = canBuy(c, it, ri);
        const owned = c.owned[it.id];
        const price = priceOf(it, c, ri);
        return h('div', { class: `item ${it.tier}` },
          h('div', { class: 'between' }, h('div', { class: 'art' }, it.art), h('span', { class: `tier ${it.tier}` }, it.tier)),
          h('b', { class: 'small' }, it.name),
          h('div', { class: 'small dim' }, it.slot === 'none' ? `Hold ${c.streak.pto}/2` : SLOT_NAMES[it.slot] + (available.includes(it.slot) ? '' : ' · later')),
          owned ? h('span', { class: 'pill green' }, 'OWNED')
            : it.achievement ? h('span', { class: 'pill gold small' }, '🏆 Achievement')
            : h('button', { class: 'btn ' + (chk.ok ? 'btn-gold' : ''), disabled: !chk.ok, onclick: () => doBuy(app, it) }, chk.ok ? money(price) : chk.reason === 'Not enough cash' ? money(price) : chk.reason));
      })))));
}
