// The player's money, in the separate figures the rest of the funding code keeps apart:
//   liquid coins     - coins in the bag and the bank, certain; with the bank unread it is only the bag, and says so;
//   reserve          - coins the step itself needs (a fare, a fee): never spent on a method's supplies;
//   sellable surplus - items in the bag that the cleanup rules mark as surplus (never a protected item, never one a step or a quest needs), valued after the
//                      exchange tax, and only those the account may sell now. It is an estimate until it is sold;
//   the bank's value - the plugin's total for items it cannot itemise: shown, never offered as something to sell.
// A coin is counted once: the surplus is items, the liquid is coins, and a sale moves value from one to the other only when the coins arrive.

import { netSale } from './ge';
import type { PriceView } from './quotes';
import { protectedQty, type FundingSnapshot, type Liquid } from './snapshot';
import { isRestrictedItem } from '../tradeRestriction';
import type { FundingNeed } from './need';

/** What the cleanup advice says about one stack (a subset of CleanupRec: the funding code does not depend on its other fields). */
export interface SurplusRec {
  name: string;
  id?: number;
  qty: number;
  noted: boolean;
  action: 'keep' | 'sell' | 'drop' | 'review';
  proceeds: number | null;
}

export interface SurplusLine {
  name: string;
  id?: number;
  qty: number;
  /** One item at the sell side of the quote; the guide-database estimate when the exchange has none. */
  unit: number;
  /** After the exchange tax. */
  net: number;
  noted: boolean;
  /** unconfirmed - the account's sale limits are unknown, so the sale may be refused. */
  status: 'ok' | 'unconfirmed';
}

export interface Surplus {
  lines: SurplusLine[];
  net: number;
  excluded: { name: string; why: string }[];
}

export interface Budget {
  liquid: Liquid;
  reserve: number;
  /** Coins a method may spend: liquid less the reserve; null - the coins are not known. */
  spendable: number | null;
  surplus: Surplus;
  /** The plugin's valuation of the whole bank; cannot be itemised, so it is information only. */
  bankValue: number | null;
}

export function surplusOf(recs: readonly SurplusRec[], snap: FundingSnapshot, prices: PriceView): Surplus {
  const lines: SurplusLine[] = [];
  const excluded: Surplus['excluded'] = [];
  for (const r of recs) {
    if (r.action !== 'sell' || r.qty <= 0) continue;
    // The cleanup advice already keeps what the route and the quests need; the protection is checked again so a stale list cannot sell a reserve.
    const h = snap.held(r.name);
    const keep = protectedQty(snap, r.name);
    const spare = h.total === null ? r.qty : Math.max(0, Math.min(r.qty, h.total - (Number.isFinite(keep) ? keep : (h.total ?? 0))));
    if (spare <= 0) { excluded.push({ name: r.name, why: 'Kept for your route' }); continue; }
    if (isRestrictedItem(r.name) && snap.restriction.state === 'RESTRICTED') { excluded.push({ name: r.name, why: 'New-account limits: it cannot be sold yet' }); continue; }
    const quote = prices.sell(r.name, r.id);
    const unit = quote?.price ?? (r.proceeds !== null && r.qty > 0 ? Math.floor(r.proceeds / r.qty) : null);
    if (unit === null || unit <= 0) { excluded.push({ name: r.name, why: 'No price' }); continue; }
    const net = netSale(unit, spare, r.name);
    if (net <= 0) continue;
    lines.push({
      name: r.name, ...(r.id !== undefined ? { id: r.id } : {}), qty: spare, unit, net, noted: r.noted,
      status: isRestrictedItem(r.name) && snap.restriction.state === 'UNKNOWN' ? 'unconfirmed' : 'ok',
    });
  }
  lines.sort((a, b) => b.net - a.net || a.name.localeCompare(b.name));
  return { lines, net: lines.reduce((s, l) => s + l.net, 0), excluded };
}

export function buildBudget(i: { snap: FundingSnapshot; need: FundingNeed; recs: readonly SurplusRec[]; prices: PriceView; bankValue: number | null }): Budget {
  const liquid = i.snap.liquid;
  const reserve = i.need.fees.now;
  return {
    liquid, reserve,
    spendable: liquid.amount === null ? null : Math.max(0, liquid.amount - reserve),
    surplus: surplusOf(i.recs, i.snap, i.prices),
    bankValue: i.bankValue,
  };
}

/**
 * Coins short for a required total, or null when the answer cannot be given: the coins are unknown, or only the bag is known and it is not enough
 * (the rest may be in the bank). A bag that already covers the total settles the question without the bank.
 */
export function gapFor(required: number, liquid: Liquid): number | null {
  if (liquid.amount === null) return null;
  if (liquid.amount >= required) return 0;
  return liquid.complete ? required - liquid.amount : null;
}
