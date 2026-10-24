import { describe, expect, it } from 'vitest';
import { buildPriceBook, priceNote, reprice } from '../src/lib/priceBook';
import { createPriceService } from '../src/services/pricesApi';
import { nameKey } from '../src/lib/checklist';
import { buildPriceView } from '../src/lib/funding/quotes';
import type { LedgerEntry } from '../src/lib/ledger';

const baked = new Map<string, number>([[nameKey('Lobster'), 100], [nameKey('Rare thing'), 7]]);
const at = 1_800_000_000_000;
const ids = new Map([['lobster', 379], ['logs', 1511]]);
const view = (available = true, stale = false, mapping = true) => buildPriceView({ now: at,
  baked: new Map([...baked].map(([name, price]) => [name, { buy: price, sell: price }])),
  mapping: mapping ? new Map([[379, { id: 379, name: 'Lobster' }], [1511, { id: 1511, name: 'Logs' }]]) : null,
  board: available ? { at, hourAt: null, status: stale ? 'stale' : 'live', quotes: new Map([
    [379, { id: 379, high: { price: 160, at }, low: { price: 150, at }, hour: null }],
    [380, { id: 380, high: { price: 130, at }, low: { price: 120, at }, hour: null }],
    [1511, { id: 1511, high: { price: 100, at }, low: { price: 90, at }, hour: null }],
  ]) } : null,
});
const book = (available = true, stale = false, mapping = true) => buildPriceBook(view(available, stale, mapping), name => ids.get(nameKey(name)));

describe('prices for the loot estimate', () => {
  it('without market quotes — unknown, never a database price', () => {
    const b = book(false);
    expect(b.source).toBe('unavailable');
    expect(b.priceOf('lobster')).toBeUndefined();
    expect(b.priceOf('No such item')).toBeUndefined();
    expect(priceNote(b)).toContain('exchange prices unavailable');
  });

  it('canonical physical IDs win over another variant and acquisition keeps the buy side', () => {
    const b = book();
    expect(b.source).toBe('live');
    expect(b.priceOf('Lobster')).toBe(150);
    expect(b.buyPriceOf('Lobster')).toBe(160);
    expect(b.priceOf('Logs')).toBe(90);
    expect(priceNote(b)).toContain('GE sell estimates');
    expect(priceNote(b)).not.toMatch(/\d\d:\d\d|2026/);
    expect(b.at).toBe(at);
  });

  it('a missing item quote is not replaced by its old database value', () => {
    expect(book().priceOf('Rare thing')).toBeUndefined();
  });

  it('cached quotes retain their label; local canonical IDs work without a name catalogue', () => {
    expect(book(true, true).source).toBe('cached');
    expect(book(true, true).quoteOf('Lobster').label).toBe('Cached GE sell estimate');
    expect(priceNote(book(true, true))).toContain('cached');
    expect(book(true, false, false).priceOf('Lobster')).toBe(150);
  });

  it('the estimate is recomputed at current prices; coins and nameless ones are left alone', () => {
    const entries: LedgerEntry[] = [
      { name: 'Lobster', quantityDelta: 10, reason: 'LOOT', timestamp: 1, estimatedGpValue: 1000 },
      { name: 'Coins', quantityDelta: 500, reason: 'LOOT', timestamp: 2, estimatedGpValue: 500 },
      { name: 'Unknown item', quantityDelta: 1, reason: 'LOOT', timestamp: 3, estimatedGpValue: 99 },
    ];
    const out = reprice(entries, book());
    expect(out[0].estimatedGpValue).toBe(1500);
    expect(out[1].estimatedGpValue).toBe(500);
    // The price is gone — we do not keep the old estimate: it would show something we do not know.
    expect(out[2].estimatedGpValue).toBeUndefined();
    expect(entries[0].estimatedGpValue).toBe(1000);
  });
  it('removes invalid overflowing estimates rather than recording fabricated wealth', () => {
    const entries: LedgerEntry[] = [{ name: 'Lobster', quantityDelta: Number.MAX_SAFE_INTEGER, reason: 'LOOT', timestamp: 1, estimatedGpValue: 1 }];
    expect(reprice(entries, book())[0].estimatedGpValue).toBeUndefined();
    expect(reprice(entries, book(false))[0].estimatedGpValue).toBeUndefined();
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
