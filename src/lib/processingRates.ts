// The processing engine (2.79): one rate model for every skill that turns materials into a product at a station — Smithing at an anvil, Crafting at a
// furnace or by a bank, Cooking at a fire. A recipe is the wiki's own (data/processing.json, built by scripts/build-processing.ts): level, XP, ticks at the
// Make-X pace, tools, materials, output, success chance. The rate is the actions a bag allows between bank trips, each at the recipe's ticks, plus the
// trip to the bank (the wiki's distance from a furnace or anvil; the walk from a fire), times the chance it succeeds. Materials are a cost at their
// price, the product a gain at its sale value after tax; a recipe, station or account rule added to the data reaches every method that lists it.

import processingJson from '../data/processing.json';
import { bankTrip, tripMinutes } from './bankTrip';
import { skillChance } from './skillChance';
import { coinsPerMinute, coinTimeShare, dropValue } from './lootValue';
import { levelOf, type PlayerState } from './playerState';
import { isRestrictedItem } from './tradeRestriction';
import { supplyPrice } from './sourceRouter';
import { matchStrict } from '../services/locationResolver';
import type { Market, ModelRate, RateSpot } from './methodRates';
import type { TrainingMethod } from './trainingRouter';
import type { Point } from './travel';

type Facility = 'furnace' | 'anvil' | 'fire';
interface Station { kind: Facility; label: string; place: Point & { label: string }; bankTiles?: number; bank?: string; members: boolean }
interface Recipe {
  id: string; skill: string; level: number; xp: number; ticks: number; facility: Facility | null; tools: string[];
  /** output: null - nothing kept (logs burnt). retry: a failed attempt keeps the material and costs only its time (lighting a log). */
  inputs: { name: string; qty: number; stacks: boolean }[]; output: { name: string; qty: number } | null; retry?: boolean;
  /** The skilling success formula's low and high (cooking: the food is not burnt), or a flat chance (an iron bar); neither - always. */
  success?: { low: number; high: number }; chance?: number; members?: boolean;
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
  return reg.stations.filter((s) => s.kind === r.facility && !(s.members && state.mode !== 'members')).flatMap((s) => {
    const walk = s.bankTiles !== undefined ? { minutes: tripMinutes(s.bankTiles, 0, BANK_VISIT), bank: undefined } : s.bank ? bankTrip({ place: s.place, bank: s.bank }, BANK_VISIT) : null;
    if (!walk) return [];
    return [{ spot: { label: s.label, place: s.place, how: 'bank' as const, ...(walk.bank ? { bank: walk.bank.label } : {}) }, trip: walk.minutes }];
  });
}

interface Option { rate: ModelRate; score: number }

