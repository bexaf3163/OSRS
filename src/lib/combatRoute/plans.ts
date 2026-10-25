// Ways to do a combat training step, side by side, each with the combat model's own numbers for this player. The route says one way (the step's
// opponent for every goal); the model can say how long that really takes and what it costs, and what the other ways would take. Nothing is chosen
// here in advance: every plan is estimated the same way, by lib/combatEstimate.ts, the one model the food plan already uses - there is no second one.
//
// The plans:
//   route          - the step as written: its opponent for every goal.
//   split          - the XP goals on the opponent the model finds fastest and cheapest in food, then the step's opponent only for what it alone gives
//                    (the item the step asks to be collected: 50 Big bones). Only when the step has such an item and another opponent is better.
//   item-first     - collect the required drops on the main skill first; credit that XP before estimating the remaining training.
//   xp-only        - the XP goals on one training spot, every spot the player may use (xp-only:<opponent>), when there is no item still to collect.
//   defence-first  - Defence trained first (on the best opponent for it) to a level, then the route: less damage for the rest. Left out when the
//                    player's build keeps Defence at 1.
//
// Two stages, as the funding ranking: eligibility (the opponent cannot kill in one go, a spot's quest is done, a plan with a known blocker is out) and
// then comparison (the conservative end of the time, with a penalty for a rough estimate, less what the loot is worth in time). A plan other than the
// route is recommended only when it is clearly better, and a plan already adopted stays unless another is clearly better than it. The model's numbers are
// advice for choosing; the player adopts a plan.
//
// Loot (2.75, T10): the drop of a spot worth selling (spots.ts SELL_DROP) is picked up and banked only where it pays for its own time - the pickups and
// the extra bank trips - at the rate coins are earned the simplest way (killing cows for their hides, funding's own method and the exchange's price).
// Then the plan's time includes that work and its score counts the coins as the minutes they save. A restricted account does not count what it cannot sell.

import type { Step } from '../../types';
import type { OwnedState } from '../checklist';
import { nameKey } from '../checklist';
import {
  DEFAULT_FOOD_SLOTS, estimateStep, foeLabel, stepGoals, xpPerKill, type Basis, type CombatEstimate, type CombatFoe, type Range, type StepEstimateContext,
} from '../combatEstimate';
import { chooseVariant, strengthDoses } from '../combatPlan';
import { asked, currentXp, dropEstimates, itemGoal, objectiveEstimates } from '../combatObjectives';
import { levelForXp, xpForLevel } from '../xp';
import type { PriceView } from '../funding/quotes';
import type { TradeRestriction } from '../tradeRestriction';
import { laterDefence, type LaterDefence } from './later';
import { SELL_DROP, spotsOf, spotTerms, TRAINER_LEVELS, TRAINERS, type Spot } from './spots';
import fundingJson from '../../data/fundingMethods.json';
import { netEach } from '../funding/ge';
import { isRestrictedItem } from '../tradeRestriction';
import { questOf } from '../playerState';
import { questStepOf } from '../readiness';
import { armourDefence, armourReady } from './armour';
import type { PlayerState } from '../playerState';
import { nearestBank } from '../readiness';

export type MeleeSkill = 'attack' | 'strength' | 'defence';
export interface Goal { skill: MeleeSkill; exp: number }

export type PlanId = 'route' | 'split' | 'item-first' | 'xp-only' | 'defence-first';

export interface PlanPhase {
  /** train: the XP goals; item: the drops; defence: Defence first; route: the step as written. */
  kind: 'train' | 'item' | 'defence' | 'armour' | 'route';
  /** Baseline catalogue IDs for a preparation phase; completion requires actual worn equivalents. */
  armour?: number[];
  foe: CombatFoe;
  spot: Spot;
  /** The XP the phase ends at, per skill (empty for an item phase). */
  goals: Goal[];
  /** The item an item phase collects. */
  item?: { name: string; count: number };
  kills: number;
  minutes: Range;
  food: Range;
  /** One line for the card: "Cows: Attack to 40 (746 kills)". */
  text: string;
  basis: Basis;
  killsPerTrip: number;
  /** Minimum required banking for retained drops; actual combined food/loot capacity can require more. */
  requiredLootTrips?: number;
  /** The drop picked up and banked to sell, when it pays for its time: how many, coins after the tax, the minutes it adds (in `minutes` already). */
  loot?: { name: string; qty: number; net: number; minutes: Range };
}

/** What the plan's drops bring when sold, apart from what the step reserves: an estimate, never counted against the item the step asks to be banked. */
export interface PlanIncome {
  /** Coins after the exchange tax, for the lines that count. */
  net: number;
  lines: { name: string; qty: number; net: number; counted: boolean; note?: string }[];
}

export interface EvaluatedPlan {
  id: PlanId;
  /** Unique among the plans of a step: "defence-first:20". */
  key: string;
  title: string;
  phases: PlanPhase[];
  minutes: Range;
  food: Range;
  /** Pieces at the food's exchange price; null - no price. */
  foodCost: number | null;
  income: PlanIncome;
  /** Income less the food; null when the food has no price. An estimate. */
  net: number | null;
  basis: Basis;
  risks: string[];
  /** Things worth knowing about the plan that are not dangers (the Defence the route gives later). */
  notes: string[];
  blockers: string[];
  eligible: boolean;
  /**
   * Conservative time plus estimate uncertainty and repeated-target effort, less the loot's coins as minutes: a ranking score, not elapsed minutes. It can
   * fall below zero when the loot is worth more than the time; margins are taken against `effort`.
   */
  score: number;
  /** The conservative time with the uncertainty penalty, always positive: what "clearly better by 5%" is a share of. */
  effort: number;
}

