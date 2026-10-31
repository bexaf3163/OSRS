// What a training method gives this player per hour: the one entry point the Skills page uses (trainingRouter.personalize), dispatching to the engine
// that models the method - combat (combatRates.ts: melee, Ranged, Magic) or gathering (skillingRates.ts: Woodcutting, Fishing, Mining). Each engine
// answers null when it has nothing honest to say; then the wiki's guide stays.

import { coinsOf, type PlayerState } from './playerState';
import type { PriceView } from './funding/quotes';
import type { TradeRestriction } from './tradeRestriction';
import type { TrainingMethod, MethodNeed } from './trainingRouter';
import type { Point } from './travel';
import type { MethodPriority } from './playStyle';
import { combatRate } from './combatRates';
import { gatherRate } from './skillingRates';
import { processRate } from './processingRates';

/** Where a modelled method is done: the spot the engine picked among the candidates, and what happens with a full bag there. */
export interface RateSpot {
  label: string;
  /** Scene objects at the selected station; existing entrance/access hints remain available. */
  objectNames?: string[];
  place: Point & { label: string };
  /** The way to a spot under the ground: its entrance first, then the spot (the plugin's path and the bank trip follow it). */
  waypoints?: (Point & { label?: string })[];
  /** bank - the bank trip pays (bank named); drop - dropping is faster than the walk, or there is no bank on foot. */
  how: 'bank' | 'drop';
  bank?: string;
}

export interface ModelRate {
  /** A concrete recipe when a catalogue method spans several products. */
  methodName?: string;
  /** XP per hour in the trained skill now: the slow and the fast end. */
  xph: [number, number];
  /** Coins an hour the training uses up (arrows broken, runes, bait, food), at exchange prices; 0 - nothing is used up; null - used up, price unknown. */
  costPerHour: number | null;
  /** Expected XP per input action, including failed/burnt attempts when relevant. */
  xpPerAction?: number;
  /** Physical supplies for the recipe actually selected by the model. */
  needs?: MethodNeed[];
  /** Selected recipe ingredients must not regain substitutes from a different recipe. */
  exactNeeds?: boolean;
  /** Executable initial processing actions, not supplies for the entire goal. */
  batchActions?: number;
  /** Physical inputs per modelled XP action; reusable tools/staff are excluded. */
  consumables?: { name: string; qty: number; anyOf?: string[] }[];
  /** What the cost is spent on, when it is not arrows (Ranged) or runes (Magic): "feathers". */
  costName?: string;
  /** What it was worked out for, in a few words: "Shortbow, Bronze arrows", "Rune axe". */
  basis: string;
  /** The exact usable tool selected by the gathering model, not text parsed from its display basis. */
  selectedTool?: string;
  /** Coins an hour from what is banked and sold, when it pays for its time; then xph already has its pickups and bank trips in it. */
  lootPerHour?: number;
  /** What is banked: "Big bones", "Willow logs". */
  loot?: string;
  /** One safety line when the picked spot has NPCs that attack this player (every safer spot was worse or absent). */
  warning?: string;
  /** The spot the engine picked (gathering); absent for the combat engines, whose spot is the method's own. */
  spot?: RateSpot;
  /** Better tools the player could buy, with the price and the rate each would give here (gathering): weighed by the caller over the hours left. */
  upgrades?: { tool: string; price: number; xph: [number, number]; costPerHour?: number | null; needs?: MethodNeed[] }[];
}

/** What the trade allows (the exchange and the account) and what the player wants: on the fastest objective nothing is kept that costs time. */
export interface Market { prices?: PriceView | null; restriction?: TradeRestriction['state']; objective?: MethodPriority }

/** The rate of one method for this player in this skill, or null when no engine has anything honest to say. */
export function methodRate(m: TrainingMethod, skill: string, state: PlayerState, market: Market = {}): ModelRate | null {
  return combatRate(m, skill, state, market) ?? gatherRate(m, skill, state, market) ?? processRate(m, skill, state, market);
}

/** What the rates depend on, without the position (a step on the map must not recompute every method): levels, mode, items, worn quantities, coins and unlock proofs. */
export function rateKeyOf(s: PlayerState): string {
  const lv = Object.entries(s.levels).map(([k, v]) => `${k}${v.known ? v.value : '?'}`).sort().join(',');
  const items = s.owned ? [...s.owned.items.entries()].map(([k, o]) => `${k}:${o.carried}/${o.noted}/${o.bank ?? '?'}/${o.legacyToolCount ? 'legacy' : 'exact'}`).sort().join(';') : '-';
  const eq = Object.entries(s.equipment).map(([k, v]) => `${k}=${v}`).sort().join(',');
  const cash = coinsOf(s);
  const quests = s.quests?.known ? JSON.stringify([...s.quests.value].sort()) : '?';
  const counts = s.equipmentItems?.map(i => `${i.name}:${i.count ?? '?'}`).sort().join(',') ?? '?';
  const manual = Object.entries(s.manual ?? {}).sort(([a], [b]) => a.localeCompare(b));
  return [s.mode, s.equipmentKnown ? 1 : 0, s.bankSeen ? 1 : 0, lv, eq, items, cash.bag ?? '?', cash.bank ?? '?', quests, counts, JSON.stringify(manual)].join('|');
}
