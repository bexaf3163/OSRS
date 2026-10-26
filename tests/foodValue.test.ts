import { describe, expect, it } from 'vitest';
import { effectiveHeal, foodAllowed, foodInBag, foodsCovering, FOODS } from '../src/lib/foodAdvice';
import type { PriceView } from '../src/lib/funding/quotes';

const quote = (price: number) => ({ price, basis: 'side' as const, confidence: 'HIGH' as const, ageMinutes: 0, volumePerHour: null, notes: [] });
const prices = (values: Record<string, number | null>, fallback: number | null = 100000): PriceView => ({
  status: 'live', at: 1, idOf: () => undefined, limitOf: () => undefined,
  buy: (name) => { const p = name in values ? values[name] : fallback; return p === null ? null : quote(p); },
  sell: () => null,
});

describe('ordinary food eligibility and value', () => {
  it('all generated foods have explicit membership; Members fish never become F2P recommendations', () => {
    expect(FOODS.every((f) => typeof f.members === 'boolean')).toBe(true);
    expect(FOODS.filter((f) => f.members).map((f) => f.name).sort()).toEqual(['Bass', 'Cod', 'Mackerel']);
    const market = prices({ Cod: 1, Bass: 1, Mackerel: 1 });
    expect(foodsCovering(6, 'f2p', 20, market).some((f) => f.members)).toBe(false);
    expect(foodsCovering(6, 'members', 20, market)[0].name).toBe('Bass');
    expect(foodAllowed({ name: 'Unchecked food', heals: 20 } as never, 'members')).toBe(false);
  });
  it('compares cost per effective healing instead of the smallest fish or the largest heal', () => {
    const result = foodsCovering(7, 'f2p', 30, prices({ Trout: 80, Salmon: 90, Tuna: 50, Swordfish: 140 }));
    expect(result[0].name).toBe('Tuna');
  });
  it('a low-HP character does not pay for healing beyond the amount they can be missing', () => {
    expect(effectiveHeal({ heals: 14 }, 10)).toBe(9);
    expect(effectiveHeal({ heals: 7 }, 10)).toBe(7);
    expect(effectiveHeal({ heals: 14 })).toBe(14);
    expect(foodsCovering(10, 'f2p', 10)).toEqual([]);
    expect(foodsCovering(7, 'f2p', 10, prices({ Salmon: 90, Swordfish: 120 }))[0].name).toBe('Salmon');
  });
  it('unknown prices do not become free food', () => {
    const result = foodsCovering(7, 'f2p', 30, prices({ Salmon: 0.01, Swordfish: null }, null));
    expect(result[0].name).toBe('Salmon');
    expect(result.some((f) => f.name === 'Swordfish')).toBe(true);
  });
  it('bag food remains recognized, but only usable food counts for the selected account mode', () => {
    const items = [{ name: 'Bass', count: 5 }, { name: 'Salmon', count: 3 }];
    expect(foodInBag(items, 'f2p').map((x) => x.food.name)).toEqual(['Salmon']);
    expect(foodInBag(items, 'members')[0]).toMatchObject({ food: { name: 'Bass' }, count: 5 });
  });
});
