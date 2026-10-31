// The processing engine (2.79): one rate model for every skill that turns materials into a product at a station — Smithing at an anvil, Crafting at a
// furnace or by a bank, Cooking at a fire. A recipe is the wiki's own (data/processing.json, built by scripts/build-processing.ts): level, XP, ticks at the
// Make-X pace, tools, materials, output, success chance. The rate is the actions a bag allows between bank trips, each at the recipe's ticks, plus the
// trip to the bank (the wiki's distance from a furnace or anvil; the walk from a fire), times the chance it succeeds. Materials are a cost at their
// price, the product a gain at its sale value after tax; a recipe, station or account rule added to the data reaches every method that lists it.

import processingJson from '../data/processing.json';
import { bankTrip, tripMinutes } from './bankTrip';
import { skillChance } from './skillChance';
import { coinsPerMinute, coinTimeShare, dropValue, earningsOrder, netEarnings } from './lootValue';
import { coinsOf, heldOf, levelOf, type PlayerState } from './playerState';
import { itemRequirement } from './requirements';
import { requirementCost } from './funding/need';
import { isRestrictedItem } from './tradeRestriction';
import { supplyPrice } from './sourceRouter';
import { matchStrict } from '../services/locationResolver';
import { canWear, gearPieceByName } from '../services/gearAdvisor';
import type { Market, ModelRate, RateSpot } from './methodRates';
import type { TrainingMethod, MethodNeed } from './trainingRouter';
import type { Point } from './travel';

type Facility = 'furnace' | 'anvil' | 'fire' | 'altar';
interface Station { objectNames?: string[]; kind: Facility; label: string; place: Point & { label: string }; bankTiles?: number; bank?: string; members: boolean; entry?: Point; portal?: Point }
import { actionsForQuantity, quantityForActions, type Consumption } from './consumption';

interface Recipe {
  id: string; skill: string; level: number; xp: number; ticks: number; facility: Facility | null; tools: string[];
  /** output: null - nothing kept (logs burnt). retry: a failed attempt keeps the material and costs only its time (lighting a log). */
  inputs: (Consumption & { name: string; stacks: boolean; staff?: string; anyOf?: string[] })[]; output: { name: string; qty: number } | null; retry?: boolean;
  /** The skilling success formula's low and high (cooking: the food is not burnt), or a flat chance (an iron bar); neither - always. */
  success?: { low: number; high: number }; chance?: number; members?: boolean;
  /** Plan-specific batch size and one shared wait after the batch, not a delay on every input. */
  batchSize?: number; batchWaitTicks?: number;
  requires?: { skill: string; level: number }[];
  source?: string;
  wholeBatch?: boolean; multiplierEvery?: number; access?: { carried: string; equipped: string }; station?: string;
}
/** The processing registry: data/processing.json in the app; a test may pass its own (synthetic content never enters the app's data). */
export interface ProcessingRegistry { stations: Station[]; recipes: Recipe[]; methods: Record<string, string[]> }

export const PROCESSING = processingJson as unknown as ProcessingRegistry;

const TICK = 0.6;
const BAG = 28;
/** The margin at the slow end: misclicks, a dialogue to confirm, attention elsewhere. */
const MARGIN = 0.1;
/**
 * Seconds at the bank on a processing trip (deposit the products, withdraw the next materials), fast and slow. Calibrated against the wiki's own
 * guide rates, which the tests hold the model to: steel platebodies at the Varrock West anvil "150,000 Smithing XP per hour constantly running", gold
 * rings at the Edgeville furnace 1,350 an hour (Free-to-play Smithing / Crafting training). A fighter's visit (food, loot) is longer: bankTrip.ts.
 */
const BANK_VISIT: [number, number] = [3, 15];

