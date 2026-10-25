// What a gathering method (Woodcutting, Fishing, Mining) gives this player per hour, and where: one engine for every tree, rock and fishing spot, the same
// way the combat engines work (combatRates.ts). From data/skilling.json (built from the OSRS Wiki by scripts/build-skilling.ts):
//   - the chance per roll by the skilling success function (skillChance.ts) for the level and the best usable tool the player has (a better axe is a
//     better chance, a better pickaxe a faster roll), the fishing cascade best fish first;
//   - the time per roll (action lengths), the trees' despawn timers and the rocks' respawns shared by the rocks of the spot;
//   - a full bag: dropped, or banked at the spot's own bank (bankTrip.ts, the same walk as the combat spots) when the coins pay for the walk
//     (lootValue.bankingPays, the same rule as combat loot); bait used up is the cost;
//   - every candidate spot of the method is worked out and the best one wins: the most XP, counting the coins banked as time saved. A spot next to a
//     bank wins whenever its shorter walk makes it better, and never only because it is near.
// Nothing here names a tree, a rock, a spot or a bank: a new one, members ones too, is an entry in scripts/skilling.defs.json and a build.

import skillingJson from '../data/skilling.json';
import { bankTrip } from './bankTrip';
import { cascade, skillChance } from './skillChance';
import { bankingPays, coinsPerMinute, coinTimeShare, dropValue } from './lootValue';
import { heldOf, levelOf, type PlayerState } from './playerState';
import { toolUse } from './toolTiers';
import type { Market, ModelRate, RateSpot } from './methodRates';
import type { TrainingMethod } from './trainingRouter';
import type { Point } from './travel';
import { attacksPlayer, hostileText } from './aggression';
import { matchStrict } from '../services/locationResolver';
import { combatLevel } from './moneyAdvisor';
import { supplyPrice } from './sourceRouter';

interface Tier { item: string; level: number; wield: number; ticks?: number }
interface Product { name: string; level: number; xp: number; low?: number; high?: number; respawn?: [number, number] }
interface Resource {
  id: string; skill: string; object: string; tool: string; bait?: string; ticks?: number; cascade: boolean; products: Product[];
  byTool?: Record<string, { low: number; high: number }>; lifetime?: number | 'one';
}
interface SkillSpot {
  resource: string; label: string; place: Point & { label: string }; count?: number; members: boolean; bank?: string; why?: string;
  /** Aggressive NPCs standing at the spot (their own wiki spawn lines), with their levels. */
  hostiles?: { npc: string; levels: number[]; count: number }[];
}
/** The gathering registry: data/skilling.json in the app; a test may pass its own (synthetic content never enters the app's data). */
export interface SkillingRegistry { tools: Record<string, { skill: string; tiers: Tier[] }>; resources: Resource[]; spots: SkillSpot[]; methods: Record<string, string[]> }

export const SKILLING = skillingJson as unknown as SkillingRegistry;

const TICK = 0.6;
const BAG = 28;
/** Walking to the next tree once one falls, seconds: the fast and the slow end. */
const TREE_MOVE: [number, number] = [2.4, 6];
/** Stepping to the next rock of a spot, seconds. */
const ROCK_MOVE: [number, number] = [0.6, 1.8];
/** A fishing spot moves after 250 to 530 ticks (OSRS Wiki, "Fishing spot"); following it costs a few seconds. */
const SPOT_LIFE: [number, number] = [530 * TICK, 250 * TICK];
const SPOT_MOVE: [number, number] = [3, 8];
/** Dropping one item of a full bag, seconds. */
const DROP: [number, number] = [0.3, 0.6];
/** The margin at the slow end: misclicks, other players on the same tree or rock, attention elsewhere. */
const MARGIN = 0.1;

/**
 * The tool tier the rate is for: the best usable tier the player is seen to have (bag, worn or bank). With none seen and the bank checked, the cheapest
 * tier (what preparation would get); while a usable tier may still be in an unread bank, null - the tool is unknown, and so is the rate (a Bronze axe
 * guessed for a player who owns a Rune axe would send a level 90 to the oaks). A tool that does not change the rate (a fishing net) is not looked up.
 */
function toolFor(r: Resource, level: number, state: PlayerState, reg: SkillingRegistry): { tier: Tier | null; name: string; owned: boolean; wielded: boolean } | null {
  const family = reg.tools[r.tool];
  if (!family) return { tier: null, name: r.tool, owned: heldOf(state, r.tool).presence === 'PRESENT', wielded: false };
  const usable = family.tiers.filter((t) => level >= t.level && !(toolUse(t.item)?.members && state.mode !== 'members') && (!r.byTool || r.byTool[t.item]));
  if (!usable.length) return null;
  const seen = usable.map((t) => heldOf(state, t.item).presence);
  const best = seen.lastIndexOf('PRESENT');
  if (best < 0 && seen.includes('UNKNOWN')) return null;
  const tier = usable[Math.max(0, best)];
  const attack = levelOf(state, 'attack');
  return { tier, name: tier.item, owned: best >= 0, wielded: attack !== undefined && attack >= tier.wield };
}

