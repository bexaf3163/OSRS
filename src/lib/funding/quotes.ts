// From an exchange quote to a price a plan can lean on: what one item costs to buy or brings when sold, how far to trust it, and how many the market can absorb.
//
// The exchange reports two sides (instant buyers pay "high", instant sellers get "low"), each with its own time, and for the last full hour the average
// price and the number traded. A plan never takes a bare number: it takes a UnitPrice that carries
//   - the price (the side that applies, the older-side-aware age, a spike guard from the hourly average),
//   - a confidence (HIGH / MEDIUM / LOW) and the reasons it is not HIGH, in plain words,
//   - the hourly volume, for the "can the market absorb this many" question.
// A missing side is never filled in from the other one silently; the substitute is used only as a LOW-confidence estimate and says so.
// No documented order book exists, so the volume is a plausibility check on a quantity, not a promise that a sale will fill.

import type { Quote, QuoteBoard } from '../../services/pricesApi';
import { nameKey } from '../checklist';

export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';
export const CONFIDENCE_RANK: Record<Confidence, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
export const minConfidence = (...c: Confidence[]): Confidence => c.reduce((a, b) => (CONFIDENCE_RANK[b] < CONFIDENCE_RANK[a] ? b : a), 'HIGH' as Confidence);

/** A side seen within this long is current; within the second window it is dated; older is stale. */
export const FRESH_MS = 30 * 60_000;
export const DATED_MS = 6 * 3600_000;
/** A latest price this far from the hourly average is a spike or a crash, not the price. */
export const SPIKE_RATIO = 0.25;
/** A gap between the sides wider than this is suspicious when the item trades thinly. */
export const WIDE_SPREAD = 0.25;
/** Below this many trades an hour an item is thin: its quote can be one person's order. */
export const THIN_VOLUME = 30;
/** Selling this share of an hour's volume or more is no longer plausible at the quoted price. */
export const ABSORB_SHARE = 0.25;

export type PriceBasis = 'side' | 'average' | 'other-side' | 'baked';

export interface UnitPrice {
  /** Whole gp for one item. */
  price: number;
  basis: PriceBasis;
  confidence: Confidence;
  /** Age of the side the price comes from, minutes; null when unknown (a baked price). */
  ageMinutes: number | null;
  /** Items traded in the last full hour on both sides together; null when the hourly feed is not available. */
  volumePerHour: number | null;
  /** Why the confidence is not HIGH, in words for the details drawer. */
  notes: string[];
}

export type PriceStatus = 'live' | 'stale' | 'offline' | 'baked';

export interface PriceView {
  status: PriceStatus;
  /** When the prices were fetched (ms); null for baked ones. */
  at: number | null;
  /** The price to pay to buy one item now; null — no price is known at all. */
  buy(name: string, id?: number): UnitPrice | null;
  /** The price one item brings when sold now, before the exchange tax; null — no price is known at all. */
  sell(name: string, id?: number): UnitPrice | null;
  /** The exchange id of an item, when the reference knows it. */
  idOf(name: string): number | undefined;
  /** The exchange buy limit for four hours; undefined — not known. */
  limitOf(name: string, id?: number): number | undefined;
}

const minutes = (ms: number) => Math.max(0, Math.round(ms / 60_000));

function ageNote(side: 'high' | 'low', ageMs: number): string | null {
  if (ageMs <= FRESH_MS) return null;
  const m = minutes(ageMs);
  const text = m >= 2 * 60 ? `${Math.round(m / 60)} h` : `${m} min`;
  return `The ${side === 'high' ? 'buy' : 'sell'} side was last seen ${text} ago`;
}

function ageConfidence(ageMs: number): Confidence {
  return ageMs <= FRESH_MS ? 'HIGH' : ageMs <= DATED_MS ? 'MEDIUM' : 'LOW';
}

/** Shared checks on one quote: thin volume and a suspicious gap between the sides. */
function marketNotes(q: Quote): { confidence: Confidence; notes: string[] } {
  const notes: string[] = [];
  let confidence: Confidence = 'HIGH';
  const hi = q.high.price;
  const lo = q.low.price;
  const volume = q.hour ? q.hour.highVolume + q.hour.lowVolume : null;
  if (volume !== null && volume < THIN_VOLUME) {
    notes.push(`Thin market: ${volume} traded in the last hour`);
    confidence = minConfidence(confidence, 'MEDIUM');
  }
  if (hi !== null && lo !== null && hi > 0) {
    const gap = (hi - lo) / hi;
    if (gap > WIDE_SPREAD && (volume === null || volume < THIN_VOLUME * 10)) {
      notes.push(`The buy and sell prices are ${Math.round(gap * 100)}% apart`);
      confidence = minConfidence(confidence, 'LOW');
    }
  }
  return { confidence, notes };
}

/**
 * What one item costs to buy: the high side. A latest price far above the hour's average is a spike: the average is used. A missing high side falls
 * back to the low side, flagged and LOW. No price at all — null.
 */
export function buyOf(q: Quote | undefined, now: number): UnitPrice | null {
  if (!q) return null;
  const m = marketNotes(q);
  const volume = q.hour ? q.hour.highVolume + q.hour.lowVolume : null;
  if (q.high.price === null) {
    if (q.low.price === null) return null;
    return {
      price: q.low.price, basis: 'other-side', confidence: 'LOW', ageMinutes: q.low.at === null ? null : minutes(now - q.low.at), volumePerHour: volume,
      notes: ['No recent buy price: the sell price stands in', ...m.notes],
    };
  }
  const age = q.high.at === null ? Infinity : Math.max(0, now - q.high.at);
  const notes = [...m.notes];
  const aged = ageNote('high', age);
  if (aged) notes.push(aged);
  let confidence = minConfidence(m.confidence, ageConfidence(age));
  let price = q.high.price;
  let basis: PriceBasis = 'side';
  const avg = q.hour?.avgHigh ?? null;
  if (avg !== null && avg > 0 && q.high.price > avg * (1 + SPIKE_RATIO)) {
    price = Math.round(avg);
    basis = 'average';
    notes.push('The last buy price is far above the hour average: the average is used');
    confidence = minConfidence(confidence, 'MEDIUM');
  }
  return { price: Math.round(price), basis, confidence, ageMinutes: Number.isFinite(age) ? minutes(age) : null, volumePerHour: volume, notes };
}