/** Where the recipe is made and the minutes of one bank trip from there: a station of its kind, or (no facility) by the bank itself. */
function placesFor(r: Recipe, state: PlayerState, reg: ProcessingRegistry): { spot: RateSpot | null; trip: [number, number] }[] {
  if (!r.facility) return [{ spot: null, trip: tripMinutes(0, 0, BANK_VISIT) }];
  return reg.stations.filter((s) => s.kind === r.facility && (!r.station || r.station === s.label) && !(s.members && state.mode !== 'members')).flatMap((s) => {
    const walk = s.bankTiles !== undefined ? { minutes: tripMinutes(s.bankTiles, 0, BANK_VISIT), bank: undefined } : s.bank ? bankTrip({ place: s.place, bank: s.bank,
      ...(s.entry && s.portal ? { waypoints: [s.entry, s.portal, s.place] } : {}) }, BANK_VISIT) : null;
    if (!walk) return [];
    return [{ spot: { label: s.label, place: s.place, ...(s.objectNames?.length ? { objectNames: [...s.objectNames] } : {}), how: 'bank' as const, ...(walk.bank ? { bank: walk.bank.label } : {}),
      ...(s.entry ? { waypoints: [s.entry, s.place] } : {}) }, trip: walk.minutes }];
  });
}

/** Confirmed executable batches first, uncertain kits next, proven unfundable kits last. */
interface Option { rate: ModelRate; score: number; fundingRank: 0 | 1 | 2 }

/** Known coins can prove a purchase is affordable without pretending an unread balance is zero. */
function batchFunding(needs: readonly MethodNeed[], state: PlayerState, prices?: Market['prices']): Option['fundingRank'] {
  const cost = requirementCost(needs.flatMap(n => n.type === 'item' ? [itemRequirement(n)] : []), state, prices);
  const cash = coinsOf(state);
  const minimum = (cash.bag ?? 0) + (cash.bank ?? 0);
  if (cost !== null && cost <= minimum) return 0;
  return cost !== null && cash.total !== null ? 2 : 1;
}


/** An authored mixture is valid only when every variant has identical XP, timing and access mechanics. */
function mixableRecipe(r: Recipe, method: TrainingMethod, ids: readonly string[], reg: ProcessingRegistry): Recipe | null {
  if (r.inputs.length !== 1 || r.inputs[0].anyOf?.length) return null;
  const need = method.needs?.find(n => n.type === 'item' && n.anyOf?.length && [n.name, ...n.anyOf].includes(r.inputs[0].name));
  if (need?.type !== 'item' || !need.anyOf?.length) return null;
  const shape = (q: Recipe) => JSON.stringify([
    q.skill, q.level, q.xp, q.ticks, q.facility, q.tools,
    q.success ? [q.success.low, q.success.high] : null, q.chance ?? 1, q.retry ?? false, q.members ?? false,
    q.batchSize, q.batchWaitTicks, q.requires, q.wholeBatch, q.multiplierEvery, q.access, q.station,
    q.inputs.map(i => [i.qty, i.stacks, i.staff, i.initialReserve]), q.output?.qty ?? 0,
  ]);
  const expected = shape(r);
  const names = [...new Set([need.name, ...need.anyOf])];
  if (!names.every(name => reg.recipes.some(q => ids.includes(q.id) && q.inputs.length === 1 && q.inputs[0].name === name && shape(q) === expected))) return null;
  return { ...r, inputs: [{ ...r.inputs[0], name: need.name, anyOf: names.filter(n => n !== need.name) }] };
}

