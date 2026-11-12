// Whether a better tool or weapon is worth buying for the training in hand: the hours it saves over the XP it will serve, less the trip to buy
// it, against its price. The router (trainingRouter.adviseTraining) asks it for the selected method; the stock-up forecast asks it per leg.
import type { GameMode } from '../../types';
import type { MethodPriority } from '../persistence/methodPriority';
import type { PriceView } from '../market/quotes';
import { toolUse } from '../items/toolTiers';
import { xpForLevel } from '../player/xp';
import { EXCHANGE, TILES_PER_SECOND, dist, type Point } from '../travel/travel';
import { BANK_SECONDS } from '../travel/bankTrip';
import { isUnderground } from '../travel/map';
import { toolReplacedAt } from './stages';
import type { MethodNeed, TrainingMethod } from './trainingRouter';

export interface ToolUpgrade { tool: string; price: number; hours: number; /** Net consumable savings after the purchase when the benefit is coins instead of meaningful time. */ coinsSaved?: number; /** The player's coins when they are known and fall short of the price. */ short?: number;
  /** Missing next-trip supplies, not the price of an entire future goal. null means stock/prices are unchecked. */ kitCost?: number | null;
  /** Known coins after reserving the kit, when that leaves too little for this optional purchase. */ afterKit?: number;
  /** Physical supplies resolved by the same model that evaluated the proposed equipment. */ needs?: MethodNeed[];
}
/**
 * The XP a better tool would serve: an axe or pickaxe tier keeps working after this method and after this checkpoint, until the path plans the
 * next tier (toolReplacedAt; the last tier of the mode, to the goal). Other upgrades (a weapon, a staff) are weighed on the current method only.
 */
export function upgradeXp(tool: string, skill: string, mode: GameMode, xpNow: number, methodXp: number, target: number): number {
  const use = toolUse(tool);
  if (!use || use.skill !== skill) return methodXp;
  return Math.max(0, xpForLevel(toolReplacedAt(tool, mode) ?? target) - xpNow);
}

/** Hours a better tool must save to the goal to be worth a line. */
const UPGRADE_MIN_HOURS = 1 / 6;
/**
 * The better tool worth buying for the XP left, or null. Fastest: the one that saves the most time (its price is shown; coins do not trade against
 * time). Balanced: the one whose hours saved, valued at the coin baseline (lootValue.coinsPerMinute), beat its price by the most; without prices
 * nothing is weighed. Relaxed: none. Only pass XP assigned to this method; another method need not benefit from the same tool.
 */
export function toolUpgrade(m: TrainingMethod, xpFor: number | ((tool: string) => number), priority: MethodPriority, coinRate: number | null,
  acquisition: number | ((tool: string) => number) = 0): ToolUpgrade | null {
  if (!m.upgrades?.length || !m.xph || priority === 'profit') return null;
  // personalize rounds displayed rates; compare both sides at that same precision to avoid a false negative saving.
  const mid = (x: readonly [number, number]) => (Math.round(x[0]) + Math.round(x[1])) / 2;
  let best: ToolUpgrade | null = null;
  let bestScore = -Infinity;
  for (const u of m.upgrades) {
    const xpLeft = typeof xpFor === 'number' ? xpFor : xpFor(u.tool);
    if (!(xpLeft > 0)) continue;
    const now = xpLeft / mid(m.xph);
    const trainingSaved = now - xpLeft / mid(u.xph);
    const hours = trainingSaved - Math.max(0, typeof acquisition === 'number' ? acquisition : acquisition(u.tool));
    const baseCost = m.costPerHour === undefined ? (m.cost === 'cost' ? null : 0) : m.costPerHour;
    const upgradeCost = u.costPerHour === undefined ? (baseCost === 0 ? 0 : null) : u.costPerHour;
    const costsKnown = baseCost !== null && upgradeCost !== null;
    const costSaved = (baseCost ?? 0) * now - (upgradeCost ?? 0) * (xpLeft / mid(u.xph));
    const timeBenefit = hours >= UPGRADE_MIN_HOURS;
    const netSaved = costsKnown ? costSaved - u.price : null;
    if (trainingSaved < 0 || (!timeBenefit && !(priority === 'balanced' && netSaved !== null && netSaved > 0))) continue;
    const score = priority === 'fastest' ? hours : costsKnown ? (coinRate ? hours * 60 * coinRate : 0) + costSaved - u.price : -Infinity;
    if (score <= 0 || score <= bestScore) continue;
    bestScore = score;
    best = { tool: u.tool, price: u.price, hours, ...(u.needs ? { needs: u.needs } : {}), ...(!timeBenefit && netSaved !== null ? { coinsSaved: netSaved } : {}) };
  }
  return best;
}

/**
 * Hours to fetch a tool the exchange quotes: from the training spot on foot and back (the shared tile model at the planner's typical pace, one
 * exchange visit, as preparationTime). An unknown or underground spot, an unquoted tool or a trip already paid for keeps the allowance.
 */
export function purchaseTripHours(at: Point | undefined, tool: string, prices: PriceView | null | undefined, allowance: number): number {
  if (!allowance || !at || at.plane !== EXCHANGE.plane || isUnderground(at) || !prices?.buy(tool)) return allowance;
  return ((2 * dist(at, EXCHANGE) / TILES_PER_SECOND) * 1.5 + (BANK_SECONDS[0] + BANK_SECONDS[1]) / 2) / 3600;
}

/** "25 min", "1.5 h": the hours an upgrade saves, as the router and the training card say them. */
export const hoursText = (h: number) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : `${h < 10 ? Math.round(h * 10) / 10 : Math.round(h)} h`);