export interface PlanReport {
  stepId: string;
  /** What the step asks, for the card: "Attack to 40, 50 Big bones". */
  objective: string;
  plans: EvaluatedPlan[];
  /** The plan to offer; the route's own when nothing is clearly better. A plan in effect (`adopted`) stays unless another is clearly better. */
  recommended: string;
  /** The plan the guide would pick with nothing in effect yet: what a player's own choice is compared with (2.69). */
  fresh: string;
  /** Why, in a sentence. */
  reason: string;
  /** How sure the model is of the recommendation. */
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  /** Opponents compared (for "compared against ..." in the details). */
  compared: string[];
  food: { name: string; heals: number; price: number | null };
}

export interface PlanInput {
  state?: PlayerState;
  /** The step as the route writes it (not as an adopted plan changes it). */
  step: Step;
  steps: readonly Step[];
  ctx: StepEstimateContext;
  owned: OwnedState | null;
  /** The exchange price of one piece of the step's food, when known. */
  foodPrice?: number | null;
  /** The build keeps Defence at 1: Defence training is not offered. */
  keepDefenceOne?: boolean;
  /** The key of the plan the player adopted; it stays while it is not clearly beaten. */
  adopted?: string | null;
  /** The exchange, for what the drops sell for; without it no income is counted. */
  prices?: PriceView | null;
  /** Whether the account may sell yet: items a new account cannot sell are not counted as income. */
  restriction?: TradeRestriction['state'];
  /** Whether a route step is already closed (its reward is not ahead any more). */
  done?: (stepId: string) => boolean;
}

/** A Defence plan must beat a working route by this much on the middle estimate while the route still gives Defence XP later (Dragon Slayer I). */
export const MIN_GAIN = 0.1;
/**
 * Any other plan must beat a working route by this much (of the route's score) to be selected over it (2.69: 0.05, was MIN_GAIN). The cost of the extra
 * walk between spots is counted in the plan's own minutes (SWITCH_MINUTES), so this margin is only for the uncertainty of the estimates.
 */
export const ROUTE_MARGIN = 0.05;
/** Minutes a plan loses for each change of fighting spot: the walk, a bank stop on the way, finding the spot. */
export const SWITCH_MINUTES = 6;
/** The adopted plan stays while its score is within this factor of the best. */
export const KEEP_MARGIN = 1.25;
const BASIS_PENALTY: Record<Basis, number> = { calibrated: 1, formula: 1.05, basic: 1.3 };
const BASIS_RANK: Record<Basis, number> = { calibrated: 0, formula: 1, basic: 2 };
/** Defence levels tried for the Defence-first plan. */
const DEFENCE_STEPS = [10, 20, 30];
/** A bag of food lasting fewer kills than this is worth a warning. */
const FEW_KILLS = 5;
/** Scores this close are a tie: the net cost decides. */
const TIE_BAND = 0.05;

/** Seconds to pick one drop up: the click and a step or two, the fast and the slow end. */
const PICKUP_SECONDS: [number, number] = [1.2, 3];
/** Bag cells a loot trip fills: the weapon is worn, two cells for potions or a few pieces of food. */
const LOOT_SLOTS = 26;
const COWHIDE_METHOD = (fundingJson as unknown as { methods: { id: string; rate: { perHour: { typical: number } } }[] }).methods.find((m) => m.id === 'cows-cowhide');

/**
 * What a minute is worth in coins: the simplest way to earn them, killing cows for their hides (funding's cows-cowhide rate) at the exchange's price after
 * the tax. Null without a price: then no loot is planned.
 */
export function coinsPerMinute(prices: PriceView | null | undefined): number | null {
  const hide = prices?.sell('Cowhide')?.price;
  if (!hide || !COWHIDE_METHOD) return null;
  return (COWHIDE_METHOD.rate.perHour.typical * netEach(hide, 'Cowhide')) / 60;
}

const sum = (a: Range, b: Range): Range => ({ low: a.low + b.low, mid: a.mid + b.mid, high: a.high + b.high });
/**
 * A stored plan key as the plans have it now: before 2.75 the one "xp-only" plan was the best training spot, now each spot has its own
 * ("xp-only:Cow"); the old key means the best of them.
 */
export function planKeyOf(plans: readonly Pick<EvaluatedPlan, 'id' | 'key' | 'score' | 'eligible'>[], key: string): string {
  if (key !== 'xp-only') return key;
  return [...plans].filter((p) => p.id === 'xp-only' && p.eligible).sort((a, b) => a.score - b.score)[0]?.key ?? key;
}
/** How much better `b` is than `a`, as a share of a's time: (a.score - b.score) / a.effort. */
export const gainOver = (a: Pick<EvaluatedPlan, 'score' | 'effort'>, b: Pick<EvaluatedPlan, 'score'>): number => (a.score - b.score) / a.effort;
const ZERO: Range = { low: 0, mid: 0, high: 0 };
const worst = (a: Basis, b: Basis): Basis => (BASIS_RANK[b] > BASIS_RANK[a] ? b : a);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const gpText = (n: number) => Math.round(n).toLocaleString('en-US');

