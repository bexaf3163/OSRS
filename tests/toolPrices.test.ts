import { describe, expect, it } from 'vitest';
import { allSteps, stepById } from '../src/data';
import { buildPriceView } from '../src/lib/funding/quotes';
import { itemPrice } from '../src/lib/itemPrice';
import { emptyProgress } from '../src/lib/progress';
import { contextOf } from '../src/lib/readiness';
import { createReadinessEngine } from '../src/lib/readinessEngine';
import { recommendUpgrade, upgradeNav } from '../src/services/gearUpgradeRouter';

const now = 1_800_000_000_000;
const step = stepById.get('S1-08')!;
const gear = { equipment: [{ id: 1351, name: 'Bronze axe', slot: 'weapon' }], inventory: [], coins: 1000, bankCoins: 0 };
function recommendation(status: 'live' | 'stale' = 'live', available = true) {
  const board = buildPriceView({ now, mapping: null, baked: new Map([['steel axe', { buy: 1, sell: 1 }]]),
    board: { at: now, hourAt: null, status, quotes: new Map(available ? [[1353, {
      id: 1353, high: { price: 150, at: now }, low: { price: 150, at: now }, hour: null,
    }]] : []) },
  });
  return recommendUpgrade({ step, mode: 'f2p', levels: { woodcutting: 6 }, gear,
    gePrices: new Map([[1353, 1]]), geQuotes: new Map([[1353, itemPrice(board, 'Steel axe', 1353, 1)]]),
  })!;
}
describe('shared tool acquisition quotes', () => {
  it('routes to the exchange when its quoted price supplies the affordability calculation', () => {
    const rec = recommendation();
    expect(rec).toMatchObject({ approxCost: 150, shopPrice: 200, gePrice: 150, priceLabel: 'GE estimate' });
    expect(rec.shop).toBeUndefined();
    expect(upgradeNav(rec, step.id)).toMatchObject({ label: 'Grand Exchange', itemId: 1353 });
  });
  it('does not replace a missing market quote with a baked or legacy value', () => {
    const rec = recommendation('live', false);
    expect(rec).toMatchObject({ approxCost: 200, shop: "Bob's Brilliant Axes", priceLabel: 'NPC price' });
    expect(rec.gePrice).toBeUndefined();
    expect(upgradeNav(rec, step.id)?.label).toBe("Bob's Brilliant Axes");
  });
  it('updates preparation and its market label when an unchanged price becomes cached', () => {
    const engine = createReadinessEngine(contextOf({ step, steps: allSteps, progress: emptyProgress(), qp: 0, mode: 'f2p', stats: { woodcutting: 6 }, gear, owned: null }));
    const fresh = engine.plan(step, { upgrade: recommendation() });
    const cached = engine.plan(step, { upgrade: recommendation('stale') });
    expect(cached).not.toBe(fresh);
    const line = cached.optimizations.find(l => l.name === 'Steel axe')!;
    expect(line.action?.label).toContain('Cached GE estimate');
    expect(line.marketPrice).toMatchObject({ state: 'cached', unit: 150 });
    expect(line.action?.nav?.label).toBe('Grand Exchange');
  });
});