/**
 * What one item brings when sold now, before the tax: the low side, and never more than the hour's average low (conservative: a plan must not count
 * on a lucky print). A missing low side falls back to the high side at a discount, flagged and LOW. No price at all — null.
 */
export function sellOf(q: Quote | undefined, now: number): UnitPrice | null {
  if (!q) return null;
  const m = marketNotes(q);
  const volume = q.hour ? q.hour.highVolume + q.hour.lowVolume : null;
  if (q.low.price === null) {
    if (q.high.price === null) return null;
    return {
      price: Math.floor(q.high.price * (1 - WIDE_SPREAD / 2)), basis: 'other-side', confidence: 'LOW',
      ageMinutes: q.high.at === null ? null : minutes(now - q.high.at), volumePerHour: volume,
      notes: ['No recent sell price: the buy price less a margin stands in', ...m.notes],
    };
  }
  const age = q.low.at === null ? Infinity : Math.max(0, now - q.low.at);
  const notes = [...m.notes];
  const aged = ageNote('low', age);
  if (aged) notes.push(aged);
  let confidence = minConfidence(m.confidence, ageConfidence(age));
  let price = q.low.price;
  let basis: PriceBasis = 'side';
  const avg = q.hour?.avgLow ?? null;
  if (avg !== null && avg > 0 && q.low.price > avg) {
    price = Math.floor(avg);
    basis = 'average';
    notes.push('The last sell price is above the hour average: the average is used');
  }
  return { price: Math.floor(price), basis, confidence, ageMinutes: Number.isFinite(age) ? minutes(age) : null, volumePerHour: volume, notes };
}

export interface Absorb {
  /** Share of an hour's volume the quantity is (0..); null when the volume is unknown. */
  share: number | null;
  /** Whether the market plausibly takes this many at the quoted price in about an hour. */
  plausible: boolean | null;
}

/** Can the market take `qty` items in about an hour? Unknown volume stays unknown; it is not read as "yes". */
export function absorbs(price: UnitPrice, qty: number): Absorb {
  if (price.volumePerHour === null) return { share: null, plausible: null };
  if (price.volumePerHour <= 0) return { share: Infinity, plausible: false };
  const share = qty / price.volumePerHour;
  return { share, plausible: share < ABSORB_SHARE };
}

// ---------------------------------------------------------------------------
// The view over a board: names to ids, the project database as the last resort.

export interface BakedPrice { buy: number; sell: number }

export interface ViewInput {
  board: QuoteBoard | null;
  /** The item reference (id to name) from the exchange; without it names cannot be priced from the board. */
  mapping: Map<number, { name: string; limit?: number }> | null;
  /** The project database prices by name key: an estimate from the build date, used only when the board has nothing. */
  baked: Map<string, BakedPrice>;
  now: number;
}

export function buildPriceView(i: ViewInput): PriceView {
  const byName = new Map<string, { id: number; limit: number }>();
  if (i.mapping) {
    for (const [id, m] of i.mapping) {
      const k = nameKey(m.name);
      const have = byName.get(k);
      const limit = m.limit ?? 0;
      // One name for several items (variants): the tradeable one with the larger limit is the one that is bought and sold.
      if (!have || limit > have.limit) byName.set(k, { id, limit });
    }
  }
  const usable = i.board !== null && i.board.status !== 'offline' && i.board.quotes.size > 0 && i.mapping !== null;
  const status: PriceStatus = usable ? i.board!.status : 'baked';
  const bakedOf = (name: string, side: 'buy' | 'sell'): UnitPrice | null => {
    const b = i.baked.get(nameKey(name));
    if (!b) return null;
    const price = side === 'buy' ? b.buy : b.sell;
    return { price, basis: 'baked', confidence: 'LOW', ageMinutes: null, volumePerHour: null, notes: ['Exchange prices are unavailable: an estimate from the guide database'] };
  };
  const quoteOf = (name: string, id?: number): Quote | undefined => {
    if (!usable) return undefined;
    const use = id && id > 0 ? id : byName.get(nameKey(name))?.id;
    return use === undefined ? undefined : i.board!.quotes.get(use);
  };
  const capStale = (p: UnitPrice | null): UnitPrice | null => {
    if (!p || status !== 'stale') return p;
    return { ...p, confidence: minConfidence(p.confidence, 'LOW'), notes: ['The exchange did not answer: these are earlier prices', ...p.notes] };
  };
  return {
    status,
    at: usable ? i.board!.at : null,
    buy: (name, id) => capStale(buyOf(quoteOf(name, id), i.now)) ?? bakedOf(name, 'buy'),
    sell: (name, id) => capStale(sellOf(quoteOf(name, id), i.now)) ?? bakedOf(name, 'sell'),
    idOf: (name) => byName.get(nameKey(name))?.id,
    limitOf: (name, id) => {
      const use = id && id > 0 ? id : byName.get(nameKey(name))?.id;
      const l = use === undefined ? undefined : i.mapping?.get(use)?.limit;
      return l && l > 0 ? l : undefined;
    },
  };
}
