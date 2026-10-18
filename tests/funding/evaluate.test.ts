import { describe, expect, it } from 'vitest';
import { evaluate, type Personalised } from '../../src/lib/funding/evaluate';
import { methodById } from '../../src/lib/funding/methods';
import type { FundingMethod } from '../../src/lib/funding/types';
import { tradeRestriction } from '../../src/lib/tradeRestriction';
import { ctxOf, fakePrices, fakeSnap } from './helpers';

const steel = methodById('smelt-steel-bars')!;
const hill = methodById('hill-giants')!;
const IRON = { buy: 77, volume: 267250, limit: 13000 };
const COAL = { buy: 141, volume: 1449102, limit: 13000 };
const BAR = { sell: 522, volume: 294067 };
const steelPrices = () => fakePrices({ 'Iron ore': IRON, Coal: COAL, 'Steel bar': BAR });
const smither = { levels: { smithing: 40 }, position: { x: 3093, y: 3495, plane: 0 } };

describe('economics worked by hand: smelting steel bars', () => {
  // A bar sells for 522 (tax floor(522 x 2%) = 10, so 512 net) and costs 77 + 2 x 141 = 359 of ore and coal: 153 clear a bar.
  // A bag of 28 holds 9 sets (1 ore + 2 coal = 3 slots), so a trip makes 9 bars. The published pace is 775 an hour; typical is 80% = 620, one bar in 5.806 s.
  // A trip adds 10 s at the bank. The exchange is 72 tiles from the bank and 56 from the furnace: (72 + 56) / (2 / 0.6) = 38.4 s walking plus 60 s at
  // the counter = 98.4 s per sale, one sale per 4 trips = 36 bars: 2.733 s a bar.  3600 / (5.806 + 1.111 + 2.733) = 373.0 bars an hour.
  it('a bar clears 153 coins and the hour pays about 57,000 at the typical pace', () => {
    const e = evaluate(steel, ctxOf({ prices: steelPrices(), snap: fakeSnap(smither), cash: 5000 }));
    expect(e.blockers).toEqual([]);
    expect(e.perUnit.net).toBe(153);
    expect(e.perUnit.tax).toBe(10);
    expect(e.unitsPerTrip).toBe(9);
    expect(e.unitsPerHour.typical).toBeCloseTo(3600 / (3600 / 620 + 10 / 9 + 98.4 / 36), 2);
    expect(e.unitsPerHour.typical).toBeGreaterThan(372);
    expect(e.unitsPerHour.typical).toBeLessThan(374);
    expect(e.netPerHour.typical).toBeGreaterThan(153 * 372);
    expect(e.netPerHour.typical).toBeLessThan(153 * 374);
    // fast <= typical <= slow in time; the slow case is also priced with a haircut only when the quote is not HIGH confidence.
    expect(e.netPerHour.fast).toBeGreaterThan(e.netPerHour.typical);
    expect(e.netPerHour.typical).toBeGreaterThan(e.netPerHour.slow);
  });

  it('a 500 coin target is met in one trip and one sale: about 2.76 minutes at the typical pace', () => {
    // 9 bars cost 3,231 and sell for 4,608 net: 1,377 clear after one trip. 16 tiles to the furnace (4.8 s) + 10 s + 9 x 5.806 s + 98.4 s.
    const e = evaluate(steel, ctxOf({ prices: steelPrices(), snap: fakeSnap(smither), cash: 5000, target: 500 }));
    expect(e.minutes).not.toBeNull();
    expect(e.minutes!.typical).toBeCloseTo((4.8 + 10 + 9 * (3600 / 620) + 98.4) / 60, 1);
    expect(e.minutes!.fast).toBeLessThan(e.minutes!.typical);
    expect(e.minutes!.typical).toBeLessThan(e.minutes!.slow);
  });

  it('an attractive hourly profit does not make an unaffordable first batch eligible', () => {
    // Three bars cost 1,077; with 200 coins even that is out of reach.
    const e = evaluate(steel, ctxOf({ prices: steelPrices(), snap: fakeSnap(smither), cash: 200 }));
    expect(e.netPerHour.typical).toBeGreaterThan(50_000);
    expect(e.eligible).toBe(false);
    expect(e.blockers.map((b) => b.kind)).toEqual(['capital']);
    expect(e.blockers[0].text).toMatch(/1,077/);
    expect(e.minutes).toBeNull();
  });

  it('current input prices can turn the method negative', () => {
    // Iron ore 200 + 2 x 300 coal = 800 against 512 net: a loss of 288 a bar.
    const prices = fakePrices({ 'Iron ore': { buy: 200, volume: 1e5 }, Coal: { buy: 300, volume: 1e6 }, 'Steel bar': BAR });
    const e = evaluate(steel, ctxOf({ prices, snap: fakeSnap(smither), cash: 50_000 }));
    expect(e.perUnit.net).toBe(-288);
    expect(e.eligible).toBe(false);
    expect(e.blockers.find((b) => b.kind === 'market')?.text).toMatch(/loses about 288 gp per bar/);
  });

  it('an unknown input price is a blocker, never a free input', () => {
    const prices = fakePrices({ Coal: COAL, 'Steel bar': BAR });
    const e = evaluate(steel, ctxOf({ prices, snap: fakeSnap(smither), cash: 50_000 }));
    expect(e.blockers.map((b) => b.text)).toContain('No price for Iron ore');
    expect(e.eligible).toBe(false);
  });

  it('owned ore and coal cut the cash needed but the economics still count them', () => {
    const owned = fakeSnap({ ...smither, items: { 'Iron ore': 90, Coal: 180 } });
    const e = evaluate(steel, ctxOf({ prices: steelPrices(), snap: owned, cash: 0, target: 500 }));
    expect(e.eligible).toBe(true);
    expect(e.upfront.firstTrip).toBe(0);
    expect(e.upfront.owned).toEqual([{ name: 'Iron ore', qty: 9 }, { name: 'Coal', qty: 18 }]);
    // Not free: a bar still nets 153 against the market price of its inputs.
    expect(e.perUnit.net).toBe(153);
  });

  it('protected ore and coal are not spent', () => {
    const snap = fakeSnap({ ...smither, items: { 'Iron ore': 90, Coal: 180 }, protections: [{ name: 'Iron ore', qty: 90, why: 'a step needs it' }] });
    const e = evaluate(steel, ctxOf({ prices: steelPrices(), snap, cash: 0 }));
    expect(e.eligible).toBe(false);
    expect(e.blockers[0].kind).toBe('capital');
  });
});

