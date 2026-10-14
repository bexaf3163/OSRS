// "What to buy with the coins you have": a shopping list that cannot be paid for by selling (a restricted new account, see tradeRestriction.ts)
// is cut by priority instead of by hope. The route's data gives every priced item a tier:
//   1 - materials of the quests ahead (cheap, each useful alone),
//   2 - what the next steps are built on (the Imp Catcher beads, the first scimitars),
//   3 - comfort that can wait for money from selling (amulet of strength, energy potions, the mithril scimitar).
// A tier is bought only when every lower tier is covered. Tiers 1 and 3 are bought item by item (each item is useful alone); tier 2 is all or
// nothing (half the beads are no quest).
// The prices are the route's own planning estimates (the item's `gp`, each); this is a plan, not a quote.

import type { StepItemRequirement } from '../types';
import { parseAmount } from './checklist';

export interface PlanLine {
  name: string;
  amount: number;
  /** The planning price of one. */
  gp: number;
  total: number;
  tier: 1 | 2 | 3;
}

export interface FundingPlan {
  /** Coins counted; null means the coins are unknown and nothing is allocated. */
  coins: number | null;
  /** To buy now, in the list's order. Empty when the coins are unknown. */
  buy: PlanLine[];
  /** To wait for: not covered by the coins. With unknown coins this is every line, to be read by tier. */
  later: PlanLine[];
  costBuy: number;
  costLater: number;
  /** What is left after the purchases; null with unknown coins. */
  left: number | null;
  /** The first tier that was not covered, and how many coins short it is. */
  short: { tier: 1 | 2 | 3; by: number } | null;
}

/** The priced lines of a list: items without `gp` and `tier` are not part of the plan. */
export function planLines(items: readonly StepItemRequirement[], owned?: (name: string) => number): PlanLine[] {
  const out: PlanLine[] = [];
  for (const it of items) {
    if (typeof it.gp !== 'number' || !(it.gp >= 0) || (it.tier !== 1 && it.tier !== 2 && it.tier !== 3)) continue;
    const want = parseAmount(it.amount) ?? 1;
    const amount = Math.max(0, want - Math.max(0, Math.floor(owned?.(it.nameEn) ?? 0)));
    if (amount > 0) out.push({ name: it.nameEn, amount, gp: it.gp, total: amount * it.gp, tier: it.tier });
  }
  return out;
}

const sum = (l: readonly PlanLine[]) => l.reduce((n, x) => n + x.total, 0);

export function fundingPlan(items: readonly StepItemRequirement[], coins: number | null, owned?: (name: string) => number): FundingPlan {
  const lines = planLines(items, owned);
  if (coins === null || !Number.isFinite(coins) || coins < 0) {
    return { coins: null, buy: [], later: lines, costBuy: 0, costLater: sum(lines), left: null, short: null };
  }
  const buy: PlanLine[] = [];
  const later: PlanLine[] = [];
  let left = Math.floor(coins);
  let short: FundingPlan['short'] = null;
  let blocked = false;
  for (const tier of [1, 2, 3] as const) {
    const tierLines = lines.filter((l) => l.tier === tier);
    if (!tierLines.length) continue;
    const cost = sum(tierLines);
    if (blocked) { later.push(...tierLines); continue; }
    if (cost <= left) { buy.push(...tierLines); left -= cost; continue; }
    blocked = true;
    short = { tier, by: cost - left };
    if (tier !== 2) {
      for (const l of tierLines) {
        if (l.total <= left) { buy.push(l); left -= l.total; } else later.push(l);
      }
    } else {
      later.push(...tierLines);
    }
  }
  return { coins: Math.floor(coins), buy, later, costBuy: sum(buy), costLater: sum(later), left, short };
}

/** The coins the tiers up to and including `tier` cost: the figure a step's no-sale money goal has to cover. */
export function costThroughTier(items: readonly StepItemRequirement[], tier: 1 | 2 | 3): number {
  return sum(planLines(items).filter((l) => l.tier <= tier));
}
