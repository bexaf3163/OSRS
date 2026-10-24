import { describe, expect, it } from 'vitest';
import { buildPriceView } from '../src/lib/funding/quotes';
import { gearMarketPrices } from '../src/lib/gearAdvice';
import { adviseGear, gearData, hudHint, sourceText } from '../src/services/gearAdvisor';

const now = 1_800_000_000_000;
const steel = gearData.items.find(i => i.name === 'Steel scimitar')!;
const bronze = gearData.items.find(i => i.name === 'Bronze sword')!;
function board(status: 'live' | 'stale' = 'live', available = true) {
  return buildPriceView({ now, mapping: null,
    baked: new Map([['steel scimitar', { buy: 1, sell: 1 }]]),
    board: { status, at: now, hourAt: null, quotes: new Map(available ? [[steel.id, {
      id: steel.id, high: { price: 150, at: now }, low: { price: 140, at: now }, hour: null,
    }]] : []) },
  });
}
function advice(geQuotes: ReturnType<typeof gearMarketPrices>) {
  return adviseGear({ mode: 'f2p', levels: { attack: 5, strength: 5, defence: 1 }, geQuotes,
    // An old numeric input must not override the shared board's explicit missing quote.
    gePrices: new Map([[steel.id, 1]]),
    gear: { equipment: [{ id: bronze.id, name: bronze.name, slot: 'weapon' }], inventory: [], coins: 9000, bankCoins: 0 },
  });
}

describe('shared gear acquisition prices', () => {
  it('uses canonical IDs even without the mapping request and preserves current source certainty', () => {
    const action = advice(gearMarketPrices(board())).actions[0];
    expect(action).toMatchObject({ item: { id: steel.id }, cost: 150, source: { kind: 'ge', price: 150, priceLabel: 'GE estimate' } });
    expect(sourceText(action.source)).toContain('GE estimate');
    expect(hudHint(action)).toContain('150 gp (GE estimate)');
  });
  it('keeps cached costs labelled through the action, source and HUD', () => {
    const action = advice(gearMarketPrices(board('stale'))).actions[0];
    expect(action.cost).toBe(150);
    expect(sourceText(action.source)).toContain('Cached GE estimate');
    expect(hudHint(action)).toContain('Cached GE estimate');
  });
  it('rejects baked values and retains the real fixed NPC source after market failure', () => {
    const quotes = gearMarketPrices(board('live', false));
    expect(quotes.get(steel.id)).toMatchObject({ unit: null, state: 'unavailable' });
    const action = advice(quotes).actions[0];
    expect(action).toMatchObject({ cost: 410, source: { kind: 'shop', price: 400, toll: 10 } });
    expect(action.alternatives.find(s => s.kind === 'ge')).toMatchObject({ priceLabel: 'Price unavailable' });
    expect(sourceText(action.alternatives.find(s => s.kind === 'ge')!)).toContain('Price unavailable');
  });
});