describe('what may be sold', () => {
  const miner = { levels: { mining: 40 }, position: { x: 3018, y: 3450, plane: 0 }, items: { 'Bronze pickaxe': 1 } };
  const iron = methodById('mine-iron-dwarven')!;
  const prices = () => fakePrices({ 'Iron ore': { sell: 73, volume: 267250 } });

  it('a restricted account cannot count on selling restricted ore', () => {
    const restricted = tradeRestriction({ questPoints: 3, totalLevel: 80 });
    const e = evaluate(iron, ctxOf({ prices: prices(), snap: fakeSnap({ ...miner, restriction: restricted }) }));
    expect(e.eligible).toBe(false);
    expect(e.blockers.find((b) => b.kind === 'sale')?.text).toMatch(/cannot be sold yet/);
  });

  it('an unknown restriction stays unknown: allowed with a caution and a capped confidence', () => {
    const unknown = tradeRestriction({ questPoints: 50, totalLevel: 500 });
    expect(unknown.state).toBe('UNKNOWN');
    const e = evaluate(iron, ctxOf({ prices: prices(), snap: fakeSnap({ ...miner, restriction: unknown }) }));
    expect(e.eligible).toBe(true);
    expect(e.cautions.join(' ')).toMatch(/20 hours/);
    expect(e.confidence).not.toBe('HIGH');
  });

  it('a lifted restriction sells freely', () => {
    const e = evaluate(iron, ctxOf({ prices: prices(), snap: fakeSnap(miner) }));
    expect(e.eligible).toBe(true);
    expect(e.cautions.join(' ')).not.toMatch(/20 hours/);
  });
});