function recipeBag(r: Recipe, state: PlayerState, market: Market, method?: TrainingMethod) {
  const substituted = r.inputs.filter((i) => {
    if (!i.staff) return false;
    const staff = gearPieceByName(i.staff);
    if (!staff || staff.reqUnverified || (staff.members && state.mode !== 'members') || !canWear(staff, {
      attack: levelOf(state, 'attack') ?? 1, strength: levelOf(state, 'strength') ?? 1, defence: levelOf(state, 'defence') ?? 1,
      magic: levelOf(state, 'magic'), ranged: levelOf(state, 'ranged'),
    }, state.quests.known ? new Set(state.quests.value) : undefined)) return false;
    const held = heldOf(state, i.staff);
    return held.presence === 'PRESENT' || held.equipped > 0;
  });
  const inputs = r.inputs.filter((i) => !substituted.includes(i)).map((i) => {
    if (!i.anyOf?.length) return i;
    const names = [i.name, ...i.anyOf];
    const name = names.find((n) => (heldOf(state, n).total ?? 0) > 0)
      ?? names.map((n) => ({ name: n, price: supplyPrice(n, market.prices, state.mode) })).filter((n) => n.price !== null).sort((a, b) => a.price! - b.price!)[0]?.name ?? i.name;
    return { ...i, name, anyOf: names.filter((n) => n !== name) };
  });
  const tiara = r.access ? heldOf(state, r.access.equipped) : null;
  const wearsAccess = tiara !== null && (tiara.presence === 'PRESENT' || tiara.equipped > 0);
  const accessNeed: MethodNeed | null = r.access ? wearsAccess
    ? { type: 'item', name: r.access.equipped, count: 1, equip: true }
    : { type: 'item', name: r.access.carried, count: 1, anyOf: [r.access.equipped] } : null;
  // The bag: a slot for each tool and each stackable material, the rest for the materials one action uses.
  const perAction = inputs.filter((i) => !i.stacks).reduce((a, i) => a + i.qty, 0);
  const free = BAG - r.tools.length - inputs.filter((i) => i.stacks).length - (r.access && !wearsAccess ? 1 : 0);
  const planned = inputs.flatMap((i) => {
    const n = method?.needs?.find((n) => n.type === 'item' && (n.name === i.name || n.anyOf?.includes(i.name) || i.anyOf?.includes(n.name)));
    return n?.type === 'item' && n.count !== undefined && n.count > 0 ? [actionsForQuantity(i, n.count)] : [];
  });
  const capacity = Math.min(r.batchSize ?? Infinity, ...planned, perAction > 0 ? Math.floor(free / perAction) : free);
  const needsAt = (actions: number): MethodNeed[] => [
    ...r.tools.map(name => ({ type: 'item' as const, name, count: 1 })),
    ...(accessNeed ? [accessNeed] : []),
    ...substituted.map(i => ({ type: 'item' as const, name: i.staff!, count: 1, equip: true })),
    ...inputs.map(i => ({ type: 'item' as const, name: i.name, count: quantityForActions(i, actions), ...(i.anyOf?.length ? { anyOf: i.anyOf } : {}) })),
  ];
  let actions = capacity;
  if (method && capacity > 1) {
    const confirmed = (n: number) => batchFunding(needsAt(n), state, market.prices) === 0;
    if (!confirmed(capacity)) {
      let lo = 0;
      let hi = capacity - 1;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (confirmed(mid)) lo = mid; else hi = mid - 1;
      }
      // No proven smaller batch: retain the original requirement and its missing/unknown state.
      if (lo > 0) actions = lo;
    }
  }
  return { actions, inputs, needs: needsAt(actions), capped: actions < capacity };
}

