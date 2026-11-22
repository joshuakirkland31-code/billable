import { describe, it, expect } from './harness.js';
import { ITEMS, SHELLS, ALL_SLOTS } from '../js/items.js';
import { shellFor, slotsFor, canBuy, buy, equip } from '../js/office.js';
import { defaultCareer } from '../js/store.js';

const item = id => ITEMS.find(i => i.id === id);

describe('items catalog', () => {
  it('has 80+ unique items over known slots, 4+ per slot', () => {
    expect(ITEMS.length >= 80).toBe(true);
    expect(new Set(ITEMS.map(i => i.id)).size).toBe(ITEMS.length);
    for (const i of ITEMS) expect(ALL_SLOTS.includes(i.slot) || i.slot === 'none').toBe(true);
    for (const s of ALL_SLOTS) expect(ITEMS.filter(i => i.slot === s).length >= 4).toBe(true);
  });
  it('has 8+ achievement items and 2+ items per non-home city', () => {
    expect(ITEMS.filter(i => i.achievement).length >= 8).toBe(true);
    for (const c of ['Toronto', 'New York', 'London', 'Hong Kong', 'Singapore'])
      expect(ITEMS.filter(i => i.city === c).length >= 2).toBe(true);
  });
  it('tier price bands', () => {
    for (const i of ITEMS.filter(x => !x.achievement && x.slot !== 'none')) {
      if (i.tier === 'common') expect(i.price >= 2000 && i.price <= 8000).toBe(true);
      if (i.tier === 'rare') expect(i.price >= 15000 && i.price <= 60000).toBe(true);
      if (i.tier === 'legendary') expect(i.price >= 100000 && i.price <= 1000000).toBe(true);
    }
  });
});

describe('office', () => {
  it('shells by rank', () => {
    expect(shellFor(0).id).toBe('cubicle');
    expect(shellFor(3).id).toBe('shared');
    expect(shellFor(9).id).toBe('corner');
    expect(shellFor(12).id).toBe('penthouse');
    expect(slotsFor(0).includes('window')).toBe(false);
    expect(slotsFor(3).includes('window')).toBe(true);
    expect(SHELLS.length).toBe(6);
  });
  it('buy deducts cash, never xp', () => {
    const c = { ...defaultCareer(), cash: 10000, xp: 500 };
    const after = buy(c, 'desk_basic', 0);
    expect(after.cash).toBe(10000 - item('desk_basic').price);
    expect(after.xp).toBe(500);
    expect(after.owned.desk_basic).toBe(true);
  });
  it('canBuy blocks owned, rank-locked, unaffordable, achievement-only', () => {
    const c = { ...defaultCareer(), cash: 1e7, owned: { desk_basic: true } };
    expect(canBuy(c, item('desk_basic'), 0).ok).toBe(false);
    expect(canBuy(c, item('desk_marble'), 0).ok).toBe(false);
    expect(canBuy(c, item('desk_marble'), 12).ok).toBe(true);
    expect(canBuy({ ...c, cash: 0 }, item('desk_standing'), 12).ok).toBe(false);
    expect(canBuy(c, item('gold_watch'), 12).ok).toBe(false);
    expect(() => buy({ ...c, cash: 0 }, 'desk_standing', 12)).toThrow();
  });
  it('city items need that city', () => {
    const c = { ...defaultCareer(), cash: 1e7 };
    const t = ITEMS.find(i => i.city === 'Toronto');
    expect(canBuy(c, t, 12).ok).toBe(false);
    expect(canBuy({ ...c, prestige: 1 }, t, 0).ok).toBe(true);
  });
  it('equip only owned items in available slots', () => {
    const c = { ...defaultCareer(), owned: { desk_basic: true, win_park: true } };
    expect(equip(c, 'desk', 'desk_basic', 0).equipped.desk).toBe('desk_basic');
    expect(() => equip(c, 'desk', 'desk_oak', 0)).toThrow();
    expect(() => equip(c, 'window', 'win_park', 0)).toThrow();
    expect(equip(c, 'window', 'win_park', 3).equipped.window).toBe('win_park');
    expect(equip(c, 'desk', null, 0).equipped.desk).toBe(undefined);
  });
});
