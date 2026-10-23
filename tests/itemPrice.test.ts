import { describe, expect, it } from 'vitest';
import { itemPrice } from '../src/lib/itemPrice';
import { buildPriceView } from '../src/lib/funding/quotes';
import { buildPlayerState } from '../src/lib/playerState';
import { createReadinessEngine } from '../src/lib/readinessEngine';
import { planPayload } from '../src/lib/prepEnvelope';
import { planSources } from '../src/lib/sourceRouter';
import { emptyProgress } from '../src/lib/progress';
import { itemById } from '../src/data';
import type { Step } from '../src/types';

const NOW = 1_800_000_000_000;
function prices(unit: number | null = 200, status: 'live' | 'stale' = 'live', age = 1, onlySell = false, mapping = true) {
  return buildPriceView({ now: NOW, mapping: mapping ? new Map([[379, { name: 'Lobster' }]]) : null,
    baked: new Map([['lobster', { buy: 9999, sell: 9998 }]]),
    board: { at: NOW, hourAt: null, status, quotes: new Map([[379, { id: 379,
      high: { price: onlySell ? null : unit, at: NOW - age * 60_000 },
      low: { price: unit, at: NOW - age * 60_000 }, hour: null,
    }]]) },
  });
}
const progress = emptyProgress();
const step: Step = { id: 'TEST', stage: 1, type: 'prep', title: 'Prepare', doneWhen: 'Supplies owned.', requires: [],
  itemsRequired: [{ nameEn: 'Lobster', wikiItemId: 379, amount: 20, howToGet: 'Grand Exchange.' }],
};
function state(count: number | null = 0) {
  return buildPlayerState({ mode: 'f2p', stats: null, progress, questsDone: null, connected: true,
    owned: { bankSeen: true, items: new Map(count === null ? [] : [['lobster', { name: 'Lobster', carried: count, noted: 0, bank: 0 }]]) },
    gear: { equipment: [], inventory: [], coins: 5000, bankCoins: 0 },
  });
}

describe('shared market price presentation', () => {
  it('uses the canonical ID without a mapping and multiplies physical quantities', () => {
    expect(itemPrice(prices(200, 'live', 1, false, false), 'Different display name', 379, 1)).toMatchObject({ unit: 200, total: 200, state: 'current' });
    expect(itemPrice(prices(), 'Lobster', 379, 20)).toMatchObject({ unit: 200, total: 4000, text: 'GE estimate: ≈ 4,000 gp (200 each)' });
  });
  it('does not present a baked planning fallback as a market price', () => {
    expect(itemPrice(prices(null), 'Lobster', 379, 20)).toMatchObject({ state: 'unavailable', unit: null, total: null, text: 'Price unavailable' });
    expect(itemPrice(null, 'Lobster', 379, 20).state).toBe('unavailable');
  });
  it('labels retained/old-side quotes and an opposite-side substitute honestly', () => {
    expect(itemPrice(prices(200, 'stale'), 'Lobster', 379, 20).text).toMatch(/^Cached GE estimate/);
    expect(itemPrice(prices(200, 'live', 61), 'Lobster', 379, 20).state).toBe('cached');
    expect(itemPrice(prices(200, 'live', 1, true), 'Lobster', 379, 20).text).toMatch(/^Indicative GE estimate/);
  });
  it.each([0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER])('rejects invalid or overflowing totals (%s)', quantity => {
    expect(itemPrice(prices(), 'Lobster', 379, quantity).total).toBeNull();
  });
  it('updates acquisition and the app/game price from the same engine snapshot, without changing stock', () => {
    const run = (unit: number | null, count: number | null = 0) => createReadinessEngine({ steps: [step], progress, qp: 0,
      mode: 'f2p', state: state(count), prices: prices(unit) }).plan(step, { ahead: 0 });
    const first = run(200);
    expect(first.lines[0].marketPrice?.total).toBe(4000);
    expect(first.lines[0].action).toMatchObject({ kind: 'BUY', price: 200 });
    expect(planPayload(first).lines[0].price).toBe(first.lines[0].marketPrice?.text);
    const increased = run(400);
    expect(increased.lines[0].marketPrice?.total).toBe(8000);
    expect(increased.lines[0].action).toMatchObject({ kind: 'EARN', price: 400 });
    expect(run(null).lines[0].action?.price).toBeUndefined();
    expect(run(null).lines[0].marketPrice?.state).toBe('unavailable');
    expect(run(200, null).lines[0]).toMatchObject({ where: 'UNKNOWN', toGet: null, action: { kind: 'CONNECT' } });
    expect(run(200, 20).lines[0]).toMatchObject({ where: 'INVENTORY', toGet: 0 });
  });
  it('explicitly unavailable market prices cannot revive static GE prices, and fixed shop prices remain fixed', () => {
    const d = { ...itemById.get(379)!, gePrice: { buyPrice: 9999, sellPrice: 9998, updatedAt: '2001-01-01' } };
    const unknown = planSources({ name: 'Lobster', need: 20, detail: { ...d, buyLocations: [], freeSpawns: [], dropSources: [] }, gePrice: null }, state());
    expect(unknown.primary).toMatchObject({ kind: 'ge' });
    expect(unknown.primary?.price).toBeUndefined();
    const shop = planSources({ name: 'Lobster', need: 20, detail: { ...d, freeSpawns: [], dropSources: [], buyLocations: [
      { shopName: "Gerrant's Fishy Business", location: 'Port Sarim', price: 90, stock: 100 },
    ] }, gePrice: null }, state());
    expect(shop.primary).toMatchObject({ kind: 'shop', price: 90 });
  });
});