/** What a later phase starts from: the XP the earlier steps reach, and the XP the earlier phases of the plan reach, whichever is higher in each skill. */
function assumeXp(base: StepEstimateContext['assume'], extra: Partial<Record<MeleeSkill, number>>): NonNullable<StepEstimateContext['assume']> {
  const xp: Partial<Record<MeleeSkill, number>> = { ...(base?.xp ?? {}) };
  for (const [k, v] of Object.entries(extra) as [MeleeSkill, number][]) xp[k] = Math.max(xp[k] ?? 0, v);
  return { xp, ...(base && base.weapon !== undefined ? { weapon: base.weapon } : {}) };
}

function phaseOf(kind: PlanPhase['kind'], e: CombatEstimate, spot: Spot, goals: Goal[], text: string, item?: PlanPhase['item'], killsOverride?: number, remainingItems?: number): PlanPhase {
  // An item phase stops at the number of kills the item needs, not at the XP the estimate was asked for.
  const k = killsOverride ?? e.kills;
  const f = e.kills > 0 ? k / e.kills : 1;
  const scale = (r: Range): Range => ({ low: r.low * f, mid: r.mid * f, high: r.high * f });
  const food = scale(e.food);
  const minutes = scale(e.totalMinutes);
  // Reserve two cells as the estimator does. This is a minimum on loot trips, not
  // a claim that food and drops always fit together. Do not add two independent
  // bank-trip totals: the same visit can deposit drops and replenish food.
  const lootTrips = item ? Math.max(1, Math.ceil((remainingItems ?? Math.min(item.count, k)) / DEFAULT_FOOD_SLOTS)) : 1;
  const bank = e.bankTripMinutes ?? { low: 3, mid: 4.5, high: 6 };
  for (const bound of ['low', 'mid', 'high'] as const) {
    const visits = Math.max(1, Math.ceil(food[bound] / e.foodSlots), lootTrips);
    minutes[bound] = Math.max(0, minutes[bound] - (e.trips[bound] - 1) * bank[bound] * f + (visits - 1) * bank[bound]);
  }
  return {
    kind, foe: e.foe, spot, goals, ...(item ? { item, requiredLootTrips: lootTrips } : {}), kills: Math.round(k), minutes, food, text, basis: e.basis,
    killsPerTrip: e.killsPerTrip,
  };
}

/** The XP goals of a step for the plan: the step's own, as they stand. */
const goalsOf = (step: Step): Goal[] => stepGoals(step).map((g) => ({ skill: g.skill, exp: g.exp }));

const goalText = (goals: readonly Goal[]) => goals.map((g) => `${cap(g.skill)} to ${levelForXp(g.exp)}`).join(' and ');

/** The estimates of one opponent for some goals, with every free version of it; each is a candidate. */
function estimates(step: Step, foe: string, goals: Goal[], ctx: StepEstimateContext): CombatEstimate[] {
  return estimateStep(asked(step, foe, goals), ctx);
}

function afterPhase(ctx: StepEstimateContext, first: CombatEstimate, xp: Partial<Record<MeleeSkill, number>>): StepEstimateContext {
  return { ...ctx, assume: assumeXp(ctx.assume, xp), strengthDoses: first.strengthDosesLeft ?? 0 };
}

/** The fastest of the estimates by the conservative end, the one with the least food among equals. */
function bestOf(list: CombatEstimate[]): CombatEstimate | null {
  return [...list].sort((a, b) => a.totalMinutes.high - b.totalMinutes.high || a.food.mid - b.food.mid || (a.foe.combat - b.foe.combat))[0] ?? null;
}

/** Why an opponent is not safe for this much health: a hit of more than half of it, or a special attack and a hit together. Null - safe. */
export function unsafe(foe: CombatFoe, spot: Pick<Spot, 'specialMaxHit'> | undefined, hp: number): string | null {
  const name = foeLabel(foe);
  if (foe.maxHit * 2 >= hp) return `${name} can hit for ${foe.maxHit}, more than half of your ${hp} health`;
  const special = spot?.specialMaxHit;
  if (special && special + foe.maxHit >= hp) return `${name}'s special attack hits up to ${special}: with ${hp} health one you do not dodge can kill`;
  return null;
}

function risksOf(phases: PlanPhase[], hp: number): { risks: string[]; blockers: string[] } {
  const risks: string[] = [];
  const blockers: string[] = [];
  for (const p of phases) {
    if (p.kind === 'armour') continue;
    const name = foeLabel(p.foe);
    const stop = unsafe(p.foe, p.spot, hp);
    if (stop) blockers.push(stop);
    else if (p.spot.specialMaxHit) risks.push(`Step aside when ${name} winds up a special attack: it hits up to ${p.spot.specialMaxHit}`);
    // A lone boss attacks when it comes back: that is the fight, not a surprise.
    else if (p.foe.aggressive && !p.spot.betweenKills) risks.push(`${name} is aggressive: you cannot choose when to fight`);
    if (p.spot.groupAggro) risks.push(`Other ${p.spot.name} join when you attack one: pull one aside first`);
    if (Number.isFinite(p.killsPerTrip) && p.killsPerTrip < FEW_KILLS && p.kind !== 'defence') risks.push(`A full bag lasts only about ${Math.max(1, Math.floor(p.killsPerTrip))} ${name} kills`);
  }
  return { risks: [...new Set(risks)], blockers };
}

