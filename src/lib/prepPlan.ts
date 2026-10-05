// The preparation plan: one decision "what is needed before the step", from which the views are drawn: "What you need" in the app
// (and the in-game list and the bank check are moved onto it by protocol 6). It has no checks of its own: it takes readiness (readiness.ts), "one trip" (oneTrip.ts)
// and where to get it (sourceRouter.ts), and adds what they lacked separately:
//  - where the item is: worn / in the bag / in the bank / none / unknown;
//  - how important: critical (the step cannot be done without it) / important / an improvement / optional;
//  - when it will be needed: now / in the next steps / during the step / later ("do not take now");
//  - what to do: collect, buy (from whom and for how much), earn, gather, open the bank;
//  - whether the consumable is enough: enough / low / very low;
//  - whether it all fits in the bag; how ready the player is overall.
// "Unknown is not none": what the app cannot check it does not call missing and does not count toward readiness.
// It buys nothing: the player decides and confirms.

import type { Progress, Step, WikiItemDetail } from '../types';
import { itemById } from '../data';
import recipesJson from '../data/recipes.json';
import { npcSpot } from './stepPlaces';
import type { NavTargetPayload } from '../services/runeliteBridge';
import { upgradeNav, type UpgradeRecommendation } from '../services/gearUpgradeRouter';
import { aggregateShopping, plural, type ShoppingLine } from './shopping';
import { heldOf, type PlayerState } from './playerState';
import { nearestBank, type StepReadiness } from './readiness';
import { planSources, type SourceOption } from './sourceRouter';
import { tripWindow, type OneTripPlan } from './oneTrip';
import { preflightItems } from './checklist';
import { weightAdvice, type WeightAdvice } from './weight';
import { recoverySteps, type Recovery, type RecoveryStep } from './recovery';

/** Critical: the step cannot be done without it; important: better to prepare before leaving; an improvement saves time or money; optional is a convenience. */
export type PrepPriority = 'CRITICAL' | 'IMPORTANT' | 'OPTIMIZATION' | 'OPTIONAL';
/** Where the item is now. */
export type PrepWhere = 'EQUIPPED' | 'INVENTORY' | 'BANK' | 'MISSING' | 'UNKNOWN';
/** When it is needed: now, in the next steps, during the step itself (you will get it), later (do not take now). */
export type PrepTiming = 'NOW' | 'SOON' | 'IN_STEP' | 'LATER';
/** Whether the consumable is enough: enough / low / very low. */
export type Supply = 'ENOUGH' | 'LOW' | 'CRITICAL';

export type PrepActionKind = 'TAKE' | 'BUY' | 'EARN' | 'GATHER' | 'CONNECT' | 'UPGRADE';

export interface PrepAction {
  kind: PrepActionKind;
  label: string;
  /** The price per piece, if known. */
  price?: number;
  /** Where to lead the arrow; absent means a link leads. */
  nav?: NavTargetPayload;
  href?: string;
}

export interface PrepLine {
  key: string;
  /** The English name as in the bag, the bank and at the exchange. */
  name: string;
  /** How many are needed in all (for the nearest steps where the item is needed). */
  count: number;
  /** false means the quantity in the route is not a number, count is a lower estimate. */
  exact: boolean;
  where: PrepWhere;
  have: { bag: number | null; noted: number; bank: number | null; equipped: number };
  /** How many more to take (collect or buy); null means unknown. */
  toGet: number | null;
  priority: PrepPriority;
  timing: PrepTiming;
  /** For a consumable: whether it is enough; for a tool and a one-piece item: no. */
  supply?: Supply;
  /** What to do; absent means nothing is needed. */
  action?: PrepAction;
  /** Why it is needed: "For this step and 2 more", "heals +12 HP". */
  why: string;
  /** The steps where it will be needed, in order. */
  usedIn: string[];
}

export interface PrepScore {
  /** Done out of what can be checked; null means there is nothing to check with yet (no data from the game). */
  percent: number | null;
  ready: number;
  total: number;
  /** Critical problems: the step cannot be done without them. */
  critical: number;
  important: number;
  /** Improvements: faster or cheaper, but not mandatory. */
  optimizations: number;
  /** Not checked: not "none" but "unknown". */
  unknown: number;
  verdict: 'READY' | 'NOT_READY' | 'UNKNOWN';
}