interface SpotRate { rate: ModelRate; score: number; danger?: string }

/** Scores this close are a tie: the model cannot tell such spots apart. */
const TIE = 0.02;
/**
 * Whether spot a beats spot b: a spot whose NPCs would attack this player loses to any spot where none do (when every spot has them, the best is kept
 * and says so); then the better score; in a tie the spot nearer the method's own place (the guide's), so the advice does not hop between equal spots.
 */
function better(a: SpotRate, b: SpotRate, home: Point | null): boolean {
  if (Boolean(a.danger) !== Boolean(b.danger)) return !a.danger;
  if (Math.abs(a.score - b.score) > TIE * Math.min(a.score, b.score)) return a.score < b.score;
  const far = (x: SpotRate) => (home && x.rate.spot ? Math.max(Math.abs(x.rate.spot.place.x - home.x), Math.abs(x.rate.spot.place.y - home.y)) : 0);
  return far(a) < far(b);
}

type ToolUse = { tier: Tier | null; name: string; wielded: boolean };

/**
 * The chance of each product a roll and the seconds per item at the spot (the fast and the slow end): the rolls, moving on, and waiting when the spot's
 * rocks or trees are all used. Banking and dropping are not in it. null when no roll can succeed or the roll length is not known.
 */
function paceAt(r: Resource, spot: SkillSpot, level: number, tool: ToolUse): { chances: number[]; any: number; atSpot: (i: 0 | 1) => number } | null {
  const lines = r.products.map((p) => {
    const c = r.byTool && tool.tier ? r.byTool[tool.tier.item] : { low: p.low ?? 0, high: p.high ?? 0 };
    return { low: c.low, high: c.high, level: p.level };
  });
  const chances = r.cascade ? cascade(lines, level) : lines.map((l) => (level >= l.level ? skillChance(l.low, l.high, level) : 0));
  const any = chances.reduce((a, p) => a + p, 0);
  if (any <= 0) return null;
  const ticks = r.ticks ?? tool.tier?.ticks;
  if (!ticks) return null;
  const roll = ticks * TICK;
  const gather = roll / any;
  const respawn = r.products[0].respawn ? (r.products[0].respawn[0] + r.products[0].respawn[1]) / 2 : 0;
  const atSpot = (i: 0 | 1): number => {
    if (r.skill === 'woodcutting') {
      if (r.lifetime === 'one' || r.lifetime === undefined) {
        const cap = spot.count ? (gather + respawn) / spot.count : 0;
        return Math.max(gather + TREE_MOVE[i], cap);
      }
      const life = r.lifetime * TICK;
      const perTree = life / gather + 1;
      const cap = spot.count ? (life + gather + respawn) / (spot.count * perTree) : 0;
      return Math.max(gather + TREE_MOVE[i] / perTree, cap);
    }
    if (r.skill === 'mining') {
      const cap = spot.count ? (respawn + gather + ROCK_MOVE[i]) / spot.count : 0;
      return Math.max(gather + ROCK_MOVE[i], cap);
    }
    return gather + (SPOT_MOVE[i] * gather) / SPOT_LIFE[i];
  };
  return { chances, any, atSpot };
}

function spotRate(r: Resource, spot: SkillSpot, level: number, state: PlayerState, market: Market, coinRate: number | null, reg: SkillingRegistry): SpotRate | null {
  const tool = toolFor(r, level, state, reg);
  if (!tool) return null;
  const pace = paceAt(r, spot, level, tool);
  if (!pace) return null;
  const { chances, any, atSpot } = pace;
  const xpEach = r.products.reduce((a, p, i) => a + chances[i] * p.xp, 0) / any;
  const values = r.products.map((p) => dropValue(p.name, market.prices, market.restriction) ?? 0);
  const valueEach = r.products.reduce((a, _p, i) => a + chances[i] * values[i], 0) / any;
  const slots = BAG - (tool.wielded ? 0 : 1) - (r.bait ? 1 : 0);
  const trip = spot.bank ? bankTrip({ place: spot.place, bank: spot.bank }) : null;
  const bankPer = (i: 0 | 1) => (trip ? (trip.minutes[i] * 60) / slots : Infinity);
  const mid = (f: (i: 0 | 1) => number) => (f(0) + f(1)) / 2;
  const banks = trip !== null && bankingPays(valueEach, mid(bankPer) - mid((i) => DROP[i]), coinRate, market.objective);
  const perItem = (i: 0 | 1) => atSpot(i) + (banks ? bankPer(i) : DROP[i]);
  const perHour = (i: 0 | 1) => 3600 / perItem(i);
  const xph: [number, number] = [(xpEach * perHour(1)) / (1 + MARGIN), xpEach * perHour(0)];
  const items = mid(perHour);
  const baitPrice = r.bait ? supplyPrice(r.bait, market.prices, state.mode) : null;
  const lootPerHour = banks ? valueEach * items : 0;
  const main = r.products.find((_p, i) => chances[i] > 0)!;
  const where: RateSpot = { label: spot.label, place: spot.place, how: banks ? 'bank' : 'drop', ...(banks && trip ? { bank: trip.bank.label } : {}) };
  const rate: ModelRate = {
    xph, costPerHour: r.bait ? (baitPrice === null ? null : items * baitPrice) : 0, basis: tool.name,
    ...(r.bait ? { costName: r.bait === 'Feather' ? 'feathers' : r.bait.toLowerCase() } : {}),
    ...(lootPerHour > 0 ? { lootPerHour, loot: main.name } : {}), spot: where,
  };
  // The time per XP, the coins banked counted as the time cows would take to earn them (lootValue.coinsPerMinute).
  // Coins net of the bait used up; an unknown bait price leaves coins out of the score rather than taking the bait as free.
  const saved = rate.costPerHour === null ? 0 : coinTimeShare(lootPerHour - (rate.costPerHour ?? 0), coinRate);
  const combat = combatLevel(Object.fromEntries(Object.keys(state.levels).map((k) => [k, levelOf(state, k)])) as never);
  const threat = spot.hostiles?.map((h) => ({ npc: h.npc, level: Math.max(...h.levels) })).find((h) => attacksPlayer(h.level, combat));
  return { rate, score: (1 - saved) / ((xph[0] + xph[1]) / 2), ...(threat ? { danger: hostileText(threat.npc, threat.level) } : {}) };
}

