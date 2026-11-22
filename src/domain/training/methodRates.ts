// What a training method gives this player per hour: the one entry point the Skills page uses (trainingRouter.personalize), dispatching to the engine
// that models the method - combat (combatRates.ts: melee, Ranged, Magic) or gathering (skillingRates.ts: Woodcutting, Fishing, Mining). Each engine
// answers null when it has nothing honest to say; then the wiki's guide stays.

import { coinsOf, type PlayerState } from '../player/playerState';
import { nameKey } from '../items/itemKey';
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
  /** Coins an hour at market prices, without the planning margin: what methods are ranked by (processRates). */
  marketNetPerHour?: number;
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

/** The owned items one skill's training reads, by name key. */
export interface ItemScope { id: string; has: (key: string) => boolean }
const scopedKeys = new WeakMap<PlayerState, Map<string, string>>();
/** rateKeyOf with only the scope's owned items: states that differ in other items (a log chopped while training Attack) share
 * training forecasts. Levels, quests, coins and worn gear stay whole. */
export function scopedRateKeyOf(s: PlayerState, scope: ItemScope): string {
  let byScope = scopedKeys.get(s);
  if (!byScope) scopedKeys.set(s, byScope = new Map());
  let id = byScope.get(scope.id);
  if (id === undefined) {
    let rest = restKeys.get(s);
    if (rest === undefined) restKeys.set(s, rest = rateKeyOf({ ...s, owned: s.owned && { ...s.owned, items: NO_ITEMS } }));
    const full = `${scope.id}|${rest}|${s.owned ? scopedItemsOf(s.owned.items, scope) : '-'}`;
    id = scopedIds.get(full);
    if (id === undefined) {
      // Ids keep counting after a clear, so a key never takes an id another key's cached result still holds.
      if (scopedIds.size > 200_000) scopedIds.clear();
      scopedIds.set(full, id = `k${nextScopedId++}`);
    }
    byScope.set(scope.id, id);
  }
  return id;
}
/** The route gate sets verify: every reused scoped result is then recomputed and any difference fails (an item the scope missed). */
export const scopeCheck = { verify: false };
/** A result kept by an item-scoped key (scopedRateKeyOf). shortcut: callers must not change a returned value in place. */
export function scopedMemo<T>(cache: Map<string, { out: T; state?: PlayerState }>, key: string, state: PlayerState, label: string, fresh: () => T, cap = 100_000): T {
  const kept = cache.get(key);
  if (kept && !scopeCheck.verify) return kept.out;
  const out = fresh();
  if (kept && JSON.stringify(kept.out) !== JSON.stringify(out)) {
    const items = (s?: PlayerState) => new Map([...s?.owned?.items ?? []].map(([k, o]) => [k, `${o.carried}/${o.noted}/${o.bank}`]));
    const a = items(kept.state), b = items(state);
    throw new Error(`${label}: the item scope misses one of ${[...new Set([...a.keys(), ...b.keys()])].filter(k => a.get(k) !== b.get(k)).join(', ')}`);
  }
  // A checked entry holds its whole state, so far fewer are kept.
  if (cache.size > (scopeCheck.verify ? Math.min(cap, 2_000) : cap)) cache.clear();
  if (!kept) cache.set(key, { out, ...(scopeCheck.verify ? { state } : {}) });
  return out;
}
const NO_ITEMS: NonNullable<PlayerState['owned']>['items'] = new Map();
const restKeys = new WeakMap<PlayerState, string>();
const scopedIds = new Map<string, string>();
let nextScopedId = 0;
// Projected states often share one item map: it is sorted once, and each name is tested against a scope once.
const sortedItems = new WeakMap<object, [string, string][]>();
const scopedItems = new WeakMap<object, Map<string, string>>();
const scopeTests = new Map<string, Map<string, boolean>>();
const itemListIds = new Map<string, string>();
let nextItemListId = 0;
function scopedItemsOf(items: NonNullable<PlayerState['owned']>['items'], scope: ItemScope): string {
  let byScope = scopedItems.get(items);
  if (!byScope) scopedItems.set(items, byScope = new Map());
  let out = byScope.get(scope.id);
  if (out !== undefined) return out;
  let sorted = sortedItems.get(items);
  if (!sorted) sortedItems.set(items, sorted = [...items].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, o]) => [k, `${k}:${o.carried}/${o.noted}/${o.bank ?? '?'}${o.legacyToolCount ? 'legacy' : 'exact'}`]));
  let tests = scopeTests.get(scope.id);
  if (!tests) scopeTests.set(scope.id, tests = new Map());
  const inScope = (k: string) => { let v = tests!.get(k); if (v === undefined) tests!.set(k, v = scope.has(nameKey(k))); return v; };
  // A fight's scope lists hundreds of gear rows: the key holds a short id for the list, from a bounded table that never reuses one.
  const text = sorted.filter(([k]) => inScope(k)).map(([, row]) => row).join(';');
  out = itemListIds.get(text);
  if (out === undefined) {
    if (itemListIds.size > 20_000) itemListIds.clear();
    itemListIds.set(text, out = `i${nextItemListId++}`);
  }
  byScope.set(scope.id, out);
  return out;
}