export interface PrepSlots {
  /** Occupied bag slots; null means unknown (an old plugin or it has not yet sent the bag). */
  used: number | null;
  /** How many slots what has to be taken will occupy. Items in a stack (runes, arrows, coins) take one each. */
  adding: number;
  /** Will not fit: by how many slots over 28. 0 means it fits or is unknown. */
  over: number;
}

export interface PrepPlan {
  stepId: string;
  stepIds: string[];
  /** All the lines in order: critical first. */
  lines: PrepLine[];
  /** Take now: this step needs it and it is not in the bag. */
  now: PrepLine[];
  /** While you are at it: it will be needed in the nearest steps. */
  soon: PrepLine[];
  /** You will get it during the step: no need to take it in advance. */
  byTheWay: PrepLine[];
  /** Already ready: worn or in the bag in the needed quantity. */
  have: PrepLine[];
  /** Do not take now: it will be needed later. */
  later: PrepLine[];
  /** Improvements and optional items. */
  optimizations: PrepLine[];
  /** A level, a quest, a closed step: what items cannot fix. */
  blockers: { label: string; detail?: string }[];
  /** The recovery mode after a setback: what to do in order; null means no setback. */
  recovery: { recovery: Recovery; steps: RecoveryStep[]; missing: number } | null;
  /** Extra weight on a non-combat step: what to leave in the bank and how much longer running will last. */
  weight: WeightAdvice & { action?: PrepAction };
  coins: { need: number; have: number | null; missing: number | null; action?: PrepAction };
  slots: PrepSlots;
  score: PrepScore;
}

export interface PrepPlanInput {
  step: Step;
  steps: Step[];
  progress: Progress;
  state: PlayerState;
  trip: OneTripPlan;
  readiness: StepReadiness;
  /** A tool tip (gearUpgradeRouter); null means no upgrade. */
  upgrade?: UpgradeRecommendation | null;
  /** An item card for "where to get it" (the project's database by default). */
  detail?: (id: number) => WikiItemDetail | undefined;
  /** A setback on this step (a death, a teleport); null means none. */
  recovery?: Recovery | null;
}

export const BAG_SLOTS = 28;
/** From how many pieces an item counts as a consumable (food, runes, arrows): for it "enough / low" applies. */
export const SUPPLY_FROM = 5;

const STACKS = /(^coins$|\brunes?\b|\barrows?\b|\bbolts?\b|\bdarts?\b|\bjavelins?\b|\bfeathers?\b|\bbait\b|\bseeds?\b|\bnails?\b|\bthrowing)/i;
/** A stack of items takes one slot; the rest one slot per piece. An estimate, hence "≈" in the answer. */
export const stacks = (name: string) => STACKS.test(name);

const gp = (n: number) => Math.round(n).toLocaleString('en-US');

function supplyOf(need: number, inBag: number, reusable: boolean, danger: boolean): Supply | undefined {
  if (reusable || need < SUPPLY_FROM) return undefined;
  if (inBag >= need) return 'ENOUGH';
  const ratio = inBag / need;
  // "Very low" is under a third; for combat under a half: you must not leave with such a stock.
  return ratio < (danger ? 0.5 : 1 / 3) ? 'CRITICAL' : 'LOW';
}

function whyOf(line: ShoppingLine, group: string[], all: string[], currentId: string, ids: string[], heal?: number): string {
  const parts: string[] = [];
  const others = Math.max(0, all.length - 1);
  const more = others > 0 ? ` and ${others} more` : '';
  if (group[0] === currentId) {
    // "For this step" is already visible from the "Needed now" section; we write it only if the item is needed somewhere else too.
    if (others > 0) parts.push(`Also needed in ${others} ${plural(others, 'next step', 'next steps')}`);
  } else if (group[0]) {
    const dist = Math.max(1, ids.indexOf(group[0]));
    parts.push(`Needed in ${group[0]}, in ${dist} ${plural(dist, 'step', 'steps')}${more}`);
  } else {
    parts.push('Needed in the next steps');
  }
  if (line.reusable) parts.push('tool: one for all the steps');
  if (heal) parts.push(`heals +${heal} HP`);
  return parts.join(' · ');
}

