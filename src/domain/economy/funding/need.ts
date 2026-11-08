// What the player is short of, in coins. It is read from the preparation plan the rest of the app already shows (prepPlan.ts) and from the shopping list for the
// whole goal (shopping.ts), never calculated a second time: the lines, the quantities that are still missing after the bag, the bank and the owned marks, the
// timing (now / soon) all come from there. This file only prices them and sorts them into four separate figures:
//   minimum      - what the next trip cannot start without (the lines that are needed now and are missing);
//   recommended  - the minimum plus what the next steps will want soon;
//   objective    - what the whole goal of this step still needs bought (food for every kill left, not for one bag);
//   optional     - upgrades and comforts, kept apart so they never inflate a required total.
// The tiers are nested views of one list, not an addition: the recommended figure already contains the minimum.
// An item whose ownership is unknown (the bank was not opened) is not a shortage: it is counted in `unknown` and never priced.

import type { Step } from '../../../types';
import type { OwnedState } from '../../items/checklist';
import type { PrepLine, PrepPlan } from '../../prep/prepPlan';
import { healsOf } from '../../combat/combatEstimate';
import { allocateFoodStock } from '../../player/foodStock';
import { aggregateShopping, holdingFor } from '../../prep/shopping';
import { purchaseFees } from '../../items/purchaseCost';
import { allocateMaterialStock } from '../../player/materialStock';
import type { PriceStatus, PriceView } from '../../market/quotes';
import { needLines, priceLine, tierOf, type NeedLine, type Tier } from '../../market/needPrice';

const BUYING = new Set(['BUY', 'EARN']);

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
  hitpoints?: number;
}

/**
 * Whether a missing line is something coins buy. The preparation plan names the cheapest *source*, and for an item the item database has no exchange price for
 * (every food, for one) that source can be a monster's drop table - a way to get it, but not the way a player short of food gets it. Such a line is a
 * purchase when the exchange sells the item or it is food: those are on offer at the exchange whatever the guide's drop table says.
 */
function buyable(l: PrepLine, prices: PriceView): boolean {
  if (!l.action || BUYING.has(l.action.kind)) return true;
  if (l.action.kind === 'GATHER' && l.action.acquisition?.kind === 'drop') return prices.buy(l.name) !== null || healsOf(l.name) !== null;
  return false;
}

/**
 * The confirmed shortages of the plan: missing (not merely unchecked), a quantity to get, and obtainable by buying. A line with no action is one the source
 * router found part of in the bag: the rest is still to buy. A line the plan says is gathered, taken from the bank or got during the step is not a purchase.
 */
function shortLines(lines: readonly PrepLine[], prices: PriceView): NeedLine[] {
  return lines
    .filter((l) => l.where === 'MISSING' && (l.toGet ?? 0) > 0 && buyable(l, prices))
    .flatMap((l) => l.action?.purchase?.source === 'shop' && l.action.price !== undefined
      ? [{ key: l.key, name: l.name, qty: l.toGet as number, unit: l.action.price, cost: l.action.price * (l.toGet as number), confidence: 'LOW' as const, priced: 'plan' as const, why: l.why, kind: 'buy' as const }]
      : needLines({ key: l.key, name: l.name, qty: l.toGet as number, fallback: l.action?.price, why: l.why, kind: 'buy' }, l.unit === 'dose', prices));
}

export function buildNeed(i: NeedInput): FundingNeed {
  const { prep, step, prices } = i;
  const now = shortLines(prep.lines.filter((l) => l.timing === 'NOW'), prices);
  const soon = shortLines(prep.lines.filter((l) => l.timing === 'SOON'), prices);
  const recommended = [...now, ...soon.filter((s) => !now.some((n) => n.key === s.key))];

  // The whole goal of this step: the exchange list with the food for every kill left, minus what is owned.
  const list = aggregateShopping([step], { wholeGoal: true });
  const foodStock = allocateFoodStock({ owned: i.owned, manual: i.manual, equipment: {}, bankSeen: i.owned?.bankSeen === true }, list.required, i.hitpoints);
  const materials = allocateMaterialStock({ owned: i.owned, manual: i.manual, equipment: {}, bankSeen: i.owned?.bankSeen === true }, list.required);
  const objective: NeedLine[] = [];
  let objectiveUnknown = 0;
  for (const line of list.required) {
    if (line.inStepOnly) continue;
    const h = holdingFor(line, i.owned, i.manual[line.key], true, i.hitpoints, foodStock.get(line.key), materials.get(line.key));
    // Ownership not observed is not a shortage: it is counted in `unknown` of the next trip, and never priced here.
    if (h.status === 'UNKNOWN' || h.status === 'UNAVAILABLE') { objectiveUnknown++; continue; }
    if (h.buy <= 0) continue;
    objective.push(...needLines({ key: line.key, name: line.nameEn, id: line.id, qty: h.buy, why: line.howToGet, kind: line.reusable ? 'tool' : 'buy' }, Boolean(line.dose), prices));
  }

  const optional: NeedLine[] = prep.optimizations
    .filter((l) => l.where !== 'INVENTORY' && l.where !== 'EQUIPPED' && l.action && (BUYING.has(l.action.kind) || l.action.kind === 'UPGRADE') && (l.action.price ?? 0) > 0)
    .map((l) => priceLine({ key: l.key, name: l.name, qty: Math.max(1, l.count), fallback: l.action?.price, why: l.why, kind: 'upgrade' }, prices));

  return {
    stepId: step.id,
    fees: { now: aggregateShopping([step]).coins + purchaseFees(prep.lines.filter(line => line.timing === 'NOW' && line.where === 'MISSING')
      .map(line => ({ fee: line.action?.purchase?.fee }))), window: prep.coins.need },
    minimum: tierOf(now, prep.lines.filter(l => l.timing === 'NOW' && l.where === 'UNKNOWN').length),
    recommended: tierOf(recommended, prep.lines.filter(l => (l.timing === 'NOW' || l.timing === 'SOON') && l.where === 'UNKNOWN').length),
    objective: tierOf(objective, objectiveUnknown),
    optional: tierOf(optional),
    unknown: prep.lines.filter((l) => (l.timing === 'NOW' || l.timing === 'SOON') && l.where === 'UNKNOWN').length,
    priceStatus: prices.status,
  };
}