function option(r: Recipe, at: { spot: RateSpot | null; trip: [number, number] }, level: number, state: PlayerState, market: Market, coinRate: number | null, method: TrainingMethod): Option | null {
  const { actions, inputs, needs, capped } = recipeBag(r, state, market, method);
  if (actions <= 0) return null;
  const chance = r.success ? skillChance(r.success.low, r.success.high, level) : r.chance ?? 1;
  // A retried action (a log that did not light) is tried again: the failures cost time, and every action ends in a success.
  const tries = r.retry ? 1 / chance : 1;
  const success = r.retry ? 1 : chance;
  const seconds = (i: 0 | 1) => r.ticks * TICK * tries / (r.wholeBatch ? actions : 1) + (at.trip[i] * 60 + (r.batchWaitTicks ?? 0) * TICK) / actions;
  const perHour = (i: 0 | 1) => 3600 / seconds(i);
  const xph: [number, number] = [(r.xp * success * perHour(1)) / (1 + MARGIN), r.xp * success * perHour(0)];
  const done = (perHour(0) + perHour(1)) / 2;
  // Materials at the price to replace them (a material owned is used up too); the product at its sale value after tax, a failed one (burnt) at none.
  const each = inputs.reduce<number | null>((a, i) => {
    const p = supplyPrice(i.name, market.prices, state.mode);
    return a === null || p === null ? null : a + p * i.qty;
  }, 0);
  const sale = r.output ? dropValue(r.output.name, market.prices, market.restriction) : 0;
  // A product the trade rules keep from being sold is worth nothing to sell; one with no price is unknown, and then so are the coins.
  const value = sale ?? (market.restriction === 'RESTRICTED' && isRestrictedItem(r.output!.name) ? 0 : null);
  const costPerHour = each === null || value === null ? null : each * done;
  // The product's value is shown only with its materials' cost: a gain without the cost would read as profit.
  const outputQty = (r.output?.qty ?? 0) * (r.multiplierEvery ? 1 + Math.floor(level / r.multiplierEvery) : 1);
  const lootPerHour = costPerHour === null || !r.output ? 0 : value! * outputQty * success * done;
  const rate: ModelRate = {
    xph, costPerHour, basis: r.output?.name ?? r.inputs[0].name, xpPerAction: r.xp * success, exactNeeds: true, batchActions: actions,
    needs, consumables: inputs.map(({ name, qty, initialReserve, anyOf }) => ({ name, qty, ...(initialReserve !== undefined ? { initialReserve } : {}), ...(anyOf?.length ? { anyOf: [...anyOf] } : {}) })),
    ...(costPerHour !== null ? { costName: inputs.map((i) => i.name.toLowerCase()).join(', ') } : {}),
    ...(lootPerHour > 0 && r.output ? { lootPerHour, loot: r.output.name } : {}),
    ...(at.spot ? { spot: at.spot } : {}),
    ...((capped || r.wholeBatch) ? { warning: [
      ...(capped ? [`First batch: ${actions} actions. Recheck supplies before refilling; replenishment is not assumed.`] : []),
      ...(r.wholeBatch ? ['Walking and banking estimate; no teleports or essence pouches.'] : []),
    ].join(' ') } : {}),
  };
  // Time per XP less what the coins are worth in time (lootValue): a loss counts in full, a gain at most half; unknown coins are left out.
  const saved = costPerHour === null || market.objective === 'fastest' ? 0 : coinTimeShare(lootPerHour - costPerHour, coinRate);
  const fundingRank = batchFunding(needs, state, market.prices);
  return { rate, score: (1 - saved) / ((xph[0] + xph[1]) / 2), fundingRank };
}

/**
 * The rate of a processing method for this player: the best of its recipes the level allows, at the best station of each, or null — not a processing
 * method, the level is not known, or no recipe is open at it.
 */
