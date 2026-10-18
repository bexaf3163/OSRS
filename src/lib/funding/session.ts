// What a funding plan actually brought, and how fast the work really goes. Both come from the resource journal (ledger.ts), which is built from changes between
// the game's own snapshots, so the rules of honest accounting are already in it: moving items to the bank is a BANK_TRANSFER and not an entry of income, a
// bank being opened or closed makes no entries, and the loot's value is an estimate attached to the loot, not coins.
//
// This file adds only what a plan needs on top:
//   - realized coins are those that arrived by a sale or a monster's coin drop; supplies bought are subtracted; a quest reward is not funding income;
//   - unsold loot is the loot taken less what was sold, per item, valued as an estimate and shown apart from the coins;
//   - the same item is never counted twice: a sold item leaves the unsold figure in the same step that the coins enter the realized one;
//   - the pace the player really worked at is units of the method's main product over seconds of actual work, trusted only after enough of both.

import { nameKey } from '../checklist';
import type { LedgerEntry } from '../ledger';
import type { ObservedRate } from './evaluate';
import { OBSERVED_MIN_SECONDS, OBSERVED_MIN_UNITS } from './evaluate';

export interface UnsoldLine { name: string; qty: number; estimated: number }

export interface Realized {
  /** Coins that arrived from selling items. */
  fromSales: number;
  /** Coins that dropped from monsters or lay on the ground. */
  fromDrops: number;
  /** Coins spent on purchases. */
  spent: number;
  /** Loot taken and not yet sold, with its estimated value at current prices. */
  unsold: UnsoldLine[];
  unsoldEstimate: number;
  /** Realized coins less what was spent. Never includes the unsold estimate. */
  net: number;
}

export function realizedSince(entries: readonly LedgerEntry[], since: number): Realized {
  const r: Realized = { fromSales: 0, fromDrops: 0, spent: 0, unsold: [], unsoldEstimate: 0, net: 0 };
  const loot = new Map<string, { name: string; qty: number; value: number }>();
  const sold = new Map<string, number>();
  for (const e of entries) {
    if (e.timestamp < since) continue;
    // Moving to the bank is not income; a quest reward is not funding; an item consumed (food eaten) is neither loot nor a sale.
    if (e.reason === 'BANK_TRANSFER' || e.reason === 'QUEST_REWARD' || e.reason === 'UNKNOWN') continue;
    if (e.name === 'Coins') {
      if (e.quantityDelta > 0 && e.reason === 'SALE') r.fromSales += e.quantityDelta;
      else if (e.quantityDelta > 0 && (e.reason === 'LOOT' || e.reason === 'PICKUP')) r.fromDrops += e.quantityDelta;
      else if (e.quantityDelta < 0 && e.reason === 'PURCHASE') r.spent += -e.quantityDelta;
      continue;
    }
    const k = nameKey(e.name);
    if ((e.reason === 'LOOT' || e.reason === 'PICKUP') && e.quantityDelta > 0) {
      const have = loot.get(k) ?? { name: e.name, qty: 0, value: 0 };
      have.qty += e.quantityDelta;
      have.value += e.estimatedGpValue ?? 0;
      loot.set(k, have);
    } else if (e.reason === 'SALE' && e.quantityDelta < 0) {
      sold.set(k, (sold.get(k) ?? 0) + -e.quantityDelta);
    }
  }
  for (const [k, l] of loot) {
    const left = Math.max(0, l.qty - (sold.get(k) ?? 0));
    if (left <= 0) continue;
    // The estimate follows the share still unsold; the unit value is the average of the entries (the ledger reprices them at current prices).
    r.unsold.push({ name: l.name, qty: left, estimated: Math.round((l.value / l.qty) * left) });
  }
  r.unsold.sort((a, b) => b.estimated - a.estimated || a.name.localeCompare(b.name));
  r.unsoldEstimate = r.unsold.reduce((s, u) => s + u.estimated, 0);
  r.net = r.fromSales + r.fromDrops - r.spent;
  return r;
}

/** Units of the named products taken in the window: loot and pick-ups only. Unrelated drops are not the method's units. */
export function unitsOf(entries: readonly LedgerEntry[], since: number, products: readonly string[]): number {
  const want = new Set(products.map(nameKey));
  let n = 0;
  for (const e of entries) {
    if (e.timestamp < since || !want.has(nameKey(e.name))) continue;
    if ((e.reason === 'LOOT' || e.reason === 'PICKUP') && e.quantityDelta > 0) n += e.quantityDelta;
  }
  return n;
}

// ---------------------------------------------------------------------------
// The pace a player really works at, kept between plans

export interface RateTotals { units: number; activeSeconds: number }
export type RateBook = Record<string, RateTotals>;

/** Older work counts less once the total passes this many seconds of it: the pace follows the player's current habits. */
export const RATE_WINDOW_SECONDS = 4 * 3600;

export function addWork(book: RateBook, methodId: string, units: number, seconds: number): RateBook {
  if (!(units >= 0) || !(seconds > 0)) return book;
  const old = book[methodId] ?? { units: 0, activeSeconds: 0 };
  let u = old.units + units;
  let s = old.activeSeconds + seconds;
  if (s > RATE_WINDOW_SECONDS) {
    const f = RATE_WINDOW_SECONDS / s;
    u *= f; s *= f;
  }
  return { ...book, [methodId]: { units: Math.round(u * 100) / 100, activeSeconds: Math.round(s) } };
}

/** The observed pace of each method with enough work behind it; the others are left out (the published figures stay in charge). */
export function observedRates(book: RateBook): Map<string, ObservedRate> {
  const out = new Map<string, ObservedRate>();
  for (const [id, t] of Object.entries(book)) {
    if (t.units >= OBSERVED_MIN_UNITS && t.activeSeconds >= OBSERVED_MIN_SECONDS) out.set(id, { unitsPerHour: (t.units / t.activeSeconds) * 3600, units: t.units, activeSeconds: t.activeSeconds });
  }
  return out;
}

export const RATES_KEY = 'osrs-put:funding-rates';
export const ratesKey = (profileId: string, character: string | null | undefined): string => {
  const who = (character ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `${RATES_KEY}:${profileId}:${who || '-'}`;
};

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function loadRates(store: Store | undefined, key: string): RateBook {
  try {
    const text = store?.getItem(key);
    if (!text) return {};
    const data: unknown = JSON.parse(text);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    const out: RateBook = {};
    for (const [id, v] of Object.entries(data as Record<string, unknown>)) {
      const t = v as Partial<RateTotals> | null;
      if (t && typeof t.units === 'number' && typeof t.activeSeconds === 'number' && t.units >= 0 && t.activeSeconds > 0 && Number.isFinite(t.units) && Number.isFinite(t.activeSeconds)) {
        out[id] = { units: t.units, activeSeconds: t.activeSeconds };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveRates(store: Store | undefined, key: string, book: RateBook): void {
  try {
    if (Object.keys(book).length === 0) store?.removeItem(key);
    else store?.setItem(key, JSON.stringify(book));
  } catch {
    // Storage full or closed: the pace is kept in memory until the app closes.
  }
}