function bankAction(step: Step, name: string, n: number): PrepAction {
  const b = nearestBank(step);
  return {
    kind: 'TAKE',
    label: `Take from the bank${n > 1 ? ` ×${n}` : ''}`,
    ...(b ? { nav: { label: `${b.label}: take ${name}`, x: b.x, y: b.y, plane: b.plane, itemName: name, stepId: step.id } } : {}),
  };
}

function sourceAction(src: SourceOption | null, name: string, toGet: number, coinsTotal: number | null, stepId: string): PrepAction | undefined {
  if (!src) return { kind: 'BUY', label: 'Buy at the exchange or in a shop', href: '#/shopping' };
  const nav = src.point ? { label: `${src.point.label}: ${name}`, x: src.point.x, y: src.point.y, plane: src.point.plane, itemName: name, stepId } : undefined;
  if (src.kind === 'free') return { kind: 'GATHER', label: src.label, ...(nav ? { nav } : {}) };
  if (src.kind === 'drop') return { kind: 'GATHER', label: src.label };
  if (src.kind === 'bag' || src.kind === 'bank') return undefined;
  const total = src.price !== undefined ? src.price * toGet : null;
  // Not enough money: "buy" would be an empty piece of advice, so earn first.
  if (total !== null && coinsTotal !== null && coinsTotal < total) {
    return { kind: 'EARN', label: `Short of ${gp(total - coinsTotal)} gp for ${name}: earn it first`, ...(src.price !== undefined ? { price: src.price } : {}), href: '#/shopping' };
  }
  return {
    kind: 'BUY',
    label: `Buy: ${src.label}${src.price ? `, ${gp(src.price)} gp` : ''}${toGet > 1 && src.price ? ` each` : ''}`,
    ...(src.price !== undefined ? { price: src.price } : {}),
    ...(nav ? { nav } : {}),
    ...(nav ? {} : { href: '#/shopping' }),
  };
}

interface Recipe { makeAt: string; from: { nameEn: string; count: number; how: string; npc?: string }[] }
const RECIPES = (recipesJson as { recipes: Record<string, Recipe> }).recipes;

/**
 * An item that is missing but can be made from others (Orange dye from Red and Yellow dye): the ingredients are planned as well, so the player is warned
 * before leaving the place that makes them. An ingredient already in the bag is not repeated; one that may lie in the bank stays "not checked".
 */
function recipeLines(parent: PrepLine, step: Step, state: PlayerState): PrepLine[] {
  const recipe = RECIPES[parent.name];
  if (!recipe || (parent.where !== 'MISSING' && parent.where !== 'UNKNOWN')) return [];
  const out: PrepLine[] = [];
  for (const ing of recipe.from) {
    const held = heldOf(state, ing.nameEn);
    const count = ing.count * Math.max(1, parent.count - ((parent.have.bag ?? 0) + parent.have.noted));
    if ((held.bag ?? 0) + held.noted >= count) continue;
    const where: PrepWhere = held.presence === 'UNKNOWN' ? 'UNKNOWN' : (held.bank ?? 0) > 0 ? 'BANK' : held.presence === 'MISSING' ? 'MISSING' : 'INVENTORY';
    const spot = ing.npc ? npcSpot(ing.npc, step.id) : undefined;
    out.push({
      key: `recipe:${parent.key}:${ing.nameEn}`, name: ing.nameEn, count, exact: true, where,
      have: { bag: held.bag, noted: held.noted, bank: held.bank, equipped: held.equipped },
      toGet: where === 'MISSING' ? count : null, priority: 'IMPORTANT', timing: parent.timing,
      action: where === 'BANK' ? bankAction(step, ing.nameEn, count)
        : { kind: 'GATHER', label: ing.how, ...(spot ? { nav: { label: `${recipe.makeAt}: ${ing.nameEn}`, x: spot.x, y: spot.y, plane: spot.plane, itemName: ing.nameEn, stepId: step.id } } : {}) },
      why: `${parent.name} is made from ${recipe.from.map((f) => f.nameEn).join(' + ')} — or buy it`, usedIn: parent.usedIn,
    });
  }
  return out;
}

const ORDER: Record<PrepPriority, number> = { CRITICAL: 0, IMPORTANT: 1, OPTIMIZATION: 2, OPTIONAL: 3 };
const TIMING: Record<PrepTiming, number> = { NOW: 0, SOON: 1, IN_STEP: 2, LATER: 3 };