export function processRate(m: TrainingMethod, skill: string, state: PlayerState, market: Market = {}, reg: ProcessingRegistry = PROCESSING): ModelRate | null {
  const ids = reg.methods[m.id];
  if (!ids || m.kind !== 'method' || !m.skills.includes(skill) || (m.members && state.mode !== 'members')) return null;
  const level = levelOf(state, skill);
  if (level === undefined) return null;
  const coinRate = coinsPerMinute(market.prices);
  const home = m.place ? matchStrict(m.place) : null;
  let best: Option | null = null;
  for (const id of ids) {
    const r = reg.recipes.find((x) => x.id === id);
    if (!r || r.skill !== skill || level < r.level || (r.members && state.mode !== 'members')) continue;
    if (r.requires?.some((q) => (levelOf(state, q.skill) ?? 0) < q.level)) continue;
    const mixed = market.objective !== 'profit' ? mixableRecipe(r, m, ids, reg) : null;
    for (const at of placesFor(r, state, reg)) {
      const o = option(mixed ?? r, at, level, state, market, coinRate, m);
      if (!o) continue;
      if (mixed) {
        // The XP mechanics match, but a mixture must not inherit one product's sale value or input price.
        o.rate.methodName = m.name;
        o.rate.basis = m.name;
        o.rate.costPerHour = null;
        delete o.rate.lootPerHour;
        delete o.rate.loot;
        delete o.rate.costName;
        o.score = 1 / ((o.rate.xph[0] + o.rate.xph[1]) / 2);
      } else if (ids.length > 1 && r.output) o.rate.methodName = `${r.skill === 'cooking' && r.facility === 'fire' ? 'Cook' : 'Make'} ${r.skill === 'cooking' ? r.output.name.replace(/^Cooked\s+/, '') : r.output.name}`;
      // A tie (within 2%) goes to the station nearer the method's own place, so the advice does not hop between equal stations.
      const far = (x: Option) => (home && x.rate.spot ? Math.max(Math.abs(x.rate.spot.place.x - home.x), Math.abs(x.rate.spot.place.y - home.y)) : 0);
      const earnings = best && market.objective === 'profit' ? earningsOrder(netEarnings(o.rate), netEarnings(best.rate)) : 0;
      // Kit feasibility precedes XP/profit; an uncertain wallet is neither zero cash nor confirmed buying power.
      const funding = best ? o.fundingRank - best.fundingRank : 0;
      const byRate = best !== null && (o.score < best.score * 0.98 || (o.score <= best.score * 1.02 && far(o) < far(best)));
      if (!best || funding < 0 || (!funding && (earnings < 0 || (!earnings && byRate)))) best = o;
    }
  }
  return best?.rate ?? null;
}

/** A station further than this from the place another engine names is not that place's station, tiles. */
const SAME_PLACE = 30;

/**
 * The pace of one product of the registry at the station of the place another engine names (the money methods: "Smelt steel bars" at the Edgeville
 * furnace), for this player's level, so the Money and Skills pages time the same work the same way. Seconds per unit at the station, without banking
 * (the caller has its own trips); a recipe made by a bank needs no station. null when no free recipe makes the product, the account may not use it, the
 * level is not known or too low, or no station of its kind is at the place.
 */
export function processPace(product: string, near: Point, state: PlayerState, reg: ProcessingRegistry = PROCESSING):
  { seconds: { fast: number; typical: number; slow: number }; recipe: string; station: string | null } | null {
  const r = reg.recipes.find((x) => x.output?.name.toLowerCase() === product.toLowerCase() && !(x.members && state.mode !== 'members'));
  if (!r) return null;
  const level = levelOf(state, r.skill);
  if (level === undefined || level < r.level) return null;
  if (r.requires?.some((q) => (levelOf(state, q.skill) ?? 0) < q.level)) return null;
  const station = r.facility
    ? reg.stations.filter((s) => s.kind === r.facility && (!r.station || r.station === s.label) && !(s.members && state.mode !== 'members') && s.place.plane === near.plane)
      .map((s) => ({ s, far: Math.max(Math.abs(s.place.x - near.x), Math.abs(s.place.y - near.y)) })).filter((x) => x.far <= SAME_PLACE)
      .sort((a, b) => a.far - b.far)[0]?.s ?? null
    : null;
  if (r.facility && !station) return null;
  const chance = r.success ? skillChance(r.success.low, r.success.high, level) : r.chance ?? 1;
  const { actions } = recipeBag(r, state, {});
  if (actions <= 0) return null;
  const outputQty = r.output!.qty * (r.multiplierEvery ? 1 + Math.floor(level / r.multiplierEvery) : 1);
  const fast = ((r.ticks / (r.wholeBatch ? actions : 1) + (r.batchWaitTicks ?? 0) / actions) * TICK) / (chance * outputQty);
  const slow = fast * (1 + MARGIN);
  return { seconds: { fast, typical: (fast + slow) / 2, slow }, recipe: r.output!.name, station: station?.label ?? null };
}