describe('the Hill Giants case, worked by hand', () => {
  // Dependable drops per kill (chance of 1/16 and over): coins (5 x 18 + 38 x 14 + 52 x 10 + 15 x 8) / 128 = 9.859; Big bones 1;
  // limpwurt root 11/128 = 0.0859 at 216 (tax 4, so 212). The smaller coin lines (under 1/16), runes, the talisman and gems are upside.
  // Food: 2 Salmon a kill at 33 = 66. A bag of 28 holds 14 kills' food (2 slots a kill), so a trip is 14 kills.
  const personal = (m: FundingMethod): Personalised | null => (m.id === 'hill-giants'
    ? { secondsPerUnit: { fast: 30, typical: 36, slow: 44 }, extraInputs: [{ item: { id: 329, name: 'Salmon' }, qty: 2 }], confidence: 'MEDIUM', basis: 'the combat model', notes: [] }
    : null);
  const prices = () => fakePrices({ 'Big bones': { sell: 325, volume: 32784 }, 'Limpwurt root': { sell: 216, volume: 69464 }, Salmon: { buy: 33, volume: 11005 } });
  const fighter = (items: Record<string, number> = {}) => fakeSnap({
    levels: { attack: 30, strength: 21, defence: 1, hitpoints: 24 },
    position: { x: 3093, y: 3495, plane: 0 },
    items,
    protections: [{ name: 'Big bones', qty: 50, why: 'S4-03 is done when you hold 50' }],
  });

  it('a kill clears 281 coins once the 50 required bones are banked', () => {
    const e = evaluate(hill, ctxOf({ prices: prices(), snap: fighter(), personalise: personal, cash: 3000, target: 1000 }));
    // 9.859375 + (325 + 216 x 0.0859375) - (6 + 4 x 0.0859375) - 66 = 281.078125
    expect(e.perUnit.net).toBeCloseTo(281.078125, 6);
    expect(e.unitsPerTrip).toBe(14);
    // With only bones, limpwurt and salmon priced, the upside is the coin lines under 1/16: (10 x 7 + 8 x 6 + 88 x 2) / 128 = 2.296875.
    expect(e.perUnit.upside).toBeCloseTo(2.296875, 6);
  });

  it('the money has to be out until the reserve is filled: about 2,517 coins', () => {
    // A trip costs 924 (14 x 66). Coins and limpwurt bring back 14 x 9.859375 + 14 x 0.0859375 x 212 = 393.09, so each of the first three trips
    // leaves 530.91 less. The fourth trip (kills 43 to 56) pays 924 after 3 x 530.91 = 1,592.7 is already out: 2,516.7.
    const e = evaluate(hill, ctxOf({ prices: prices(), snap: fighter(), personalise: personal, cash: 100_000, target: 1000 }));
    const backEach = 14 * 9.859375 + 14 * (11 / 128) * 212;
    const expected = 924 + 3 * (924 - backEach);
    expect(e.workingCapital).toBe(Math.round(expected));
    expect(e.workingCapital).toBe(2517);
  });

  it('with 500 coins the required bones are not income: the method cannot pay for itself and says so', () => {
    const e = evaluate(hill, ctxOf({ prices: prices(), snap: fighter(), personalise: personal, cash: 500, target: 1000 }));
    expect(e.eligible).toBe(true);
    expect(e.minutes).toBeNull();
    expect(e.minutesReason).toMatch(/runs out/);
    expect(e.cautions.join(' ')).toMatch(/2,517 gp is out/);
  });

  it('with the 50 bones already banked, the reserve is filled and the first kills sell', () => {
    const e = evaluate(hill, ctxOf({ prices: prices(), snap: fighter({ 'Big bones': 50 }), personalise: personal, cash: 500, target: 1000 }));
    // One trip of 14 kills costs 924 and brings back more than it cost, bones included: the most that is ever out is that one trip.
    expect(e.workingCapital).toBe(924);
    expect(e.minutes).not.toBeNull();
    // 7 kills: 462 for the food, back 69 coins + 127.5 limpwurt + 7 x 319 bones: positive from the first trip.
  });

  it('without the combat model the pace is the published one and the confidence is LOW', () => {
    const e = evaluate(hill, ctxOf({ prices: prices(), snap: fighter(), cash: 3000 }));
    expect(e.confidence).toBe('LOW');
    expect(e.cautions.join(' ')).toMatch(/Not personalised/);
  });

  it('rare drops never enter the dependable income', () => {
    const e = evaluate(hill, ctxOf({ prices: prices(), snap: fighter(), personalise: personal, cash: 3000 }));
    // Only coins >= 1/16 per line, bones and limpwurt are counted: nothing from runes, the body talisman or gems.
    expect(e.perUnit.sale + e.perUnit.coins).toBeCloseTo(9.859375 + 325 + 216 * (11 / 128), 6);
  });
});