/**
 * The loot of one phase, when it pays for its time: the spot's sell drop, one a kill, apart from what the step reserves; picked up, banked and sold. Its
 * minutes are the pickups and the bank trips beyond those the food already needs (one visit serves both). Null - nothing worth it, no price, or an item a
 * restricted account cannot sell.
 */
export function lootOf(p: PlanPhase, e: Pick<CombatEstimate, 'foodSlots' | 'bankTripMinutes'>, reserved: number, prices: PriceView | null | undefined,
  restriction: TradeRestriction['state'] | undefined, rate: number | null): PlanPhase['loot'] | null {
  const name = p.spot.sell;
  if (!name || !rate || p.kind === 'armour') return null;
  if (restriction === 'RESTRICTED' && isRestrictedItem(name)) return null;
  const price = prices?.sell(name)?.price;
  if (!price) return null;
  const qty = Math.max(0, p.kills - reserved);
  const each = netEach(price, name);
  if (qty <= 0 || each <= 0) return null;
  const bank = e.bankTripMinutes ?? { low: 3, mid: 4.5, high: 6 };
  const minutes = {} as Range;
  for (const [i, bound] of (['low', 'mid', 'high'] as const).entries()) {
    const foodVisits = Math.max(1, Math.ceil(p.food[bound] / Math.max(1, e.foodSlots)), p.requiredLootTrips ?? 1);
    const lootVisits = Math.ceil((qty + reserved) / LOOT_SLOTS);
    const pickup = (qty * (i === 0 ? PICKUP_SECONDS[0] : i === 2 ? PICKUP_SECONDS[1] : avg2(PICKUP_SECONDS))) / 60;
    minutes[bound] = pickup + Math.max(0, lootVisits - foodVisits) * bank[bound];
  }
  const net = qty * each;
  // Worth it only when the coins come faster than the simplest way to earn them.
  return net / Math.max(1e-6, minutes.mid) >= rate ? { name, qty, net, minutes } : null;
}
const avg2 = (r: readonly [number, number]) => (r[0] + r[1]) / 2;

/** What the plan's drops bring: the loot its phases bank and sell (counted), and a drop left on the floor because it does not pay for its time (not counted). */
export function incomeOf(phases: readonly PlanPhase[], reserve: { name: string; qty: number } | null, _prices: PriceView | null | undefined, _restriction: TradeRestriction['state'] | undefined): PlanIncome {
  const lines: PlanIncome['lines'] = [];
  const seen = new Map<string, PlanIncome['lines'][number]>();
  for (const p of phases) {
    if (p.kind === 'armour') continue;
    if (p.loot) {
      const l = seen.get(p.loot.name);
      if (l && l.counted) { l.qty += p.loot.qty; l.net += p.loot.net; continue; }
      const line = { name: p.loot.name, qty: p.loot.qty, net: p.loot.net, counted: true };
      seen.set(p.loot.name, line);
      lines.push(line);
      continue;
    }
    const name = SELL_DROP[p.foe.name];
    const kept = reserve && name && nameKey(reserve.name) === nameKey(name) ? reserve.qty : 0;
    if (!name || p.kills - kept <= 0 || seen.has(name)) continue;
    const line = { name, qty: p.kills - kept, net: 0, counted: false, note: 'Not worth the pickups and bank trips at this pace' };
    seen.set(name, line);
    lines.push(line);
  }
  return { net: lines.filter((l) => l.counted).reduce((a, l) => a + l.net, 0), lines };
}

function assemble(id: PlanId, key: string, title: string, phases: PlanPhase[], hp: number, price: number | null, income: PlanIncome, extraBlockers: string[] = [], notes: string[] = [], rate: number | null = null): EvaluatedPlan {
  // Changing spots costs time too: the walk between them is part of the plan, not free.
  const switches = phases.slice(1).filter((p, i) => p.spot.foe !== phases[i].spot.foe).length;
  const walk = SWITCH_MINUTES * switches;
  const minutes = sum(phases.reduce((a, p) => sum(a, p.minutes), ZERO), { low: walk, mid: walk, high: walk });
  const food = phases.reduce((a, p) => sum(a, p.food), ZERO);
  const basis = phases.reduce<Basis>((a, p) => worst(a, p.basis), 'calibrated');
  const { risks, blockers } = risksOf(phases, hp);
  const all = [...blockers, ...extraBlockers];
  return {
    id, key, title, phases, minutes, food, foodCost: price === null ? null : Math.round(food.mid * price), income, net: price === null ? null : income.net - Math.round(food.mid * price),
    basis, risks, notes, blockers: all, eligible: all.length === 0, effort: Math.max(1e-6, minutes.high * BASIS_PENALTY[basis]),
    // Ranking also values fewer repeated target selections. This is an effort weight,
    // not extra elapsed time (the time estimate already includes target acquisition).
    // The loot's coins count as the minutes the simplest way to earn them would take: a plan that banks Big bones is worth more than one that does not.
    score: minutes.high * BASIS_PENALTY[basis] + phases.reduce((n, p) => n + p.kills, 0) * 0.05 - (rate ? income.net / rate : 0),
  };
}

