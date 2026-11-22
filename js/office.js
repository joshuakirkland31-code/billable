// Office logic (buy/equip) and SVG rendering.
import { SHELLS, ITEMS, itemById, SLOT_NAMES } from './items.js';
import { RANKS, CITIES, rateFor } from './economy.js';
import { PTO_MAX, PTO_PRICE_MIN } from './streak.js';

export function shellFor(rankIdx) {
  return [...SHELLS].reverse().find(s => rankIdx >= s.minRank);
}

export function slotsFor(rankIdx) {
  return SHELLS.filter(s => rankIdx >= s.minRank).flatMap(s => s.slots);
}

export function priceOf(item, career, rankIdx) {
  return item.id === 'pto' ? Math.round(PTO_PRICE_MIN * rateFor(rankIdx, career.prestige)) : item.price;
}

export function canBuy(career, item, rankIdx) {
  if (!item) return { ok: false, reason: 'Unknown item' };
  if (item.id === 'pto') {
    if (career.streak.pto >= PTO_MAX) return { ok: false, reason: `Max ${PTO_MAX} held` };
  } else if (career.owned[item.id]) return { ok: false, reason: 'Owned' };
  if (item.achievement) return { ok: false, reason: 'Achievement reward' };
  if (item.city && (career.prestige || 0) < CITIES.indexOf(item.city)) return { ok: false, reason: `Open a firm in ${item.city}` };
  if (rankIdx < item.minRank) return { ok: false, reason: `Reach ${RANKS[item.minRank].name}` };
  if (career.cash < priceOf(item, career, rankIdx)) return { ok: false, reason: 'Not enough cash' };
  return { ok: true, reason: '' };
}

export function buy(career, itemId, rankIdx) {
  const item = itemById(itemId);
  const chk = canBuy(career, item, rankIdx);
  if (!chk.ok) throw new Error(chk.reason);
  const c = { ...career, cash: career.cash - priceOf(item, career, rankIdx) };
  if (item.id === 'pto') c.streak = { ...career.streak, pto: career.streak.pto + 1 };
  else c.owned = { ...career.owned, [item.id]: true };
  return c;
}

export function equip(career, slot, itemId, rankIdx) {
  if (!slotsFor(rankIdx).includes(slot)) throw new Error('Slot not available yet');
  const eq = { ...career.equipped };
  if (itemId === null) { delete eq[slot]; return { ...career, equipped: eq }; }
  const item = itemById(itemId);
  if (!item || item.slot !== slot || !career.owned[itemId]) throw new Error('Not owned');
  eq[slot] = itemId;
  return { ...career, equipped: eq };
}

export function ownedForSlot(career, slot) {
  return ITEMS.filter(i => i.slot === slot && career.owned[i.id]);
}

// ---- Rendering ----
const POS = {
  window: [70, 42, 34], wall1: [180, 40, 30], wall2: [262, 40, 30], art: [300, 40, 26],
  shelf: [318, 88, 26], desk: [180, 150, 44], computer: [180, 112, 30], deskAcc: [222, 120, 20],
  chair: [180, 192, 30], floorL: [34, 170, 34], floorR: [326, 170, 30], rug: [120, 205, 28],
  pet: [250, 200, 26], lounge: [66, 120, 28], bar: [300, 130, 26], sculpture: [110, 120, 26], car: [30, 112, 24],
};
const SHELL_BG = {
  cubicle: ['#1a2230', '#2a3446'], shared: ['#172033', '#2b3a52'], own: ['#1b1f2e', '#3a3226'],
  corner: ['#14202e', '#3b2f1d'], floor: ['#121c2b', '#40321b'], penthouse: ['#0f1624', '#4a3a16'],
};

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, text) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
};

/** Returns an SVG of the office. onSlot(slot) is called when a slot is tapped. */
export function renderOffice(career, rankIdx, onSlot) {
  const shell = shellFor(rankIdx);
  const [wall, floor] = SHELL_BG[shell.id];
  const svg = el('svg', { viewBox: '0 0 360 230', class: 'office-svg', role: 'img', 'aria-label': `${shell.name} office` });
  svg.append(el('rect', { x: 0, y: 0, width: 360, height: 150, fill: wall }));
  svg.append(el('rect', { x: 0, y: 150, width: 360, height: 80, fill: floor }));
  svg.append(el('line', { x1: 0, y1: 150, x2: 360, y2: 150, stroke: '#f5c451', 'stroke-opacity': .25 }));
  // wall panels, baseboard, ceiling lights, floor boards
  for (let x = 0; x <= 360; x += 60) svg.append(el('line', { x1: x, y1: 0, x2: x, y2: 150, stroke: '#ffffff', 'stroke-opacity': .03 }));
  svg.append(el('rect', { x: 0, y: 144, width: 360, height: 6, fill: '#000', 'fill-opacity': .25 }));
  for (const lx of [90, 270]) svg.append(el('rect', { x: lx - 30, y: 0, width: 60, height: 4, rx: 2, fill: '#ffdf8a', 'fill-opacity': .35 }));
  for (let x = -40; x <= 400; x += 50) svg.append(el('line', { x1: 180 + (x - 180) * .55, y1: 150, x2: x, y2: 230, stroke: '#000', 'stroke-opacity': .18 }));
  if (shell.id === 'cubicle') {
    svg.append(el('rect', { x: 110, y: 20, width: 140, height: 130, fill: 'none', stroke: '#3a475c', 'stroke-width': 3 }));
  }
  for (const slot of slotsFor(rankIdx)) {
    const [x, y, size] = POS[slot] || [180, 120, 24];
    const g = el('g', { class: 'slot', 'data-slot': slot, tabindex: 0, role: 'button', 'aria-label': SLOT_NAMES[slot] });
    const id = career.equipped[slot];
    const item = id && itemById(id);
    if (item) {
      g.append(el('text', { x, y, 'font-size': size, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, item.art));
    } else {
      g.append(el('rect', { x: x - size / 2, y: y - size / 2, width: size, height: size, rx: 6, fill: 'none',
        stroke: '#7d8a9c', 'stroke-dasharray': '4 3', 'stroke-opacity': .7 }));
      g.append(el('text', { x, y, 'font-size': size * .5, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: '#7d8a9c' }, '+'));
    }
    g.append(el('rect', { x: x - size / 2 - 4, y: y - size / 2 - 4, width: size + 8, height: size + 8, fill: 'transparent' }));
    if (onSlot) {
      g.addEventListener('click', () => onSlot(slot));
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') onSlot(slot); });
    }
    svg.append(g);
  }
  return svg;
}
