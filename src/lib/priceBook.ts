// Prices for estimating loot: fresh ones from the exchange (OSRS Wiki Prices), and until they arrive from the project's item database.
// The loot estimate is recounted at the current prices on every display and not fixed at the moment of the find:
// a price that was an hour ago is not the price now.

import { nameKey } from './checklist';
import type { LedgerEntry } from './ledger';

export interface PriceBook {
  /** The sale price per piece by name; no price means undefined. */
  priceOf: (name: string) => number | undefined;
  /** live means the exchange prices, baked means from the project's database (the exchange is unavailable). */
  source: 'live' | 'baked';
  /** When the fresh prices were received (ms); null for baked. */
  at: number | null;
}

export interface LivePrices {
  at: number;
  prices: Map<number, { sellPrice: number }>;
}

/**
 * Fresh prices by name: the id to name mapping is taken from the exchange's catalogue. If an item is not among the fresh prices
 * (untradeable or rare), take the price from the project's database if it has one. With no network at all, only the database.
 */
export function buildPriceBook(live: LivePrices | null, mapping: Map<number, { name: string }> | null, baked: Map<string, number>): PriceBook {
  if (!live || !mapping || live.prices.size === 0) {
    return { priceOf: (name) => baked.get(nameKey(name)), source: 'baked', at: null };
  }
  const byName = new Map<string, number>();
  for (const [id, p] of live.prices) {
    const m = mapping.get(id);
    // One name for several items (versions, banknotes): take the lower price: the estimate must not be inflated.
    if (m && p.sellPrice > 0) {
      const k = nameKey(m.name);
      const prev = byName.get(k);
      byName.set(k, prev === undefined ? p.sellPrice : Math.min(prev, p.sellPrice));
    }
  }
  return { priceOf: (name) => byName.get(nameKey(name)) ?? baked.get(nameKey(name)), source: 'live', at: live.at };
}

/** Journal records with an estimate at current prices; coins and records without a price stay as they were. */
export function reprice(entries: LedgerEntry[], book: PriceBook): LedgerEntry[] {
  return entries.map((e) => {
    if (e.name === 'Coins') return e;
    const price = book.priceOf(e.name);
    if (price === undefined) {
      if (e.estimatedGpValue === undefined) return e;
      const { estimatedGpValue: _drop, ...rest } = e;
      return rest;
    }
    return { ...e, estimatedGpValue: price * e.quantityDelta };
  });
}

/** "at exchange prices from 20:15" / "at database prices: the exchange is unavailable". */
export function priceNote(book: PriceBook): string {
  if (book.source === 'live' && book.at !== null) {
    const d = new Date(book.at);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `at exchange prices from ${hh}:${mm}`;
  }
  return 'at database prices: the exchange is unavailable';
}