/**
 * The plans for a combat training step, or null when the model has nothing honest to say (no levels, no gear from the game, a weapon it does not
 * know, or an opponent without data): then the step keeps the amounts and the place written in the route.
 */
export function evaluatePlans(inp: PlanInput): PlanReport | null {
  const { step, ctx } = inp;
  const goals = goalsOf(step);
  const foe = step.foes?.[0];
  if (!goals.length || !foe) return null;
  // The spots the player may use now: a spot that needs a quest only when the game counts it done or its route step is closed.
  const questDone = (quest: string) => (inp.state ? questOf(inp.state, quest) === 'DONE' : false)
    || (() => { const q = questStepOf(inp.steps as Step[], quest); return q ? inp.done?.(q.id) === true : false; })();
  const spots = new Map([...spotsOf(inp.steps)].filter(([name, s]) => name === foe || !s.requires || questDone(s.requires.quest)));
  const routeSpot = spots.get(foe);
  const foodItem = (step.itemsRequired ?? []).find((i) => typeof i.heals === 'number');
  if (!routeSpot || !foodItem || !ctx.stats || typeof ctx.stats.hitpoints !== 'number') return null;
  const hp = ctx.stats.hitpoints;
  const price = inp.foodPrice ?? null;
  const doses = strengthDoses(inp.owned);
  let live: StepEstimateContext = { ...ctx, strengthDoses: doses, terms: ctx.terms ?? spotTerms(spots) };
  const rate = coinsPerMinute(inp.prices);
  const item = itemGoal(step, inp.owned);
  const objective = [goalText(goals), item ? `${item.count} ${item.name}` : null].filter(Boolean).join(', ');

  // Route preparation is common to every trainer choice. It is not a quest prerequisite and restricted builds retain their route.
  const kit = !inp.keepDefenceOne && goals.some(g => currentXp(live, g.skill) < g.exp) ? step.combatArmour : undefined;
  const kitDefence = kit?.length ? armourDefence(kit) : 1;
  const preparation: PlanPhase[] = [];
  if (kit?.length && kitDefence > 1) {
    if (typeof ctx.stats.defence !== 'number') return null;
    if (ctx.stats.defence < kitDefence) {
      const train = bestOf(estimates(step, 'Cow', [{ skill: 'defence', exp: xpForLevel(kitDefence) }], live).filter(e => !unsafe(e.foe, spots.get('Cow'), hp)));
      const spot = spots.get('Cow');
      if (!train || !spot) return null;
      preparation.push({ ...phaseOf('defence', train, spot, [{ skill: 'defence', exp: xpForLevel(kitDefence) }], `Cows: Defence to ${kitDefence} (${train.kills} kills)`), armour: kit });
      live = afterPhase(live, train, { defence: xpForLevel(kitDefence) });
    }
  }

  // --- The route as written
  const routeEst = chooseVariant(objectiveEstimates(step, foe, goals, item?.missing ?? 0, live), ctx.fights);
  if (!routeEst) return null;
  const itemKills = item && item.missing > 0 ? item.missing : 0;
  const routePhase = phaseOf('route', routeEst, routeSpot, goals,
    `${foeLabel(routeEst.foe)}: ${goalText(goals)}${item && item.missing > 0 ? ` and ${item.count} ${item.name}` : ''} (${Math.max(routeEst.kills, itemKills)} kills)`, item && item.missing > 0 ? { name: item.name, count: item.count } : undefined, Math.max(routeEst.kills, itemKills), item?.missing);
  // What the step asks to be banked is reserved: it is never counted as something to sell.
  const reserve = item && item.missing > 0 ? { name: item.name, qty: item.missing } : null;
  // Each training phase banks its loot when that pays for its time (lootOf); the estimate behind a phase gives its bank trips and bag.
  const looted = (ph: PlanPhase, e: CombatEstimate, reserved = 0): PlanPhase => {
    const loot = lootOf(ph, e, reserved, inp.prices, inp.restriction, rate);
    return loot ? { ...ph, loot, minutes: sum(ph.minutes, loot.minutes), text: `${ph.text}, banking the ${lootName(loot.name)}` } : ph;
  };
  const make = (id: PlanId, key: string, title: string, phases: PlanPhase[], extra: string[] = [], notes: string[] = []) => {
    let all = phases;
    if (kit?.length) {
      const first = phases[0];
      const bank = nearestBank(step);
      const ready = armourReady(kit, first.foe.attackStyle, inp.state);
      const armour: PlanPhase = { ...first, kind: 'armour', armour: kit, goals: [], item: undefined, kills: 0,
        requiredLootTrips: undefined, minutes: { ...ZERO }, food: { ...ZERO }, killsPerTrip: Infinity,
        basis: ready ? first.basis : 'basic', text: `Equip Black armour or equivalent/better (${kitDefence} Defence required)`,
        spot: { ...first.spot, ...(bank ? { place: bank, goal: bank.label, where: `Prepare at ${bank.label}; equipment must be worn before training.` } : {}), npcNames: [], waypoints: undefined },
      };
      all = [...preparation, armour, ...phases];
      if (!ready) notes = [...notes, 'Training estimates use current worn equipment. Armour purchases and their shopping detour are not timed; keep enough coins for food.'];
    }
    return assemble(id, key, title, all, hp, price, incomeOf(all, reserve, inp.prices, inp.restriction), extra, notes, rate);
  };
  const plans: EvaluatedPlan[] = [make('route', 'route', 'The route\'s plan', [looted(routePhase, routeEst, itemKills ? Math.min(itemKills, routePhase.kills) : 0)])];
  const compared = new Set<string>([foeLabel(routeEst.foe)]);

  // --- The trainers for the XP goals
  const candidates: CombatEstimate[] = [];
  for (const name of TRAINERS) {
    if (!spots.has(name)) continue;
    for (const e of estimates(step, name, goals, live)) {
      if (TRAINER_LEVELS[e.foe.name] && !TRAINER_LEVELS[e.foe.name].includes(e.foe.combat)) continue;
      candidates.push(e);
      compared.add(foeLabel(e.foe));
    }
  }
  const safe = candidates.filter((e) => !unsafe(e.foe, spots.get(e.foe.name), hp));
  const trainer = bestOf(safe);
  const trainPhase = (e: CombatEstimate, g: Goal[]) => looted(phaseOf('train', e, spots.get(e.foe.name)!, g, `${foeLabel(e.foe)}: ${goalText(g)} (${e.kills} kills)`), e);

  // Every spot the player may use is a plan of its own: the comparison is the answer to "where do I train?", not one runner-up.
  if (!item || item.missing === 0) {
    const byFoe = new Map<string, CombatEstimate>();
    for (const e of safe) if (e.foe.name !== routeEst.foe.name && (!byFoe.has(e.foe.name) || bestOf([byFoe.get(e.foe.name)!, e]) === e)) byFoe.set(e.foe.name, e);
    for (const e of byFoe.values()) plans.push(make('xp-only', `xp-only:${e.foe.name}`, `Train on ${spots.get(e.foe.name)!.name}`, [trainPhase(e, goals)]));
  }

  // --- Split: the goals on the trainer, the item from the step's opponent
  if (item && item.missing > 0 && trainer && trainer.foe !== routeEst.foe && trainer.foe.name !== routeEst.foe.name) {
    const after: Partial<Record<MeleeSkill, number>> = {};
    for (const g of goals) after[g.skill] = g.exp;
    const main = goals[0].skill;
    const perKill = xpPerKill(routeEst.foe);
    const collect = estimateStep(asked(step, foe, [{ skill: main, exp: (after[main] ?? 0) + item.missing * perKill }]), afterPhase(live, trainer, after))
      .find((e) => e.foe.combat === routeEst.foe.combat);
    if (collect) {
      const spot = spots.get(trainer.foe.name)!;
      plans.push(make('split', 'split', `${cap(spot.name)}, then ${routeSpot.name} for the ${item.name}`, [
        trainPhase(trainer, goals),
        phaseOf('item', collect, routeSpot, [], `${foeLabel(collect.foe)}: ${item.missing} ${item.name} (${item.missing} kills)`, { name: item.name, count: item.count }, item.missing, item.missing),
      ]));
    }
  }

  // Collect the required drops first, then train only the XP that remains. The item
  // phase explicitly trains the main skill so its projected XP is never free credit.
  if (item && item.missing > 0) {
    const main = goals[0].skill;
    const collect = dropEstimates(step, foe, item.missing, main, live).find(e => e.foe.combat === routeEst.foe.combat && e.foe.version === routeEst.foe.version);
    if (collect) {
      const earned = currentXp(live, main) + item.missing * xpPerKill(collect.foe);
      const after = afterPhase(live, collect, { [main]: earned });
      const follow = bestOf(TRAINERS.filter(name => spots.has(name)).flatMap(name => estimates(step, name, goals, after))
        .filter(e => !unsafe(e.foe, spots.get(e.foe.name), hp) && (!TRAINER_LEVELS[e.foe.name] || TRAINER_LEVELS[e.foe.name].includes(e.foe.combat))));
      if (follow && follow.foe.name !== routeEst.foe.name) {
        plans.push(make('item-first', 'item-first', `${item.name} first, then train on ${spots.get(follow.foe.name)!.name}`, [
          phaseOf('item', collect, routeSpot, [{ skill: main, exp: earned }], `${foeLabel(collect.foe)}: collect ${item.missing} ${item.name} and train ${cap(main)} (${item.missing} kills)`, { name: item.name, count: item.count }, item.missing, item.missing),
          trainPhase(follow, goals),
        ]));
      }
    }
  }

  // --- Defence first
  const defenceNow = Math.max(ctx.xp && typeof ctx.xp.defence === 'number' ? ctx.xp.defence : xpForLevel(ctx.stats.defence ?? 1), kit?.length ? xpForLevel(kitDefence) : 0);
  const later = laterDefence(inp.steps, step.id, inp.done);
  const laterXp = later.reduce((a, l) => a + l.xp, 0);
  const defenceTrainer = (n: number) => bestOf(estimates(step, 'Cow', [{ skill: 'defence', exp: xpForLevel(n) }], live).filter((e) => !unsafe(e.foe, spots.get('Cow'), hp)));
  for (const n of DEFENCE_STEPS) {
    if (xpForLevel(n) <= defenceNow) continue;
    const trainDef = defenceTrainer(n);
    if (!trainDef) continue;
    const laterCtx = afterPhase(live, trainDef, { defence: xpForLevel(n) });
    const rest = chooseVariant(objectiveEstimates(step, foe, goals, item?.missing ?? 0, laterCtx), ctx.fights);
    if (!rest) continue;
    const dSpot = spots.get(trainDef.foe.name);
    if (!dSpot) continue;
    plans.push(make('defence-first', `defence-first:${n}`, `Defence ${n} first, then the route`, [
      looted(phaseOf('defence', trainDef, dSpot, [{ skill: 'defence', exp: xpForLevel(n) }], `${foeLabel(trainDef.foe)}: Defence to ${n} (${trainDef.kills} kills)`), trainDef),
      looted(phaseOf('route', rest, routeSpot, goals, `${foeLabel(rest.foe)}: ${goalText(goals)}${item && item.missing > 0 ? ` and ${item.count} ${item.name}` : ''} (${Math.max(rest.kills, itemKills)} kills)`, item && item.missing > 0 ? { name: item.name, count: item.count } : undefined, Math.max(rest.kills, itemKills), item?.missing), rest, itemKills),
    ], inp.keepDefenceOne ? ['Your build keeps Defence at 1'] : [], later.length ? [laterNote(later, defenceNow)] : []));
  }

  // Unknown is not zero: with the bank unread the player may already hold some of the item, and every plan's item part is then a ceiling.
  if (item && item.missing > 0 && item.unread) {
    const note = inp.owned?.bankSeen
      ? `Your ${item.name} bank quantity is not checked; unseen holdings are not counted`
      : `Your bank has not been read, so ${item.name} you may already hold are not counted`;
    for (const p of plans) p.risks.push(note);
  }

  const route = plans[0];
  const eligible = plans.filter((p) => p.eligible);
  // The conservative time decides; plans within a few percent of each other are told apart by what they cost net of what the drops bring.
  const byTime = (a: EvaluatedPlan, b: EvaluatedPlan) => {
    if (Math.abs(a.score - b.score) <= Math.min(a.effort, b.effort) * TIE_BAND) return (b.net ?? -b.food.mid) - (a.net ?? -a.food.mid) || a.score - b.score || a.key.localeCompare(b.key);
    return a.score - b.score;
  };
  // The route gives Defence later for nothing: a Defence plan only helps the fights before that, so it must beat a working route by a clear margin on the
  // middle estimate as well, not only at the slow end.
  const worthEarly = (p: EvaluatedPlan) => p.id !== 'defence-first' || laterXp === 0 || !route.eligible || (route.minutes.mid - p.minutes.mid) / route.minutes.mid >= MIN_GAIN
    || (p.minutes.mid <= route.minutes.mid * 1.05 && p.food.mid <= route.food.mid * 0.5);
  const best = [...eligible.filter(worthEarly)].sort(byTime)[0] ?? route;
  // Another plan must clearly beat a route that works.
  const fresh = route.eligible && best.id !== 'route' && gainOver(route, best) < ROUTE_MARGIN ? route : best;
  let recommended = fresh;
  // The plan the player adopted stays while it is not clearly beaten.
  const adoptedKey = inp.adopted ? planKeyOf(plans, inp.adopted) : undefined;
  const adopted = adoptedKey ? plans.find((p) => p.key === adoptedKey && p.eligible) : undefined;
  if (adopted && adopted.score - best.score <= best.effort * (KEEP_MARGIN - 1)) recommended = adopted;
  // A Defence plan that looks better at the slow end only: the route's plan stays and the sentence says why.
  const held = recommended.id === 'route' ? [...eligible].sort(byTime).find((p) => !worthEarly(p) && route.eligible && gainOver(route, p) >= MIN_GAIN) : undefined;

  const confidence: PlanReport['confidence'] = recommended.basis === 'calibrated' ? 'HIGH' : recommended.basis === 'formula' ? 'MEDIUM' : 'LOW';
  return {
    stepId: step.id, objective, plans, recommended: recommended.key, fresh: fresh.key, confidence, compared: [...compared],
    reason: held ? heldReason(held, route, later) : reasonOf(recommended, route, price, plans),
    food: { name: foodItem.nameEn, heals: foodItem.heals!, price },
  };
}