/** The rate of a gathering method for this player, at the best of its spots, or null: not a gathering method, or the level is not known. */
export function gatherRate(m: TrainingMethod, skill: string, state: PlayerState, market: Market = {}, reg: SkillingRegistry = SKILLING): ModelRate | null {
  const ids = reg.methods[m.id];
  if (!ids || m.kind !== 'method' || !m.skills.includes(skill)) return null;
  const level = levelOf(state, skill);
  if (level === undefined) return null;
  const coinRate = coinsPerMinute(market.prices);
  const home = m.place ? matchStrict(m.place) : null;
  let best: SpotRate | null = null;
  for (const id of ids) {
    const r = reg.resources.find((x) => x.id === id);
    if (!r || r.skill !== skill) continue;
    for (const spot of reg.spots) {
      if (spot.resource !== id || (spot.members && state.mode !== 'members')) continue;
      const s = spotRate(r, spot, level, state, market, coinRate, reg);
      if (s && (!best || better(s, best, home))) best = s;
    }
  }
  return best ? { ...best.rate, ...(best.danger ? { warning: best.danger } : {}) } : null;
}

/** A spot further than this from the place another engine names is not that place's spot, tiles. */
const SAME_PLACE = 30;

/**
 * The pace of one product at the registry spot of the place another engine names (the money methods: "Chop yew logs" at the Edgeville yews), for this
 * player's level and the tool that engine plans to use (null: the tool the training advice would use), so the Money and Skills pages time the same work
 * the same way. Seconds per unit of the product at the spot, without banking (the caller has its own trips). null when the registry has no spot of that
 * product there, the account may not use it, its count is unknown for a resource that runs out, the level is not known or too low, or the tool is unknown.
 */
export function gatherPace(product: string, near: Point & { plane?: number }, state: PlayerState, toolName: string | null = null, reg: SkillingRegistry = SKILLING):
  { seconds: { fast: number; typical: number; slow: number }; tool: string; spot: string } | null {
  const key = product.toLowerCase();
  let found: { r: Resource; spot: SkillSpot; far: number } | null = null;
  for (const r of reg.resources) {
    if (!r.products.some((p) => p.name.toLowerCase() === key)) continue;
    for (const spot of reg.spots) {
      if (spot.resource !== r.id || (spot.members && state.mode !== 'members') || (spot.place.plane ?? 0) !== (near.plane ?? 0)) continue;
      const far = Math.max(Math.abs(spot.place.x - near.x), Math.abs(spot.place.y - near.y));
      if (far <= SAME_PLACE && (!found || far < found.far)) found = { r, spot, far };
    }
  }
  if (!found) return null;
  const { r, spot } = found;
  // A resource that runs out (a tree falls, a rock empties) is capped by how many the spot has; a spot without a count would be timed as endless.
  if (r.products[0].respawn && !spot.count) return null;
  const level = levelOf(state, r.skill);
  if (level === undefined) return null;
  const family = reg.tools[r.tool];
  const named = family && toolName ? family.tiers.find((t) => t.item.toLowerCase() === toolName.toLowerCase() && level >= t.level) : undefined;
  const attack = levelOf(state, 'attack');
  const tool = named ? { tier: named, name: named.item, wielded: attack !== undefined && attack >= named.wield } : toolFor(r, level, state, reg);
  if (!tool) return null;
  const pace = paceAt(r, spot, level, tool);
  const share = pace ? pace.chances[r.products.findIndex((p) => p.name.toLowerCase() === key)] / pace.any : 0;
  if (!pace || share <= 0) return null;
  const fast = pace.atSpot(0) / share;
  const slow = (pace.atSpot(1) * (1 + MARGIN)) / share;
  return { seconds: { fast, typical: (fast + slow) / 2, slow }, tool: tool.name, spot: spot.label };
}