describe('zero capital and tools', () => {
  const collect = methodById('collect-iron-al-kharid')!;
  const prices = () => fakePrices({ 'Iron ore': { sell: 73, volume: 267250 } });

  it('a method with no inputs is executable with no coins once the gate fee is covered', () => {
    const paid = fakeSnap({ quests: { 'Prince Ali Rescue': 'DONE' }, position: { x: 3269, y: 3167, plane: 0 } });
    const e = evaluate(collect, ctxOf({ prices: prices(), snap: paid, cash: 0, target: 300 }));
    expect(e.eligible).toBe(true);
    expect(e.minutes).not.toBeNull();
    expect(e.cautions.join(' ')).toMatch(/other players/);
    expect(e.confidence).toBe('LOW');
  });

  it('the toll gate fare makes the same method need 20 coins before the quest is done', () => {
    const open = fakeSnap({ quests: { 'Prince Ali Rescue': 'NOT_DONE' }, position: { x: 3269, y: 3167, plane: 0 } });
    const e = evaluate(collect, ctxOf({ prices: prices(), snap: open, cash: 0 }));
    expect(e.blockers.map((b) => b.kind)).toEqual(['capital']);
    expect(evaluate(collect, ctxOf({ prices: prices(), snap: open, cash: 20 })).eligible).toBe(true);
  });

  const mine = methodById('mine-iron-dwarven')!;
  const ore = () => fakePrices({ 'Iron ore': { sell: 73, volume: 267250 }, 'Bronze pickaxe': { buy: 103 }, 'Iron pickaxe': { buy: 122 }, 'Steel pickaxe': { buy: 230 } });

  it('a missing pickaxe is bought once, the cheapest the level allows, and never charged per ore', () => {
    const snap = fakeSnap({ levels: { mining: 20 }, position: { x: 3018, y: 3450, plane: 0 } });
    const e = evaluate(mine, ctxOf({ prices: ore(), snap, cash: 1000 }));
    expect(e.upfront.setup).toBe(103);
    expect(e.perUnit.inputs).toBe(0);
    expect(e.notes.join(' ')).toMatch(/Bronze pickaxe first \(103 gp/);
    // With only 100 coins the tool alone is out of reach.
    const poor = evaluate(mine, ctxOf({ prices: ore(), snap, cash: 100 }));
    expect(poor.blockers[0]).toMatchObject({ kind: 'capital', fixable: true });
    expect(poor.blockers[0].text).toMatch(/alone costs 103/);
  });

  it('an owned lesser pickaxe is used, scaled down; a rune pickaxe is not', () => {
    const base = { levels: { mining: 41 }, position: { x: 3018, y: 3450, plane: 0 } };
    const bronze = evaluate(mine, ctxOf({ prices: ore(), snap: fakeSnap({ ...base, items: { 'Bronze pickaxe': 1 } }), cash: 0 }));
    const rune = evaluate(mine, ctxOf({ prices: ore(), snap: fakeSnap({ ...base, items: { 'Rune pickaxe': 1 } }), cash: 0 }));
    expect(bronze.upfront.setup).toBe(0);
    // A trip is 26 ore (a gem may take the 27th slot), 90 s at the bank, one 148.5 s sale per 104 ore. Rune: 448 an hour = 8.036 s an ore;
    // a bronze pickaxe is scaled to 60%: 13.393 s.
    const overhead = 90 / 26 + 148.5 / 104;
    expect(rune.unitsPerHour.typical).toBeCloseTo(3600 / (3600 / 448 + overhead), 1);
    expect(bronze.unitsPerHour.typical).toBeCloseTo(3600 / (3600 / (448 * 0.6) + overhead), 1);
  });

  it('whether a tool is owned is not known without the bank: no purchase is invented, confidence drops', () => {
    const snap = fakeSnap({ levels: { mining: 20 }, bankSeen: false, position: { x: 3018, y: 3450, plane: 0 } });
    const e = evaluate(mine, ctxOf({ prices: ore(), snap, cash: 1000 }));
    expect(e.upfront.setup).toBe(0);
    expect(e.cautions.join(' ')).toMatch(/open the bank/);
    expect(e.confidence).toBe('LOW');
  });

  it('a level that is too low is a fixable blocker; an unknown level is only a caution', () => {
    const low = evaluate(mine, ctxOf({ prices: ore(), snap: fakeSnap({ levels: { mining: 10 } }), cash: 1000 }));
    expect(low.blockers[0]).toMatchObject({ kind: 'level', fixable: true });
    const unknown = evaluate(mine, ctxOf({ prices: ore(), snap: fakeSnap({ levels: {}, items: { 'Bronze pickaxe': 1 } }), cash: 1000 }));
    expect(unknown.blockers).toEqual([]);
    expect(unknown.cautions.join(' ')).toMatch(/mining level is not known/);
  });
});

describe('the market limits the pace', () => {
  const shields = methodById('oziach-shields')!;
  const pie = methodById('pie-shells')!;

  it('a shield that trades 801 times an hour cannot be sold 2,700 times an hour', () => {
    const prices = fakePrices({ 'Anti-dragon shield': { sell: 115, volume: 801 } });
    const snap = fakeSnap({ quests: { 'Dragon Slayer I': 'DONE' }, position: { x: 3067, y: 3516, plane: 0 } });
    const e = evaluate(shields, ctxOf({ prices, snap, cash: 100_000 }));
    // A quarter of an hour's trades is 200 shields, and the trips and the sale cost time on top of that: well below 200 an hour.
    expect(e.unitsPerHour.typical).toBeLessThan(200);
    expect(e.notes.join(' ')).toMatch(/market takes about 200 Anti-dragon shield an hour/);
  });

  it('a product that sells only a handful of times an hour caps the confidence at LOW', () => {
    const prices = fakePrices({ 'Anti-dragon shield': { sell: 115, volume: 12 } });
    const snap = fakeSnap({ quests: { 'Dragon Slayer I': 'DONE' } });
    const e = evaluate(shields, ctxOf({ prices, snap, cash: 100_000 }));
    expect(e.confidence).toBe('LOW');
  });

  it('the exchange buy limit on an input caps the pace (500 pie dishes every four hours)', () => {
    const prices = fakePrices({
      'Pastry dough': { buy: 186, volume: 6039, limit: 13000 }, 'Pie dish': { buy: 5, volume: 4665, limit: 500 }, 'Pie shell': { sell: 313, volume: 11069 },
    });
    const e = evaluate(pie, ctxOf({ prices, snap: fakeSnap({ position: { x: 3165, y: 3490, plane: 0 } }), cash: 100_000 }));
    expect(e.unitsPerHour.fast).toBeLessThanOrEqual(125.01);
    expect(e.notes.join(' ')).toMatch(/buy limit on Pie dish caps this at about 125 an hour/);
  });

  it('a low-confidence price (an old or one-sided quote) lowers the method confidence', () => {
    const prices = fakePrices({ 'Iron ore': IRON, Coal: COAL, 'Steel bar': { ...BAR, conf: 'LOW', notes: ['The sell side was last seen 9 h ago'] } });
    const e = evaluate(steel, ctxOf({ prices, snap: fakeSnap(smither), cash: 5000 }));
    expect(e.confidence).toBe('LOW');
    expect(e.confidenceReasons.join(' ')).toMatch(/9 h ago/);
  });
});

describe('travel changes the best choice for a small target', () => {
  const base: FundingMethod = {
    ...methodById('collect-iron-al-kharid')!,
    id: 'a', requirements: [], title: 'A', marketDependence: undefined,
  };
  const near: FundingMethod = { ...base, id: 'near', title: 'Near', rate: { ...base.rate, perHour: { slow: 300, typical: 300, fast: 300 } }, spot: { x: 3100, y: 3495, plane: 0, label: 'near' } };
  const far: FundingMethod = { ...base, id: 'far', title: 'Far', rate: { ...base.rate, perHour: { slow: 900, typical: 900, fast: 900 } }, spot: { x: 3100, y: 3495 + 900, plane: 0, label: 'far' } };
  const prices = () => fakePrices({ 'Iron ore': { sell: 73, volume: 1e6 } });
  const snap = fakeSnap({ position: { x: 3093, y: 3495, plane: 0 } });

  it('a slower method that is close wins a small target, the faster far one wins a big target', () => {
    const small = { near: evaluate(near, ctxOf({ prices: prices(), snap, cash: 0, target: 300 })), far: evaluate(far, ctxOf({ prices: prices(), snap, cash: 0, target: 300 })) };
    const big = { near: evaluate(near, ctxOf({ prices: prices(), snap, cash: 0, target: 60_000 })), far: evaluate(far, ctxOf({ prices: prices(), snap, cash: 0, target: 60_000 })) };
    expect(small.near.minutes!.typical).toBeLessThan(small.far.minutes!.typical);
    expect(big.far.minutes!.typical).toBeLessThan(big.near.minutes!.typical);
  });
});

describe('gathering for your own use instead of buying', () => {
  const mine = methodById('mine-iron-dwarven')!;
  it('reports the coins saved and no income, and an ironman may do it', () => {
    const prices = fakePrices({ 'Iron ore': { buy: 77, sell: 73, volume: 267250 } });
    const snap = fakeSnap({ levels: { mining: 41 }, items: { 'Rune pickaxe': 1 }, ironman: true, position: { x: 3018, y: 3450, plane: 0 } });
    const e = evaluate(mine, ctxOf({ prices, snap, cash: 0, mode: 'supply', target: 0, needItems: new Map([['Iron ore', 100]]) }));
    expect(e.blockers).toEqual([]);
    expect(e.saves).toBe(7700);
    expect(e.minutes).not.toBeNull();
    // The same method as an earner is refused to an ironman.
    const earn = evaluate(mine, ctxOf({ prices, snap, cash: 0 }));
    expect(earn.blockers.map((b) => b.kind)).toContain('ironman');
  });
});
