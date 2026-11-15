import { describe, expect, it } from 'vitest';
import { coinsPerMinute } from './lootValue';
import { fakePrices } from '../../../tests/funding/helpers';

describe('the value of a minute', () => {
  it('a Members minute is worth at least the simplest Members method; free-to-play stays on cowhides', () => {
    const prices = fakePrices({ Cowhide: { buy: 150, sell: 140 }, 'Goat horn': { buy: 100, sell: 95 }, 'Goat horn dust': { buy: 400, sell: 380 } });
    const f2p = coinsPerMinute(prices)!;
    const members = coinsPerMinute(prices, 'members')!;
    expect(members).toBeGreaterThan(f2p);
    // A goat horn margin that does not pay leaves the cowhide baseline.
    expect(coinsPerMinute(fakePrices({ Cowhide: { buy: 150, sell: 140 }, 'Goat horn': { buy: 400, sell: 390 }, 'Goat horn dust': { buy: 100, sell: 95 } }), 'members')).toBe(f2p);
  });
});