export function buildPrepPlan(i: PrepPlanInput): PrepPlan {
  const { step, state, trip } = i;
  const detail = i.detail ?? ((id: number) => itemById.get(id));
  const ids = trip.stepIds;
  const heals = new Map(preflightItems(step).filter((p) => p.heals).map((p) => [p.nameEn.toLowerCase(), p.heals as number]));
  const coinsTotal = trip.coins.have;
  const danger = Boolean(step.foes?.length);
  const lines: PrepLine[] = [];

  for (const t of trip.lines) {
    const inStep = t.line.inStepOnly;
    const equipped = t.held.equipped;
    const allIds = t.allocation.filter((x) => x.need > 0).map((x) => x.stepId);
    // One item is divided by deadlines: how much this step needs, how much the nearest ones, how much later. What is in the bag is spent first,
    // then what is in the bank: so it is visible what to do with what, rather than "need 40, have 20".
    let bagPool = (t.held.bag ?? 0) + t.held.noted;
    const bankKnown = t.held.bank !== null || t.held.source === 'manual';
    let bankPool = t.held.bank ?? Math.max(0, (t.held.total ?? 0) - bagPool);
    const known = t.held.presence !== 'UNKNOWN';
    const groups = new Map<PrepTiming, { need: number; ids: string[]; bag: number; bank: number; missing: number; unknown: number }>();
    for (const a of t.allocation.filter((x) => x.need > 0)) {
      const idx = ids.indexOf(a.stepId);
      const timing: PrepTiming = inStep ? 'IN_STEP' : idx <= 0 ? 'NOW' : idx <= 2 ? 'SOON' : 'LATER';
      const g = groups.get(timing) ?? { need: 0, ids: [], bag: 0, bank: 0, missing: 0, unknown: 0 };
      const fromBag = Math.min(bagPool, a.need);
      bagPool -= fromBag;
      let rest = a.need - fromBag;
      let fromBank = 0;
      if (rest > 0 && known && bankKnown) {
        fromBank = Math.min(bankPool, rest);
        bankPool -= fromBank;
        rest -= fromBank;
        g.missing += rest;
      } else if (rest > 0) {
        g.unknown += rest;
      }
      g.need += a.need; g.bag += fromBag; g.bank += fromBank;
      g.ids.push(a.stepId);
      groups.set(timing, g);
    }
    for (const [timing, g] of groups) {
      const where: PrepWhere = g.unknown > 0 ? 'UNKNOWN' : g.missing > 0 ? 'MISSING' : g.bank > 0 ? 'BANK' : equipped > 0 && equipped >= g.bag ? 'EQUIPPED' : 'INVENTORY';
      const satisfied = where === 'INVENTORY' || where === 'EQUIPPED';
      const priority: PrepPriority = inStep ? 'OPTIONAL' : timing === 'NOW' ? 'CRITICAL' : 'IMPORTANT';
      const toGet = where === 'UNKNOWN' ? null : where === 'MISSING' ? g.missing : where === 'BANK' ? g.bank : 0;
      let action: PrepAction | undefined;
      if (inStep && !satisfied) {
        action = { kind: 'GATHER', label: 'You get it during the step' };
      } else if (where === 'BANK') {
        action = bankAction(step, t.line.nameEn, g.bank);
      } else if (where === 'MISSING') {
        const plan = planSources({ name: t.line.nameEn, need: g.missing, detail: t.line.id !== undefined ? detail(t.line.id) : undefined, manualKey: t.line.key }, state);
        action = sourceAction(plan.primary, t.line.nameEn, g.missing, coinsTotal, step.id);
      } else if (where === 'UNKNOWN') {
        action = state.connected
          ? { kind: 'CONNECT', label: 'Open the bank in the game and I will check what you have' }
          : { kind: 'CONNECT', label: 'Connect RuneLite and I will check what you have', href: '#/settings' };
      }
      // A consumable is counted by what the nearest deadline needs: whether it is enough to go out with.
      const supply = timing === 'NOW' ? supplyOf(g.need, g.bag, t.line.reusable, danger) : undefined;
      lines.push({
        key: timing === 'NOW' || timing === 'IN_STEP' ? t.line.key : `${t.line.key}@${timing.toLowerCase()}`,
        name: t.line.nameEn, count: g.need, exact: t.line.exact, where,
        have: { bag: t.held.bag, noted: t.held.noted, bank: t.held.bank, equipped },
        toGet, priority, timing, ...(supply ? { supply } : {}), ...(action ? { action } : {}),
        why: whyOf(t.line, g.ids, allIds, step.id, ids, heals.get(t.line.nameEn.toLowerCase())), usedIn: g.ids,
      });
    }
  }

  // Made items: if one is missing, its ingredients are planned too.
  for (const l of [...lines]) lines.push(...recipeLines(l, step, state));

  // Recommended: not needed for the step but it saves time; we do not force it: that is an "improvement".
  const window = tripWindow(i.steps, i.progress, step.id, Math.max(0, ids.length - 1));
  const recommended = aggregateShopping(window).recommended;
  const optimizations: PrepLine[] = [];
  for (const r of recommended.slice(0, 6)) {
    const held = heldOf(state, r.nameEn, r.key);
    if (held.presence === 'PRESENT' && (held.bag ?? 0) + held.noted >= r.count) continue;
    const inCurrent = r.sources.some((s) => s.stepId === step.id);
    const bank = (held.bank ?? 0) > 0;
    optimizations.push({
      key: `rec:${r.key}`, name: r.nameEn, count: r.count, exact: r.exact,
      where: held.presence === 'UNKNOWN' ? 'UNKNOWN' : bank ? 'BANK' : 'MISSING',
      have: { bag: held.bag, noted: held.noted, bank: held.bank, equipped: held.equipped },
      toGet: null, priority: inCurrent ? 'OPTIMIZATION' : 'OPTIONAL', timing: inCurrent ? 'NOW' : 'SOON',
      ...(bank ? { action: bankAction(step, r.nameEn, 1) } : {}),
      why: r.sources[0] ? `Recommended in ${r.sources[0].stepId}` : 'Recommended', usedIn: r.sources.map((s) => s.stepId),
    });
  }
  const up = i.upgrade;
  if (up && (up.status === 'UPGRADE_AVAILABLE' || up.status === 'UPGRADE_NOT_AFFORDABLE') && up.recommendedItem) {
    const afford = up.status === 'UPGRADE_AVAILABLE';
    const nav = afford ? upgradeNav(up, step.id) : null;
    const cost = up.approxCost;
    optimizations.unshift({
      key: `upgrade:${up.recommendedItem}`, name: up.recommendedItem, count: 1, exact: true,
      where: 'MISSING', have: { bag: null, noted: 0, bank: null, equipped: 0 }, toGet: 1, priority: 'OPTIMIZATION', timing: 'NOW',
      action: afford
        ? { kind: 'UPGRADE', label: `Buy ${up.recommendedItem}${up.npc ? ` from ${up.npc}` : ''}${cost ? `, ~${gp(cost)} gp` : ''}`, ...(cost ? { price: cost } : {}), ...(nav ? { nav } : {}) }
        : { kind: 'EARN', label: `${up.recommendedItem}: ~${gp(cost ?? 0)} gp needed, not enough yet` },
      why: [up.currentItem ? `Better than ${up.currentItem}` : '', up.reason ?? ''].filter(Boolean).join(' · ') || 'Faster than the current tool',
      usedIn: [step.id],
    });
  }

  // Coins are a separate readiness line.
  const coinsMissing = trip.coins.missing;
  const coins: PrepPlan['coins'] = {
    need: trip.coins.need, have: trip.coins.have, missing: coinsMissing,
    ...(coinsMissing !== null && coinsMissing > 0 ? { action: { kind: 'EARN' as const, label: `Short of ${gp(coinsMissing)} gp: earn it`, href: '#/shopping' } } : {}),
  };

  // What items cannot fix: levels, quests, a closed step.
  const blockers = i.readiness.problems
    .filter((p) => p.hard && (p.kind === 'skill' || p.kind === 'quest' || p.kind === 'step' || p.kind === 'qp' || p.kind === 'mode'))
    .map((p) => ({ label: p.label, ...(p.detail ? { detail: p.detail } : {}) }));

  const stepOrder = (l: PrepLine) => (l.usedIn[0] ? ids.indexOf(l.usedIn[0]) : 99);
  lines.sort((a, b) => ORDER[a.priority] - ORDER[b.priority] || TIMING[a.timing] - TIMING[b.timing] || stepOrder(a) - stepOrder(b) || (a.key < b.key ? -1 : 1));
  const satisfiedOf = (l: PrepLine) => l.where === 'INVENTORY' || l.where === 'EQUIPPED';
  const now = lines.filter((l) => l.timing === 'NOW' && !satisfiedOf(l));
  const soon = lines.filter((l) => l.timing === 'SOON' && !satisfiedOf(l));
  const byTheWay = lines.filter((l) => l.timing === 'IN_STEP');
  const later = lines.filter((l) => l.timing === 'LATER' && !satisfiedOf(l));
  // Ready is shown once per item: "Lobster ×40", not twice as 20 each: for this step and for the next.
  const have: PrepLine[] = [];
  for (const l of lines.filter((x) => satisfiedOf(x) && x.timing !== 'IN_STEP')) {
    const same = have.find((h) => h.name === l.name);
    if (same) { same.count += l.count; same.usedIn = [...same.usedIn, ...l.usedIn]; } else have.push({ ...l, usedIn: [...l.usedIn] });
  }

  // How many slots what must be taken now and along the way will occupy: "≈", because we know an item's packing only by its name.
  let adding = 0;
  for (const l of [...now, ...soon]) {
    if (l.where === 'UNKNOWN') continue;
    const n = Math.max(0, l.count - ((l.have.bag ?? 0) + l.have.noted));
    adding += stacks(l.name) ? (n > 0 ? 1 : 0) : n;
  }
  const used = state.bagSlots.known ? state.bagSlots.value : null;
  const slots: PrepSlots = { used, adding, over: used === null ? 0 : Math.max(0, used + adding - BAG_SLOTS) };

  // Readiness: the window's items, coins and what items cannot fix. The unknown does not count.
  const counted = lines.filter((l) => (l.timing === 'NOW' || l.timing === 'SOON') && l.where !== 'UNKNOWN');
  const coinsKnown = coins.have !== null && coins.need > 0;
  let ready = counted.filter(satisfiedOf).length;
  let total = counted.length;
  if (coinsKnown) { total += 1; if ((coins.missing ?? 0) === 0) ready += 1; }
  total += blockers.length;
  const unknown = lines.filter((l) => (l.timing === 'NOW' || l.timing === 'SOON') && l.where === 'UNKNOWN').length
    + (coins.need > 0 && coins.have === null ? 1 : 0);
  const critical = counted.filter((l) => !satisfiedOf(l) && l.priority === 'CRITICAL').length
    + blockers.length + (coinsKnown && (coins.missing ?? 0) > 0 ? 1 : 0);
  const important = counted.filter((l) => !satisfiedOf(l) && l.priority === 'IMPORTANT').length;
  const verdict: PrepScore['verdict'] = critical > 0 ? 'NOT_READY' : unknown > 0 ? 'UNKNOWN' : 'READY';
  const score: PrepScore = {
    percent: total === 0 ? (verdict === 'READY' ? 100 : null) : Math.round((ready / total) * 100),
    ready, total, critical, important, optimizations: optimizations.length, unknown, verdict,
  };

  // Weight: on a non-combat step heavy gear and extras in the bag hinder running. What the preparation window needs is left alone.
  const needed = new Set<string>();
  for (const l of lines) needed.add(l.name);
  for (const w of window) for (const it of [...(w.itemsRequired ?? []), ...(w.itemsRecommended ?? [])]) needed.add(it.nameEn);
  const advice = weightAdvice(step, state, needed);
  const bank = nearestBank(step);
  const weight: PrepPlan['weight'] = {
    ...advice,
    ...(advice.items.length && bank ? { action: { kind: 'TAKE' as const, label: `Deposit in the bank: ${bank.label}`, nav: { label: `${bank.label}: deposit the extra`, x: bank.x, y: bank.y, plane: bank.plane, stepId: step.id } } } : {}),
  };
  if (advice.level === 'HEAVY') { score.important += 1; score.total += 1; score.percent = Math.round((score.ready / score.total) * 100); }
  if (advice.level === 'LIGHT') score.optimizations += 1;

  const missing = now.length + soon.length;
  const recovery: PrepPlan['recovery'] = i.recovery ? { recovery: i.recovery, steps: recoverySteps(i.recovery, missing, step.id), missing } : null;

  return { stepId: step.id, stepIds: ids, lines, now, soon, byTheWay, have, later, optimizations, blockers, recovery, weight, coins, slots, score };
}