const roundMin = (m: number) => (m < 10 ? Math.round(m) : Math.round(m / 5) * 5);
const durationText = (m: number) => {
  const r = roundMin(m);
  return r >= 120 ? `${Math.floor(r / 60)} h${r % 60 ? ` ${r % 60} min` : ''}` : `${r} min`;
};

/** Coins rounded for a sentence: "83,000". */
const roughGp = (n: number) => gpText(n >= 10000 ? Math.round(n / 1000) * 1000 : Math.round(n / 100) * 100);
/** "Big bones", "Cowhides": what a plan banks, in a sentence. */
export const lootName = (name: string) => (/s$/i.test(name) ? name : `${name}s`);
/** The coins a plan's loot brings, in a phrase: "about 83,000 gp of Big bones"; empty without loot. */
function coinsText(p: EvaluatedPlan): string {
  const lines = p.income.lines.filter((l) => l.counted && l.net > 0);
  return lines.length ? `about ${roughGp(p.income.net)} gp of ${lines.map((l) => lootName(l.name)).join(' and ')}` : '';
}

const andList = (parts: readonly string[]) => (parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);

/**
 * How a plan compares with the route's own, what it gains first and what it costs after: "about 10 min faster and about 83,000 gp more from drops than the
 * route as written", "about 34,000 gp more from drops than the route as written, for about 25 min more".
 */
