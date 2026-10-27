// A cheaper way to cover the same need, checked before any money is earned. Today that is food: the route names the food it wants and the substitutes it
// accepts (`anyOf`), and a different one may cost fewer coins for the same health. The amount of health the plan needs is the combat model's (it is in the
// plan's quantity times the food's healing); this file only re-expresses it in another food. Nothing is substituted silently: it is an option the player accepts.
//
// What it will not do: swap a food the step does not accept, use more pieces than the bag holds, or call a difference of a few coins an improvement.

import type { Step } from '../../types';
import { healsOf } from '../combatEstimate';
import { effectiveHeal } from '../foodAdvice';
import type { NeedLine } from './need';
import { minConfidence, type Confidence, type PriceView } from './quotes';

/** Food slots in the bag (28 less the weapon and two for potions or loot, as the combat model assumes). */
export const FOOD_SLOTS = 26;
/** A saving smaller than this share and this many coins is not worth a change of plan. */
export const MIN_SAVING_SHARE = 0.1;
export const MIN_SAVING_GP = 20;

export interface CheaperOption {
  from: string;
  to: string;
  /** Pieces of the substitute that give the same health (rounded up). */
  pieces: number;
  cost: number;
  was: number;
  saves: number;
  /** Health the plan needs, so the reader can check the arithmetic. */
  health: number;
  /** The saving depends on both the original and replacement purchase quotes. */
  confidence: Confidence;
}

export function cheaperSupply(step: Pick<Step, 'itemsRequired'>, lines: readonly NeedLine[], prices: PriceView, hitpoints?: number): CheaperOption | null {
  const food = (step.itemsRequired ?? []).find((i) => typeof i.heals === 'number');
  if (!food) return null;
  const line = lines.find((l) => l.name === food.nameEn && l.cost !== null);
  if (!line || line.qty <= 0 || line.cost === null) return null;
  const health = line.qty * effectiveHeal({ heals: food.heals as number }, hitpoints);
  let best: CheaperOption | null = null;
  for (const name of food.anyOf ?? []) {
    const heals = healsOf(name);
    const quote = prices.buy(name);
    if (heals === null || quote === null) continue;
    const pieces = Math.ceil(health / effectiveHeal({ heals }, hitpoints));
    if (pieces > FOOD_SLOTS) continue;
    const cost = pieces * quote.price;
    const saves = line.cost - cost;
    if (saves < MIN_SAVING_GP || saves < line.cost * MIN_SAVING_SHARE) continue;
    if (!best || cost < best.cost) best = { from: food.nameEn, to: name, pieces, cost, was: line.cost, saves, health,
      confidence: minConfidence(line.confidence ?? 'LOW', quote.confidence) };
  }
  return best;
}
