// Ways to do a combat training step, side by side, each with the combat model's own numbers for this player. The route says one way (the step's
// opponent for every goal); the model can say how long that really takes and what it costs, and what the other ways would take. Nothing is chosen
// here in advance: every plan is estimated the same way, by lib/combatEstimate.ts, the one model the food plan already uses - there is no second one.
//
// The plans:
//   route          - the step as written: its opponent for every goal.
//   split          - the XP goals on the opponent the model finds fastest and cheapest in food, then the step's opponent only for what it alone gives
//                    (the item the step asks to be collected: 50 Big bones). Only when the step has such an item and another opponent is better.
//   defence-first  - Defence trained first (on the best opponent for it) to a level, then the route: less damage for the rest. Left out when the
//                    player's build keeps Defence at 1.
//
// Two stages, as the funding ranking: eligibility (the opponent cannot kill in one go, a plan with a known blocker is out) and then comparison
// (the conservative end of the time, with a penalty for a rough estimate). A plan other than the route is recommended only when it is clearly better,
// and a plan already adopted stays unless another is clearly better than it. The model's numbers are advice for choosing; the player adopts a plan.

import type { Step } from '../../types';
import type { OwnedState } from '../checklist';
import { nameKey } from '../checklist';
import {
  estimateStep, foeLabel, stepGoals, type Basis, type CombatEstimate, type CombatFoe, type Range, type StepEstimateContext,
} from '../combatEstimate';
import { chooseVariant, strengthDoses } from '../combatPlan';
import { levelForXp, xpForLevel } from '../xp';
import { netSale } from '../funding/ge';
import { absorbs, type PriceView } from '../funding/quotes';
import { isRestrictedItem, type TradeRestriction } from '../tradeRestriction';
import { laterDefence, type LaterDefence } from './later';
import { GUARANTEED_DROPS, SELL_DROP, spotsOf, TRAINER_LEVELS, TRAINERS, type Spot } from './spots';

export type MeleeSkill = 'attack' | 'strength' | 'defence';
export interface Goal { skill: MeleeSkill; exp: number }

export type PlanId = 'route' | 'split' | 'defence-first';