function comparison(plan: EvaluatedPlan, route: EvaluatedPlan, price: number | null): string {
  const faster = route.minutes.mid - plan.minutes.mid;
  const fewer = route.food.mid - plan.food.mid;
  const coins = plan.income.net - route.income.net;
  const gains: string[] = [];
  const costs: string[] = [];
  if (faster >= 5) gains.push(`about ${durationText(faster)} faster`);
  else if (faster <= -5) costs.push(`about ${durationText(-faster)} more`);
  if (coins >= 1000) gains.push(`about ${roughGp(coins)} gp more from drops`);
  else if (coins <= -1000) costs.push(`about ${roughGp(-coins)} gp less from drops`);
  if (fewer >= 5) gains.push(`${Math.round(fewer / 5) * 5} fewer pieces of food${price !== null ? ` (about ${gpText(fewer * price)} gp)` : ''}`);
  else if (fewer <= -5) costs.push(`${Math.round(-fewer / 5) * 5} more pieces of food`);
  if (!gains.length) return `about the same as the route as written${costs.length ? `, for ${andList(costs)}` : ''}`;
  return `${andList(gains)} than the route as written${costs.length ? `, for ${andList(costs)}` : ''}`;
}

/**
 * Why this plan, in a sentence the player can check: against the route's own; for the route's own, against the fastest other plan when that one is
 * faster (what the route's loot or safety is worth over it).
 */
