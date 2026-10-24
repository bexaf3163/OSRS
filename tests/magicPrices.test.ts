import { describe, expect, it } from 'vitest';
import { buildPriceView } from '../src/lib/funding/quotes';
import { itemPrice } from '../src/lib/itemPrice';
import { castCost, OPTIONS, planFor, RUNE_IDS, SPELLS, STAFFS, staffPayback } from '../src/lib/magicPlan';
import { xpForLevel } from '../src/lib/xp';

const wind = SPELLS.find(s => s.id === 'wind-strike')!;
describe('Magic acquisition quote safety', () => {
  it('cannot compute an option from baked guide prices after a market failure', () => {
    const view = buildPriceView({ now: 1, board: null, mapping: null, baked: new Map([['air rune', { buy: 6, sell: 5 }], ['mind rune', { buy: 3, sell: 2 }]]) });
    const quotes = Object.entries(RUNE_IDS).flatMap(([name, id]) => { const p = itemPrice(view, `${name} rune`, id, 1).unit; return p === null ? [] : [[id, p] as const]; });
    expect(planFor(OPTIONS[0], xpForLevel(10), 25, new Map(quotes))).toBeNull();
  });
  it.each([-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER])('rejects invalid or overflowing costs: %s', price => {
    const prices = new Map([[RUNE_IDS.air, price], [RUNE_IDS.mind, 3], [RUNE_IDS.fire, price], [STAFFS.fire.id, price]]);
    expect(planFor(OPTIONS[0], xpForLevel(10), 25, prices)).toBeNull();
    expect(staffPayback('fire', SPELLS.find(s => s.id === 'fire-strike')!, prices)).toBeNull();
  });
  it('requires only the runes actually spent and avoids rebuying a confirmed staff', () => {
    const prices = new Map([[RUNE_IDS.mind, 3]]);
    expect(castCost(wind, 'air', prices)).toBe(3);
    const option = OPTIONS.find(o => o.id === 'wind-staff')!;
    expect(planFor(option, xpForLevel(10), 25, prices)).toBeNull();
    expect(planFor(option, xpForLevel(10), 25, prices, true)).toMatchObject({ staffCost: 0 });
  });
});