export interface PlanPhase {
  /** train: the XP goals; item: the drops; defence: Defence first; route: the step as written. */
  kind: 'train' | 'item' | 'defence' | 'route';
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
  /** Conservative minutes with the penalty for a rough estimate: the number plans are compared by. */
  score: number;
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

const sum = (a: Range, b: Range): Range => ({ low: a.low + b.low, mid: a.mid + b.mid, high: a.high + b.high });
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

/** The step with the goals and opponent the estimator should be asked about; the food is the step's own. */
function asked(step: Step, foe: string, goals: readonly Goal[]): Pick<Step, 'pacing' | 'foes' | 'itemsRequired'> {
  const [first, ...rest] = goals;
  return {
    foes: [foe],
    ...(step.itemsRequired ? { itemsRequired: step.itemsRequired } : {}),
    pacing: {
      skill: first.skill, targetLevel: levelForXp(first.exp), targetExp: first.exp, actionName: 'kill', expPerAction: 1,
      ...(rest.length ? { also: rest.map((g) => g.skill), goals: Object.fromEntries(rest.map((g) => [g.skill, { level: levelForXp(g.exp), exp: g.exp }])) } : {}),
    },
  };
}

function phaseOf(kind: PlanPhase['kind'], e: CombatEstimate, spot: Spot, goals: Goal[], text: string, item?: PlanPhase['item'], killsOverride?: number): PlanPhase {
  // An item phase stops at the number of kills the item needs, not at the XP the estimate was asked for.
  const k = killsOverride ?? e.kills;
  const f = e.kills > 0 ? k / e.kills : 1;
  const scale = (r: Range): Range => ({ low: r.low * f, mid: r.mid * f, high: r.high * f });
  return {
    kind, foe: e.foe, spot, goals, ...(item ? { item } : {}), kills: Math.round(k), minutes: scale(e.totalMinutes), food: scale(e.food), text, basis: e.basis,
    killsPerTrip: e.killsPerTrip,
  };
}

/** The XP goals of a step for the plan: the step's own, as they stand. */
const goalsOf = (step: Step): Goal[] => stepGoals(step).map((g) => ({ skill: g.skill, exp: g.exp }));

const goalText = (goals: readonly Goal[]) => goals.map((g) => `${cap(g.skill)} to ${levelForXp(g.exp)}`).join(' and ');

/** What the step asks to be collected from its opponent: the items of its game trigger that the opponent always drops, and how many are still missing. */
function itemGoal(step: Step, owned: OwnedState | null): { name: string; count: number; missing: number; held: number | null; unread: boolean } | null {
  const foe = step.foes?.[0];
  const trig = step.inGame?.completionTrigger?.items;
  if (!foe || !trig?.length) return null;
  const drops = GUARANTEED_DROPS[foe] ?? [];
  for (const it of trig) {
    const name = it.names.find((n) => drops.some((d) => nameKey(d) === nameKey(n)));
    if (!name) continue;
    const o = owned?.items.get(nameKey(name));
    // Unknown holdings are not zero: without a read of the bag and bank the whole count is still to collect, and the plan says so.
    const held = o && owned?.bankSeen ? o.carried + o.noted + (o.bank ?? 0) : o && !owned?.bankSeen ? o.carried + o.noted : null;
    return { name, count: it.count, missing: Math.max(0, it.count - (held ?? 0)), held, unread: !owned?.bankSeen };
  }
  return null;
}

/** The estimates of one opponent for some goals, with every free version of it; each is a candidate. */
function estimates(step: Step, foe: string, goals: Goal[], ctx: StepEstimateContext): CombatEstimate[] {
  return estimateStep(asked(step, foe, goals), ctx);
}

/** The fastest of the estimates by the conservative end, the one with the least food among equals. */
function bestOf(list: CombatEstimate[]): CombatEstimate | null {
  return [...list].sort((a, b) => a.totalMinutes.high - b.totalMinutes.high || a.food.mid - b.food.mid || (a.foe.combat - b.foe.combat))[0] ?? null;
}

function risksOf(phases: PlanPhase[], hp: number): { risks: string[]; blockers: string[] } {
  const risks: string[] = [];
  const blockers: string[] = [];
  for (const p of phases) {
    const name = foeLabel(p.foe);
    if (p.foe.maxHit * 2 >= hp) blockers.push(`${name} can hit for ${p.foe.maxHit}, more than half of your ${hp} health`);
    else if (p.foe.aggressive) risks.push(`${name} is aggressive: you cannot choose when to fight`);
    if (Number.isFinite(p.killsPerTrip) && p.killsPerTrip < FEW_KILLS && p.kind !== 'defence') risks.push(`A full bag lasts only about ${Math.max(1, Math.floor(p.killsPerTrip))} ${name} kills`);
  }
  return { risks: [...new Set(risks)], blockers };
}

/**
 * What the drops of a plan bring: one sellable drop a kill (SELL_DROP), less what the step reserves (the Big bones it asks to be banked), at the exchange's
 * sell side after the tax, only for what the market can take in about the plan's hours, and not at all for an item the account cannot sell yet.
 */
export function incomeOf(phases: readonly PlanPhase[], reserve: { name: string; qty: number } | null, prices: PriceView | null | undefined, restriction: TradeRestriction['state'] | undefined): PlanIncome {
  const dropped = new Map<string, number>();
  for (const p of phases) {
    const name = SELL_DROP[p.foe.name];
    if (name) dropped.set(name, (dropped.get(name) ?? 0) + p.kills);
  }
  const hours = Math.max(1, phases.reduce((a, p) => a + p.minutes.mid, 0) / 60);
  const lines: PlanIncome['lines'] = [];
  for (const [name, total] of dropped) {
    const kept = reserve && nameKey(reserve.name) === nameKey(name) ? reserve.qty : 0;
    const qty = Math.max(0, total - kept);
    if (qty <= 0) continue;
    const unit = prices?.sell(name) ?? null;
    if (!unit) { lines.push({ name, qty, net: 0, counted: false, note: 'no exchange price' }); continue; }
    if (isRestrictedItem(name) && restriction !== 'LIFTED') {
      lines.push({ name, qty, net: 0, counted: false, note: restriction === 'RESTRICTED' ? 'this account cannot sell it yet' : 'it is not known whether this account can sell it yet' });
      continue;
    }
    // The market takes about a quarter of an hour's trades from one seller; the rest of a big batch is not counted.
    const room = unit.volumePerHour === null ? qty : Math.floor(Math.min(qty, absorbs(unit, 1).share === null ? qty : (unit.volumePerHour * 0.25) * hours));
    const sold = Math.max(0, room);
    lines.push({ name, qty: sold, net: netSale(unit.price, sold, name), counted: true, ...(sold < qty ? { note: `only ${sold} of ${qty} counted: more than the market takes in about ${Math.round(hours)} h` } : {}) });
  }
  return { net: lines.filter((l) => l.counted).reduce((a, l) => a + l.net, 0), lines };
}

function assemble(id: PlanId, key: string, title: string, phases: PlanPhase[], hp: number, price: number | null, income: PlanIncome, extraBlockers: string[] = [], notes: string[] = []): EvaluatedPlan {
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
    basis, risks, notes, blockers: all, eligible: all.length === 0,
    score: minutes.high * BASIS_PENALTY[basis],
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
  const spots = spotsOf(inp.steps);
  const routeSpot = spots.get(foe);
  const foodItem = (step.itemsRequired ?? []).find((i) => typeof i.heals === 'number');
  if (!routeSpot || !foodItem || !ctx.stats || typeof ctx.stats.hitpoints !== 'number') return null;
  const hp = ctx.stats.hitpoints;
  const price = inp.foodPrice ?? null;
  const doses = strengthDoses(inp.owned);
  const live: StepEstimateContext = { ...ctx, strengthDoses: doses };
  const item = itemGoal(step, inp.owned);
  const objective = [goalText(goals), item ? `${item.count} ${item.name}` : null].filter(Boolean).join(', ');

  // --- The route as written
  const routeEst = chooseVariant(estimates(step, foe, goals, live), ctx.fights);
  if (!routeEst) return null;
  const itemKills = item && item.missing > 0 ? item.missing : 0;
  const routePhase = phaseOf('route', routeEst, routeSpot, goals,
    `${foeLabel(routeEst.foe)}: ${goalText(goals)}${item && item.missing > 0 ? ` and ${item.count} ${item.name}` : ''} (${Math.max(routeEst.kills, itemKills)} kills)`, undefined, Math.max(routeEst.kills, itemKills));
  // What the step asks to be banked is reserved: it is never counted as something to sell.
  const reserve = item && item.missing > 0 ? { name: item.name, qty: item.missing } : null;
  const make = (id: PlanId, key: string, title: string, phases: PlanPhase[], extra: string[] = [], notes: string[] = []) =>
    assemble(id, key, title, phases, hp, price, incomeOf(phases, reserve, inp.prices, inp.restriction), extra, notes);
  const plans: EvaluatedPlan[] = [make('route', 'route', 'The route\'s plan', [routePhase])];
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
  const safe = candidates.filter((e) => e.foe.maxHit * 2 < hp);
  const trainer = bestOf(safe);

  // --- Split: the goals on the trainer, the item from the step's opponent
  if (item && item.missing > 0 && trainer && trainer.foe !== routeEst.foe && trainer.foe.name !== routeEst.foe.name) {
    const after: Partial<Record<MeleeSkill, number>> = {};
    for (const g of goals) after[g.skill] = g.exp;
    const main = goals[0].skill;
    const perKill = 4 * routeEst.foe.hitpoints;
    const collect = estimateStep(asked(step, foe, [{ skill: main, exp: (after[main] ?? 0) + item.missing * perKill }]), { ...live, assume: assumeXp(live.assume, after) })
      .find((e) => e.foe.combat === routeEst.foe.combat);
    if (collect) {
      const spot = spots.get(trainer.foe.name)!;
      plans.push(make('split', 'split', `${trainer.foe.name === 'Cow' ? 'Cows' : trainer.foe.name}, then ${routeEst.foe.name} for the ${item.name}`, [
        phaseOf('train', trainer, spot, goals, `${foeLabel(trainer.foe)}: ${goalText(goals)} (${trainer.kills} kills)`),
        phaseOf('item', collect, routeSpot, [], `${foeLabel(collect.foe)}: ${item.missing} ${item.name} (${item.missing} kills)`, { name: item.name, count: item.count }, item.missing),
      ]));
    }
  }

  // --- Defence first
  const defenceNow = ctx.xp && typeof ctx.xp.defence === 'number' ? ctx.xp.defence : xpForLevel(ctx.stats.defence ?? 1);
  const later = laterDefence(inp.steps, step.id, inp.done);
  const laterXp = later.reduce((a, l) => a + l.xp, 0);
  const defenceTrainer = (n: number) => bestOf(estimates(step, 'Cow', [{ skill: 'defence', exp: xpForLevel(n) }], live).filter((e) => e.foe.maxHit * 2 < hp));
  for (const n of DEFENCE_STEPS) {
    if (xpForLevel(n) <= defenceNow) continue;
    const trainDef = defenceTrainer(n);
    if (!trainDef) continue;
    const rest = chooseVariant(estimateStep(asked(step, foe, goals), { ...live, assume: assumeXp(live.assume, { defence: xpForLevel(n) }) }), ctx.fights);
    if (!rest) continue;
    const dSpot = spots.get(trainDef.foe.name);
    if (!dSpot) continue;
    plans.push(make('defence-first', `defence-first:${n}`, `Defence ${n} first, then the route`, [
      phaseOf('defence', trainDef, dSpot, [{ skill: 'defence', exp: xpForLevel(n) }], `${foeLabel(trainDef.foe)}: Defence to ${n} (${trainDef.kills} kills)`),
      phaseOf('route', rest, routeSpot, goals, `${foeLabel(rest.foe)}: ${goalText(goals)} (${rest.kills} kills)`),
    ], inp.keepDefenceOne ? ['Your build keeps Defence at 1'] : [], later.length ? [laterNote(later, defenceNow)] : []));
  }

  // Unknown is not zero: with the bank unread the player may already hold some of the item, and every plan's item part is then a ceiling.
  if (item && item.missing > 0 && item.unread) {
    for (const p of plans) p.risks.push(`Your bank has not been read, so ${item.name} you may already hold are not counted`);
  }

  const route = plans[0];
  const eligible = plans.filter((p) => p.eligible);
  // The conservative time decides; plans within a few percent of each other are told apart by what they cost net of what the drops bring.
  const byTime = (a: EvaluatedPlan, b: EvaluatedPlan) => {
    if (Math.abs(a.score - b.score) <= Math.min(a.score, b.score) * TIE_BAND) return (a.net ?? -a.food.mid) - (b.net ?? -b.food.mid) > 0 ? -1 : 1;
    return a.score - b.score;
  };
  // The route gives Defence later for nothing: a Defence plan only helps the fights before that, so it must beat a working route by a clear margin on the
  // middle estimate as well, not only at the slow end.
  const worthEarly = (p: EvaluatedPlan) => p.id !== 'defence-first' || laterXp === 0 || !route.eligible || (route.minutes.mid - p.minutes.mid) / route.minutes.mid >= MIN_GAIN;
  const best = [...eligible.filter(worthEarly)].sort(byTime)[0] ?? route;
  // Another plan must clearly beat a route that works.
  const fresh = route.eligible && best.id !== 'route' && (route.score - best.score) / route.score < ROUTE_MARGIN ? route : best;
  let recommended = fresh;
  // The plan the player adopted stays while it is not clearly beaten.
  const adopted = inp.adopted ? plans.find((p) => p.key === inp.adopted && p.eligible) : undefined;
  if (adopted && adopted.score <= best.score * KEEP_MARGIN) recommended = adopted;
  // A Defence plan that looks better at the slow end only: the route's plan stays and the sentence says why.
  const held = recommended.id === 'route' ? [...eligible].sort(byTime).find((p) => !worthEarly(p) && route.eligible && (route.score - p.score) / route.score >= MIN_GAIN) : undefined;

  const confidence: PlanReport['confidence'] = recommended.basis === 'calibrated' ? 'HIGH' : recommended.basis === 'formula' ? 'MEDIUM' : 'LOW';
  return {
    stepId: step.id, objective, plans, recommended: recommended.key, fresh: fresh.key, confidence, compared: [...compared],
    reason: held ? heldReason(held, route, later) : reasonOf(recommended, route, price),
    food: { name: foodItem.nameEn, heals: foodItem.heals!, price },
  };
}

const roundMin = (m: number) => (m < 10 ? Math.round(m) : Math.round(m / 5) * 5);
const durationText = (m: number) => {
  const r = roundMin(m);
  return r >= 120 ? `${Math.floor(r / 60)} h${r % 60 ? ` ${r % 60} min` : ''}` : `${r} min`;
};

/** How a plan compares with the route's own: "about 10 min faster and 310 fewer pieces of food (about 10,197 gp)". */
function comparison(plan: EvaluatedPlan, route: EvaluatedPlan, price: number | null): string {
  const faster = route.minutes.mid - plan.minutes.mid;
  const fewer = route.food.mid - plan.food.mid;
  const parts: string[] = [];
  if (faster >= 5) parts.push(`about ${durationText(faster)} faster`);
  else if (faster <= -5) parts.push(`about ${durationText(-faster)} slower`);
  if (fewer >= 5) parts.push(`${Math.round(fewer / 5) * 5} fewer pieces of food${price !== null ? ` (about ${gpText(fewer * price)} gp)` : ''}`);
  else if (fewer <= -5) parts.push(`${Math.round(-fewer / 5) * 5} more pieces of food`);
  return parts.length ? parts.join(' and ') : 'about the same time and food';
}

/** Why this plan, against the route's, in a sentence the player can check. */
export function reasonOf(plan: EvaluatedPlan, route: EvaluatedPlan, price: number | null): string {
  if (plan.id === 'route') return route.eligible ? 'The route as written is as good as any plan this model can compare, so it stays.' : 'No plan could be recommended: ' + (route.blockers[0] ?? 'the route\'s plan is not safe for you') + '.';
  return `${plan.title}: ${comparison(plan, route, price)} than the route as written.`;
}

/**
 * The one short sentence the step shows under the plan in effect (2.69): why the guide selected it, or that it is the player's own choice. The full
 * comparison stays behind "Why this plan?".
 */
export function planWhy(report: PlanReport, key: string, source: 'auto' | 'player'): string {
  const plan = report.plans.find((p) => p.key === key);
  const route = report.plans[0];
  if (!plan) return '';
  if (source === 'player') return plan.id === 'route' ? 'You chose the route as written.' : `You chose this plan: ${comparison(plan, route, report.food.price)} than the route as written.`;
  if (plan.id === 'route') return report.plans.length > 1 ? 'Recommended for your levels and kit: no other plan is clearly better.' : '';
  return `Recommended for your levels and kit: ${comparison(plan, route, report.food.price)} than the route as written.`;
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
