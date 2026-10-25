// What a training method gives this player per hour: the one entry point the Skills page uses (trainingRouter.personalize), dispatching to the engine
// that models the method - combat (combatRates.ts: melee, Ranged, Magic) or gathering (skillingRates.ts: Woodcutting, Fishing, Mining). Each engine
// answers null when it has nothing honest to say; then the wiki's guide stays.

import type { PlayerState } from './playerState';
import type { PriceView } from './funding/quotes';
import type { TradeRestriction } from './tradeRestriction';
import type { TrainingMethod } from './trainingRouter';
import type { Point } from './travel';
import type { MethodPriority } from './playStyle';
import { combatRate } from './combatRates';
import { gatherRate } from './skillingRates';

/** Where a modelled method is done: the spot the engine picked among the candidates, and what happens with a full bag there. */
export interface RateSpot {
  label: string;
  place: Point & { label: string };
  /** bank - the bank trip pays (bank named); drop - dropping is faster than the walk, or there is no bank on foot. */
  how: 'bank' | 'drop';
  bank?: string;
}

export interface ModelRate {
  /** XP per hour in the trained skill now: the slow and the fast end. */
  xph: [number, number];
  /** Coins an hour the training uses up (arrows broken, runes, bait), at exchange prices; null - no price, or nothing is used up. */
  costPerHour: number | null;
  /** What the cost is spent on, when it is not arrows (Ranged) or runes (Magic): "feathers". */
  costName?: string;
  /** What it was worked out for, in a few words: "Shortbow, Bronze arrows", "Rune axe". */
  basis: string;
  /** Coins an hour from what is banked and sold, when it pays for its time; then xph already has its pickups and bank trips in it. */
  lootPerHour?: number;
  /** What is banked: "Big bones", "Willow logs". */
  loot?: string;
  /** One safety line when the picked spot has NPCs that attack this player (every safer spot was worse or absent). */
  warning?: string;
  /** The spot the engine picked (gathering); absent for the combat engines, whose spot is the method's own. */
  spot?: RateSpot;
}

/** What the trade allows (the exchange and the account) and what the player wants: on the fastest objective nothing is kept that costs time. */
export interface Market { prices?: PriceView | null; restriction?: TradeRestriction['state']; objective?: MethodPriority }

/** The rate of one method for this player in this skill, or null when no engine has anything honest to say. */
export function methodRate(m: TrainingMethod, skill: string, state: PlayerState, market: Market = {}): ModelRate | null {
  return combatRate(m, skill, state, market) ?? gatherRate(m, skill, state, market);
}

/** What the rates depend on, without the position (a step on the map must not recompute every method): levels, mode, items, worn gear. */
export function rateKeyOf(s: PlayerState): string {
  const lv = Object.entries(s.levels).map(([k, v]) => `${k}${v.known ? v.value : '?'}`).sort().join(',');
  const items = s.owned ? [...s.owned.items.entries()].map(([k, o]) => `${k}:${o.carried}/${o.noted}/${o.bank ?? '?'}`).sort().join(';') : '-';
  const eq = Object.entries(s.equipment).map(([k, v]) => `${k}=${v}`).sort().join(',');
  return [s.mode, s.equipmentKnown ? 1 : 0, s.bankSeen ? 1 : 0, lv, eq, items].join('|');
}