function option(r: Recipe, at: { spot: RateSpot | null; trip: [number, number] }, level: number, state: PlayerState, market: Market, coinRate: number | null): Option | null {
  // The bag: a slot for each tool and each stackable material, the rest for the materials one action uses.
  const perAction = r.inputs.filter((i) => !i.stacks).reduce((a, i) => a + i.qty, 0);
  const free = BAG - r.tools.length - r.inputs.filter((i) => i.stacks).length;
  const actions = perAction > 0 ? Math.floor(free / perAction) : free;
  if (actions <= 0) return null;
  const chance = r.success ? skillChance(r.success.low, r.success.high, level) : r.chance ?? 1;
  // A retried action (a log that did not light) is tried again: the failures cost time, and every action ends in a success.
  const tries = r.retry ? 1 / chance : 1;
  const success = r.retry ? 1 : chance;
  const seconds = (i: 0 | 1) => r.ticks * TICK * tries + (at.trip[i] * 60) / actions;
  const perHour = (i: 0 | 1) => 3600 / seconds(i);
  const xph: [number, number] = [(r.xp * success * perHour(1)) / (1 + MARGIN), r.xp * success * perHour(0)];
  const done = (perHour(0) + perHour(1)) / 2;
  // Materials at the price to replace them (a material owned is used up too); the product at its sale value after tax, a failed one (burnt) at none.
  const each = r.inputs.reduce<number | null>((a, i) => {
    const p = supplyPrice(i.name, market.prices, state.mode);
    return a === null || p === null ? null : a + p * i.qty;
  }, 0);
  const sale = r.output ? dropValue(r.output.name, market.prices, market.restriction) : 0;
  // A product the trade rules keep from being sold is worth nothing to sell; one with no price is unknown, and then so are the coins.
  const value = sale ?? (market.restriction === 'RESTRICTED' && isRestrictedItem(r.output!.name) ? 0 : null);
  const costPerHour = each === null || value === null ? null : each * done;
  // The product's value is shown only with its materials' cost: a gain without the cost would read as profit.
  const lootPerHour = costPerHour === null || !r.output ? 0 : value! * r.output.qty * success * done;
  const rate: ModelRate = {
    xph, costPerHour, basis: r.output?.name ?? r.inputs[0].name,
    ...(costPerHour !== null ? { costName: r.inputs.filter((i) => !i.stacks).map((i) => i.name.toLowerCase()).join(', ') } : {}),
    ...(lootPerHour > 0 && r.output ? { lootPerHour, loot: r.output.name } : {}),
    ...(at.spot ? { spot: at.spot } : {}),
  };
  // Time per XP less what the coins are worth in time (lootValue): a loss counts in full, a gain at most half; unknown coins are left out.
  const saved = costPerHour === null || market.objective === 'fastest' ? 0 : coinTimeShare(lootPerHour - costPerHour, coinRate);
  return { rate, score: (1 - saved) / ((xph[0] + xph[1]) / 2) };
}

/**
 * The rate of a processing method for this player: the best of its recipes the level allows, at the best station of each, or null — not a processing
 * method, the level is not known, or no recipe is open at it.
 */
export function processRate(m: TrainingMethod, skill: string, state: PlayerState, market: Market = {}, reg: ProcessingRegistry = PROCESSING): ModelRate | null {
  const ids = reg.methods[m.id];
  if (!ids || m.kind !== 'method' || !m.skills.includes(skill)) return null;
  const level = levelOf(state, skill);
  if (level === undefined) return null;
  const coinRate = coinsPerMinute(market.prices);
  const home = m.place ? matchStrict(m.place) : null;
  let best: Option | null = null;
  for (const id of ids) {
    const r = reg.recipes.find((x) => x.id === id);
    if (!r || r.skill !== skill || level < r.level || (r.members && state.mode !== 'members')) continue;
    for (const at of placesFor(r, state, reg)) {
      const o = option(r, at, level, state, market, coinRate);
      if (!o) continue;
      // A tie (within 2%) goes to the station nearer the method's own place, so the advice does not hop between equal stations.
      const far = (x: Option) => (home && x.rate.spot ? Math.max(Math.abs(x.rate.spot.place.x - home.x), Math.abs(x.rate.spot.place.y - home.y)) : 0);
      if (!best || o.score < best.score * 0.98 || (o.score <= best.score * 1.02 && far(o) < far(best))) best = o;
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
  const station = r.facility
    ? reg.stations.filter((s) => s.kind === r.facility && !(s.members && state.mode !== 'members') && s.place.plane === near.plane)
      .map((s) => ({ s, far: Math.max(Math.abs(s.place.x - near.x), Math.abs(s.place.y - near.y)) })).filter((x) => x.far <= SAME_PLACE)
      .sort((a, b) => a.far - b.far)[0]?.s ?? null
    : null;
  if (r.facility && !station) return null;
  const chance = r.success ? skillChance(r.success.low, r.success.high, level) : r.chance ?? 1;
  const fast = (r.ticks * TICK) / (chance * r.output!.qty);
  const slow = fast * (1 + MARGIN);
  return { seconds: { fast, typical: (fast + slow) / 2, slow }, recipe: r.output!.name, station: station?.label ?? null };
}
