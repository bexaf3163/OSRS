// How a plan weighs one method against another: its practical speed, its coins, the plus-or-zero rule and the player's training goal.
// The router's comparison reads these; the rate engines stay goal-free (owner, 2026-11-23: engines, not condition trees).
import type { GameMode, TrainingGoal } from '../../types';
import type { PlayerState } from '../player/playerState';
import { dropValue, losing } from '../market/lootValue';
import { supplyPrice } from '../market/itemPrice';
import type { PriceView } from '../market/quotes';
import type { TradeRestriction } from '../market/tradeRestriction';
import type { Effort, MethodCost, Risk, TrainingMethod } from './trainingRouter';

/** For ordering we take the lower speed bound: the wiki's upper one often needs special tricks (ticks, inventory). */
export const rateLow = (m: TrainingMethod): number | null => (m.xph ? m.xph[0] : null);

/** How much of its listed speed a method keeps in practice: attention it needs, materials it costs and risk it carries (2.69, "balanced"). */
const EFFORT_FACTOR: Record<Effort, number> = { afk: 1, low: 1, medium: 0.9, high: 0.6 };
const COST_FACTOR: Record<MethodCost, number> = { profit: 1, free: 1, cost: 0.85 };
const RISK_FACTOR: Record<Risk, number> = { none: 1, low: 0.95, high: 0.5 };

/** The practical XP per hour of a method: the wiki's lower bound, less what attention, materials and risk take from it. null - no speed listed. */
export function practicalRate(m: TrainingMethod): number | null {
  const r = rateLow(m);
  return r === null ? null : r * EFFORT_FACTOR[m.effort] * COST_FACTOR[m.cost] * RISK_FACTOR[m.risk];
}

/** Coins an hour a method nets (banked less used up), or null when what it uses up has no known price. */
export function netCoinsPerHour(m: TrainingMethod): number | null {
  if (m.costPerHour === null || (m.costPerHour === undefined && m.cost === 'cost')) return null;
  if (m.costPerHour === undefined && m.cost === 'profit' && m.lootPerHour === undefined) return null;
  return (m.lootPerHour ?? 0) - (m.costPerHour ?? 0);
}

/**
 * An activity no rate model covers (a minigame, a rooftop course) with the coins of what the Wiki says it uses and makes in an hour
 * (`perHour`), at exchange prices; unchanged when it has no such data or a price is unknown, so its coins stay uncounted.
 */
export function withHourlyCoins(m: TrainingMethod, prices: PriceView | null | undefined, mode: GameMode, restriction?: TradeRestriction['state']): TrainingMethod {
  if (!m.perHour) return m;
  const fixed = m.perHour.coins ?? 0;
  let cost = Math.max(0, -fixed), loot = Math.max(0, fixed);
  for (const u of m.perHour.uses ?? []) {
    const each = supplyPrice(u.name, prices, mode);
    if (each === null) return m;
    cost += each * u.qty;
  }
  for (const x of m.perHour.makes ?? []) {
    const each = dropValue(x.name, prices, restriction);
    if (each === null) return m;
    loot += each * x.qty;
  }
  return { ...m, costPerHour: Math.round(cost), lootPerHour: Math.round(loot), marketNetPerHour: Math.round(loot - cost) };
}

/** A known loss of coins against a known break-even or gain, both weighed against the coin rate; without prices nothing is judged. */
export const losesTo = (loser: TrainingMethod, other: TrainingMethod, coinRate: number | null): boolean => {
  if (loser.coinsUnknown || other.coinsUnknown) return false;
  const a = loser.marketNetPerHour ?? netCoinsPerHour(loser), b = other.marketNetPerHour ?? netCoinsPerHour(other);
  return a !== null && b !== null && losing(a, coinRate) && !losing(b, coinRate);
};

/**
 * The player's training goal (owner, 2026-11-23): one row per goal, read only by the method choice. `score` ranks two methods from their
 * hours to the goal, those hours' worth in coins (balanced) and their market coins an hour (null unless both sides are known): lower wins,
 * and within 5% of the smaller `scale` they tie. `measure` is what a method in hand must lose by before a plan or a running session
 * leaves it. Every goal keeps the plus-or-zero rule, which comes first.
 */
export const GOALS: Record<TrainingGoal, {
  score: (hours: number, worth: number, coins: number | null) => { score: number; scale: number };
  measure: (m: TrainingMethod) => number | null;
}> = {
  xp: { score: (hours) => ({ score: hours, scale: hours }), measure: practicalRate },
  balanced: { score: (hours, worth) => ({ score: hours - worth, scale: hours }), measure: practicalRate },
  coins: {
    score: (hours, _worth, coins) => (coins === null ? { score: hours, scale: hours } : { score: -coins, scale: Math.abs(coins) }),
    measure: (m) => m.marketNetPerHour ?? netCoinsPerHour(m),
  },
};
export const goalOf = (state: PlayerState, skill: string): TrainingGoal => state.goals?.[skill] ?? 'balanced';
/** The method in hand stays unless the new one beats it on the goal's measure by `gain` (1.1: 10% better). */
export const stays = (goal: TrainingGoal, held: TrainingMethod, next: TrainingMethod, gain: number): boolean => {
  const now = GOALS[goal].measure(held), then = GOALS[goal].measure(next);
  return now !== null && then !== null && then - now < Math.abs(now) * (gain - 1);
};
