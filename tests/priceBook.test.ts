import { describe, expect, it } from 'vitest';
import { buildPriceBook, priceNote, reprice } from '../src/lib/priceBook';
import { createPriceService } from '../src/services/pricesApi';
import { nameKey } from '../src/lib/checklist';
import type { LedgerEntry } from '../src/lib/ledger';

const baked = new Map<string, number>([[nameKey('Lobster'), 100], [nameKey('Rare thing'), 7]]);
const mapping = new Map([[379, { name: 'Lobster' }], [380, { name: 'Lobster' }], [1511, { name: 'Logs' }]]);
const live = (at = Date.parse('2026-10-03T17:15:00Z')) => ({ at, prices: new Map([[379, { sellPrice: 150 }], [380, { sellPrice: 120 }], [1511, { sellPrice: 90 }]]) });

describe('prices for the loot estimate', () => {
  it('without fresh prices — from the project database, with a note', () => {
    const b = buildPriceBook(null, null, baked);
    expect(b.source).toBe('baked');
    expect(b.priceOf('lobster')).toBe(100);
    expect(b.priceOf('No such item')).toBeUndefined();
    expect(priceNote(b)).toContain('the exchange is unavailable');
  });

  it('fresh prices win over the database; one name on two items — the lower price', () => {
    const b = buildPriceBook(live(), mapping, baked);
    expect(b.source).toBe('live');
    expect(b.priceOf('Lobster')).toBe(120);
    expect(b.priceOf('Logs')).toBe(90);
    expect(priceNote(b)).toMatch(/at exchange prices from \d\d:\d\d/);
  });

  it('the item is not in the fresh prices — the database price is taken', () => {
    expect(buildPriceBook(live(), mapping, baked).priceOf('Rare thing')).toBe(7);
  });

  it('an empty answer or the catalogue did not load — the database stays, not emptiness', () => {
    expect(buildPriceBook({ at: 1, prices: new Map() }, mapping, baked).source).toBe('baked');
    expect(buildPriceBook(live(), null, baked).source).toBe('baked');
  });

  it('the estimate is recomputed at current prices; coins and nameless ones are left alone', () => {
    const entries: LedgerEntry[] = [
      { name: 'Lobster', quantityDelta: 10, reason: 'LOOT', timestamp: 1, estimatedGpValue: 1000 },
      { name: 'Coins', quantityDelta: 500, reason: 'LOOT', timestamp: 2, estimatedGpValue: 500 },
      { name: 'Unknown item', quantityDelta: 1, reason: 'LOOT', timestamp: 3, estimatedGpValue: 99 },
    ];
    const out = reprice(entries, buildPriceBook(live(), mapping, baked));
    expect(out[0].estimatedGpValue).toBe(1200);
    expect(out[1].estimatedGpValue).toBe(500);
    // The price is gone — we do not keep the old estimate: it would show something we do not know.
    expect(out[2].estimatedGpValue).toBeUndefined();
    expect(entries[0].estimatedGpValue).toBe(1000);
  });
});

describe('price service: all prices at once', () => {
  const rows = { data: { '379': { high: 160, highTime: 1000, low: 150, lowTime: 900 }, '1511': { high: null, highTime: null, low: null, lowTime: null } } };
  it('returns the prices and the time they were fetched in one request', async () => {
    let calls = 0;
    const svc = createPriceService(async () => { calls++; return { ok: true, status: 200, json: async () => rows }; }, () => 5000);
    const all = await svc.getAllPrices();
    expect(all.at).toBe(5000);
    expect(all.prices.get(379)).toMatchObject({ buyPrice: 160, sellPrice: 150 });
    expect(all.prices.has(1511)).toBe(false);
    await svc.getGePrice(379);
    expect(calls).toBe(1);
  });
});
