// What a training method gives this player per hour: the one entry point the Skills page uses (trainingRouter.personalize), dispatching to the engine
// that models the method - combat (combatRates.ts: melee, Ranged, Magic) or gathering (skillingRates.ts: Woodcutting, Fishing, Mining). Each engine
// answers null when it has nothing honest to say; then the wiki's guide stays.

import { coinsOf, type PlayerState } from '../player/playerState';
import type { PriceView } from '../market/quotes';
import type { TradeRestriction } from '../market/tradeRestriction';
import type { TrainingMethod, MethodNeed } from './trainingRouter';
import type { Point } from '../travel/travel';
import type { Consumption } from '../items/consumption';
import { combatRate } from '../combat/combatRates';
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
  /** Expected inputs per XP action; initialReserve covers an unread partly used first unit. Tools/staff are excluded. */
  consumables?: (Consumption & { name: string; anyOf?: string[] })[];
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

/** What the trade allows: the exchange prices and the account's trade restriction. */
export interface Market { prices?: PriceView | null; restriction?: TradeRestriction['state'] }

/** The rate of one method for this player in this skill, or null when no engine has anything honest to say. */
export function methodRate(m: TrainingMethod, skill: string, state: PlayerState, market: Market = {}): ModelRate | null {
  return combatRate(m, skill, state, market) ?? gatherRate(m, skill, state, market) ?? processRate(m, skill, state, market);
}

// Planning copies a state per level (atLevel) but shares its items, gear and quests, so each part's text is kept per object, and the
// whole key becomes a short number: method caches then compare a few characters instead of the bank's contents (route gate profile).
// shortcut: a state part must not be changed in place after it was keyed; replace with explicit versions if the store ever mutates parts.
const partIds = new WeakMap<object, string>();
const textIds = new Map<string, string>();
const part = <T extends object>(o: T, text: (o: T) => string): string => {
  let id = partIds.get(o);
  if (id === undefined) {
    const t = text(o);
    id = textIds.get(t);
    if (id === undefined) textIds.set(t, id = `p${textIds.size}`);
    partIds.set(o, id);
  }
  return id;
};
const stateIds = new Map<string, string>();
const stateKeys = new WeakMap<PlayerState, string>();

/** What the rates depend on, without the position (a step on the map must not recompute every method): levels, mode, items, worn quantities, coins and unlock proofs. */
export function rateKeyOf(s: PlayerState): string {
  const kept = stateKeys.get(s);
  if (kept !== undefined) return kept;
  const lv = part(s.levels, l => Object.entries(l).map(([k, v]) => `${k}${v.known ? v.value : '?'}`).sort().join(','));
  const items = s.owned ? part(s.owned.items, m => [...m.entries()].map(([k, o]) => `${k}:${o.carried}/${o.noted}/${o.bank ?? '?'}/${o.legacyToolCount ? 'legacy' : 'exact'}`).sort().join(';')) : '-';
  const eq = part(s.equipment, e => Object.entries(e).map(([k, v]) => `${k}=${v}`).sort().join(','));
  const cash = coinsOf(s);
  const quests = s.quests?.known ? part(s.quests.value, q => JSON.stringify([...q].sort())) : '?';
  const counts = s.equipmentItems ? part(s.equipmentItems, l => l.map(i => `${i.name}:${i.count ?? '?'}`).sort().join(',')) : '?';
  const manual = s.manual ? part(s.manual, m => JSON.stringify(Object.entries(m).sort(([a], [b]) => a.localeCompare(b)))) : '[]';
  const full = [s.mode, s.equipmentKnown ? 1 : 0, s.bankSeen ? 1 : 0, lv, eq, items, cash.bag ?? '?', cash.bank ?? '?', quests, counts, manual].join('|');
  let id = stateIds.get(full);
  if (id === undefined) stateIds.set(full, id = `s${stateIds.size}`);
  stateKeys.set(s, id);
  return id;
}
