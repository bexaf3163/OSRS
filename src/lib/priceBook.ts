// Sale estimates for loot, from the same quote board as acquisition planning.
// The loot estimate is recounted at the current prices on every display and not fixed at the moment of the find:
// a price that was an hour ago is not the price now.

import type { LedgerEntry } from './ledger';
import type { PriceView } from './funding/quotes';
import { itemPrice, type ItemPrice } from './itemPrice';

export interface PriceBook {
  /** The sale price per piece by name; no price means undefined. */
  priceOf: (name: string) => number | undefined;
  /** Acquisition estimates must use the buy side, not the loot sale side. */
  buyPriceOf: (name: string) => number | undefined;
  quoteOf: (name: string) => ItemPrice;
  source: 'live' | 'cached' | 'unavailable';
  /** When the fresh prices were received (ms); null for baked. */
  at: number | null;
}

/** Unknown prices stay unknown; a retained board retains its cached label and original timestamp. */
export function buildPriceBook(view: PriceView, idOf: (name: string) => number | undefined = () => undefined): PriceBook {
  const sells = new Map<string, ItemPrice>();
  const buys = new Map<string, ItemPrice>();
  const quote = (name: string, side: 'buy' | 'sell') => {
    const cache = side === 'sell' ? sells : buys;
    if (!cache.has(name)) cache.set(name, itemPrice(view, name, idOf(name), 1, side));
    return cache.get(name)!;
  };
  return {
    priceOf: name => quote(name, 'sell').unit ?? undefined,
    buyPriceOf: name => quote(name, 'buy').unit ?? undefined,
    quoteOf: name => quote(name, 'sell'),
    source: view.status === 'live' ? 'live' : view.status === 'stale' ? 'cached' : 'unavailable', at: view.at,
  };
}

/** Journal records with an estimate at current prices; coins and records without a price stay as they were. */
export function reprice(entries: LedgerEntry[], book: PriceBook): LedgerEntry[] {
  return entries.map((e) => {
    if (e.name === 'Coins') return e;
    const price = book.priceOf(e.name);
    if (price === undefined || !Number.isSafeInteger(price * e.quantityDelta)) {
      if (e.estimatedGpValue === undefined) return e;
      const { estimatedGpValue: _drop, ...rest } = e;
      return rest;
    }
    return { ...e, estimatedGpValue: price * e.quantityDelta };
  });
}

/** Market certainty, without an unnecessary calendar or clock display. */
export function priceNote(book: PriceBook): string {
  if (book.source === 'live') return 'GE sell estimates, current or cached, before exchange tax';
  if (book.source === 'cached') return 'cached GE sell estimates, before exchange tax';
  return 'exchange prices unavailable; unpriced loot is excluded';
}