export function reasonOf(plan: EvaluatedPlan, route: EvaluatedPlan, price: number | null, plans: readonly EvaluatedPlan[] = []): string {
  if (plan.id !== 'route') return `${plan.title}: ${comparison(plan, route, price)}.`;
  if (!route.eligible) return 'No plan could be recommended: ' + (route.blockers[0] ?? 'the route\'s plan is not safe for you') + '.';
  const quickest = plans.filter((p) => p.eligible && p.id !== 'route').sort((a, b) => a.minutes.mid - b.minutes.mid)[0];
  const coins = coinsText(route);
  if (quickest && route.minutes.mid - quickest.minutes.mid >= 5) {
    const lessCoins = route.income.net - quickest.income.net;
    return `The route as written${coins ? ` banks ${coins}` : ' is the best balance'}: ${quickest.title.replace(/^Train on/, 'training on')} is about ${durationText(route.minutes.mid - quickest.minutes.mid)} faster${lessCoins >= 1000 ? ` but brings about ${roughGp(lessCoins)} gp less` : ''}.`;
  }
  return `The route as written is the quickest for your levels and kit${coins ? `, and it banks ${coins}` : ''}.`;
}

/**
 * The one short sentence the step shows under the plan in effect (2.69): why the guide selected it, or that it is the player's own choice. The full
 * comparison stays behind "Why this plan?".
 */
export function planWhy(report: PlanReport, key: string, source: 'auto' | 'player'): string {
  const plan = report.plans.find((p) => p.key === key);
  const route = report.plans[0];
  if (!plan) return '';
  if (source === 'player') return plan.id === 'route' ? 'You chose the route as written.' : `You chose this plan: ${comparison(plan, route, report.food.price)}.`;
  if (plan.id === 'route') return report.plans.length > 1 ? `Best for your levels and kit${coinsText(plan) ? `, banking ${coinsText(plan)}` : ''}.` : '';
  return `Recommended for your levels and kit: ${comparison(plan, route, report.food.price)}.`;
}

const levelAfter = (xp: number, grant: number) => levelForXp(xp + grant);

function laterNote(later: readonly LaterDefence[], defenceNow: number): string {
  const xp = later.reduce((a, l) => a + l.xp, 0);
  const first = later[0];
  return `Later in the route, ${first.stepId} (${first.title}) gives ${gpText(first.xp)} Defence XP${later.length > 1 ? ` and the steps after it ${gpText(xp - first.xp)} more` : ''}, about Defence ${levelAfter(defenceNow, xp)} with no training. Defence trained now only helps the fights before that.`;
}

/** The route's plan stays although a Defence plan looks faster at the slow end: the reward ahead gives the Defence anyway. */
function heldReason(held: EvaluatedPlan, route: EvaluatedPlan, later: readonly LaterDefence[]): string {
  const faster = route.minutes.mid - held.minutes.mid;
  const first = later[0];
  const gain = faster >= 5 ? `about ${durationText(faster)} faster` : 'about the same speed';
  return `The route as written stays. ${held.title} is ${gain} on the middle estimate, but ${first.stepId} (${first.title}) gives ${gpText(first.xp)} Defence XP later for nothing, so Defence trained now only helps the fights before it.`;
}
