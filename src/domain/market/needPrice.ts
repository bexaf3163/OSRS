// The price of the items a list of requirements still misses (shop or GE), shared by funding, combat and training.
import { nameKey } from '../items/itemKey';
import type { PlayerState } from '../player/playerState';
import { doseKind, dosePackage } from '../items/doses';
import type { PriceView, Confidence } from './quotes';
import { type Requirement, evaluate } from '../player/requirements';

/** Price a known missing kit with the same quote/dose rules as Funding. Unread stock or unpriced required inputs leave its cost unknown. */
export function requirementCost(requirements: readonly Requirement[], state: PlayerState, prices?: PriceView | null): number | null {
  let total = 0;
  const allocated = new Set<string>();
  for (const req of requirements) {
    if (req.type === 'skill' || req.type === 'quest' || req.type === 'gameMode') continue;
    // This helper reserves missing kit, not fees or arbitrary composite allocations.
    if (req.type === 'composite' || req.type === 'money') return null;
    const names = req.type === 'alternative' ? req.alternatives.map((a) => a.name)
      : req.type === 'equipment' ? [req.name, ...(req.anyOf ?? [])] : [req.name];
    const keys = [...new Set(names.map(nameKey))];
    // Do not spend the same observed stock through overlapping requirements. Leave complex allocations to the prep ledger.
    if (keys.some((key) => allocated.has(key))) return null;
    keys.forEach((key) => allocated.add(key));
    const result = evaluate(req, state);
    if (result.state === 'OK' || result.state === 'BANK') continue;
    if (result.state === 'UNKNOWN' || !prices) return null;
    const qty = result.missing;
    if (qty === undefined || !Number.isFinite(qty) || qty < 0) return null;
    const costs = names.map((name) => tierOf(needLines({ key: name, name, qty, why: 'Training kit', kind: 'buy' }, req.type === 'item' && Boolean(doseKind(name)), prices)))
      .filter((tier) => tier.unpriced === 0 && Number.isFinite(tier.cost) && tier.cost >= 0).map((tier) => tier.cost);
    if (!costs.length) return null;
    total += Math.min(...costs);
  }
  return total;
}

export type NeedKind = 'buy' | 'tool' | 'upgrade';
export interface NeedLine {
  key: string;
  name: string;
  id?: number;
  qty: number;
  /** Coins for one at the buy side of today's quote; null - no price known. */
  unit: number | null;
  cost: number | null;
  confidence: Confidence | null;
  /** Where the price came from. */
  priced: 'live' | 'plan' | 'none';
  why: string;
  kind: NeedKind;
}
export interface Tier { cost: number; unpriced: number; lines: NeedLine[]; /** Ownership not checked; excluded from cost, never assumed free. */ unknown?: number }
export function priceLine(
  l: { key: string; name: string; id?: number; qty: number; fallback?: number; why: string; kind: NeedKind },
  prices: PriceView,
): NeedLine {
  const live = prices.buy(l.name, l.id);
  if (live) {
    return { key: l.key, name: l.name, ...(l.id !== undefined ? { id: l.id } : {}), qty: l.qty, unit: live.price, cost: live.price * l.qty, confidence: live.confidence, priced: 'live', why: l.why, kind: l.kind };
  }
  if (l.fallback !== undefined && l.fallback >= 0) {
    return { key: l.key, name: l.name, ...(l.id !== undefined ? { id: l.id } : {}), qty: l.qty, unit: l.fallback, cost: l.fallback * l.qty, confidence: 'LOW', priced: 'plan', why: l.why, kind: l.kind };
  }
  return { key: l.key, name: l.name, ...(l.id !== undefined ? { id: l.id } : {}), qty: l.qty, unit: null, cost: null, confidence: null, priced: 'none', why: l.why, kind: l.kind };
}
/**
 * A potion short by doses is priced as the potions that cover them (doses.ts: whole potions of the named size, the last doses in the cheapest size
 * that holds them), never as that many of the named potion. Anything else is one line as it is.
 */
export function needLines(
  l: { key: string; name: string; id?: number; qty: number; fallback?: number; why: string; kind: NeedKind }, doses: boolean, prices: PriceView,
): NeedLine[] {
  const pack = doses ? dosePackage(l.name, l.qty, (n) => prices.buy(n)?.price ?? null) : null;
  if (!pack) return [priceLine(l, prices)];
  return pack.lines.map((p) => priceLine({ key: `${l.key}#${p.size}`, name: p.name, qty: p.count, why: l.why, kind: l.kind }, prices));
}
export const tierOf = (lines: NeedLine[], unknown = 0): Tier => ({
  cost: lines.reduce((s, l) => s + (l.cost ?? 0), 0),
  unpriced: lines.filter((l) => l.cost === null).length,
  lines,
  unknown,
});
