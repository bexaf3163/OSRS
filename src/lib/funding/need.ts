// What the player is short of, in coins. It is read from the preparation plan the rest of the app already shows (prepPlan.ts) and from the shopping list for the
// whole goal (shopping.ts), never calculated a second time: the lines, the quantities that are still missing after the bag, the bank and the owned marks, the
// timing (now / soon) all come from there. This file only prices them and sorts them into four separate figures:
//   minimum      - what the next trip cannot start without (the lines that are needed now and are missing);
//   recommended  - the minimum plus what the next steps will want soon;
//   objective    - what the whole goal of this step still needs bought (food for every kill left, not for one bag);
//   optional     - upgrades and comforts, kept apart so they never inflate a required total.
// The tiers are nested views of one list, not an addition: the recommended figure already contains the minimum.
// An item whose ownership is unknown (the bank was not opened) is not a shortage: it is counted in `unknown` and never priced.

import type { Step } from '../../types';
import type { OwnedState } from '../checklist';
import type { PrepLine, PrepPlan } from '../prepPlan';
import { healsOf } from '../combatEstimate';
import { aggregateShopping, holdingFor } from '../shopping';
import { doseKind, dosePackage } from '../doses';
import { evaluate, type Requirement } from '../requirements';
import type { PlayerState } from '../playerState';
import { nameKey } from '../checklist';
import type { Confidence, PriceStatus, PriceView } from './quotes';

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

export interface Tier { cost: number; unpriced: number; lines: NeedLine[] }

export interface FundingNeed {
  stepId: string;
  /** Coins that must be paid (fares, an NPC's fee): this step's own, and those of every step in the preparation window. */
  fees: { now: number; window: number };
  minimum: Tier;
  recommended: Tier;
  objective: Tier;
  optional: Tier;
  /** Lines of the next trip whose ownership is not known: not counted as shortages. */
  unknown: number;
  priceStatus: PriceStatus;
}

export interface NeedInput {
  step: Step;
  prep: PrepPlan;
  prices: PriceView;
  owned: OwnedState | null;
  manual: Record<string, number>;
}

const BUYING = new Set(['BUY', 'EARN']);

function priceLine(
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
function needLines(
  l: { key: string; name: string; id?: number; qty: number; fallback?: number; why: string; kind: NeedKind }, doses: boolean, prices: PriceView,
): NeedLine[] {
  const pack = doses ? dosePackage(l.name, l.qty, (n) => prices.buy(n)?.price ?? null) : null;
  if (!pack) return [priceLine(l, prices)];
  return pack.lines.map((p) => priceLine({ key: `${l.key}#${p.size}`, name: p.name, qty: p.count, why: l.why, kind: l.kind }, prices));
}

const tierOf = (lines: NeedLine[]): Tier => ({
  cost: lines.reduce((s, l) => s + (l.cost ?? 0), 0),
  unpriced: lines.filter((l) => l.cost === null).length,
  lines,
});

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

/**
 * Whether a missing line is something coins buy. The preparation plan names the cheapest *source*, and for an item the item database has no exchange price for
 * (every food, for one) that source can be a monster's drop table - a way to get it, but not the way a player short of food gets it. Such a line is a
 * purchase when the exchange sells the item or it is food: those are on offer at the exchange whatever the guide's drop table says.
 */
function buyable(l: PrepLine, prices: PriceView): boolean {
  if (!l.action || BUYING.has(l.action.kind)) return true;
  if (l.action.kind === 'GATHER' && /^Dropped by /.test(l.action.label)) return prices.buy(l.name) !== null || healsOf(l.name) !== null;
  return false;
}

/**
 * The confirmed shortages of the plan: missing (not merely unchecked), a quantity to get, and obtainable by buying. A line with no action is one the source
 * router found part of in the bag: the rest is still to buy. A line the plan says is gathered, taken from the bank or got during the step is not a purchase.
 */
function shortLines(lines: readonly PrepLine[], prices: PriceView): NeedLine[] {
  return lines
    .filter((l) => l.where === 'MISSING' && (l.toGet ?? 0) > 0 && buyable(l, prices))
    .flatMap((l) => needLines({ key: l.key, name: l.name, qty: l.toGet as number, fallback: l.action?.price, why: l.why, kind: 'buy' }, l.unit === 'dose', prices));
}

export function buildNeed(i: NeedInput): FundingNeed {
  const { prep, step, prices } = i;
  const now = shortLines(prep.lines.filter((l) => l.timing === 'NOW'), prices);
  const soon = shortLines(prep.lines.filter((l) => l.timing === 'SOON'), prices);
  const recommended = [...now, ...soon.filter((s) => !now.some((n) => n.key === s.key))];

  // The whole goal of this step: the exchange list with the food for every kill left, minus what is owned.
  const list = aggregateShopping([step], { wholeGoal: true });
  const objective: NeedLine[] = [];
  for (const line of list.required) {
    if (line.inStepOnly) continue;
    const h = holdingFor(line, i.owned, i.manual[line.key]);
    // Ownership not observed is not a shortage: it is counted in `unknown` of the next trip, and never priced here.
    if (h.status === 'UNKNOWN' || h.status === 'UNAVAILABLE' || h.buy <= 0) continue;
    objective.push(...needLines({ key: line.key, name: line.nameEn, id: line.id, qty: h.buy, why: line.howToGet, kind: line.reusable ? 'tool' : 'buy' }, Boolean(line.dose), prices));
  }

  const optional: NeedLine[] = prep.optimizations
    .filter((l) => l.where !== 'INVENTORY' && l.where !== 'EQUIPPED' && l.action && (BUYING.has(l.action.kind) || l.action.kind === 'UPGRADE') && (l.action.price ?? 0) > 0)
    .map((l) => priceLine({ key: l.key, name: l.name, qty: Math.max(1, l.count), fallback: l.action?.price, why: l.why, kind: 'upgrade' }, prices));

  return {
    stepId: step.id,
    fees: { now: aggregateShopping([step]).coins, window: prep.coins.need },
    minimum: tierOf(now),
    recommended: tierOf(recommended),
    objective: tierOf(objective),
    optional: tierOf(optional),
    unknown: prep.lines.filter((l) => (l.timing === 'NOW' || l.timing === 'SOON') && l.where === 'UNKNOWN').length,
    priceStatus: prices.status,
  };
}
