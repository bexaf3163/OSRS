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
import { carryOf, displayName, doseKind, heldUnits, shortText, takeFromBank } from './doses';
import { nearestBank, type StepReadiness } from './readiness';
import { planSources, type SourceOption } from './sourceRouter';
import { tripWindow, type OneTripPlan } from './oneTrip';
import { preflightItems } from './checklist';
import { weightAdvice, type WeightAdvice } from './weight';
import { carryoverOf } from './carryover';
import { questItemKeys } from './questItems';
import { recoverySteps, type Recovery, type RecoveryStep } from './recovery';
import { loadoutNeed, loadoutPhase } from './loadoutPhase';
import type { QuestInstruction } from '../services/runeliteBridge';
import type { PriceView } from './funding/quotes';
import { itemPrice, marketItemPrice, type ItemPrice } from './itemPrice';

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
  /** The item must be worn, not merely carried. */
  equip?: boolean;
  /** Market cost for physical items; doses are priced by their actual package in Shopping. */
  marketPrice?: ItemPrice;
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
  /** A potion: count, have and toGet are doses, every size counted (doses.ts). */
  unit?: 'dose';
  /** A potion in the bank: the exact potions to take for the doses, largest first (the game frames them in the open bank). */
  potions?: { name: string; count: number }[];
  /** Physical notes remain in have.noted; this many units must be unnoted at a bank before use. */
  unnote?: number;
  /** Additional usable units allocated to this deadline; the same bag stock cannot cover another deadline again. */
  bagShortfall?: number;
}

export const prepSatisfied = (l: { where: string; equip?: boolean }) => l.where === 'EQUIPPED' || (l.where === 'INVENTORY' && !l.equip);

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
  /** How many slots what has to be taken, and what a quest step hands over on the way, will occupy. Items in a stack (runes, arrows, coins) take one each. */
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
  prices?: PriceView | null;
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
  questInstruction?: QuestInstruction | null;
}

/** A line's amount after its name: "×16" for pieces, " (16 doses)" for a potion: every view of a preparation line says it the same way. */
export function lineAmount(l: Pick<PrepLine, 'count' | 'exact' | 'unit'>, n = l.count): string {
  if (l.unit === 'dose') return ` (${n} ${n === 1 ? 'dose' : 'doses'})`;
  return n > 1 ? ` ×${n}${l.exact ? '' : '+'}` : '';
}

/** A quantity inside a sentence: "8 doses" for a potion line, "8" otherwise. */
export function unitsOf(l: Pick<PrepLine, 'unit'>, n: number): string {
  return l.unit === 'dose' ? `${n} ${n === 1 ? 'dose' : 'doses'}` : `${n}`;
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

function bankAction(step: Step, name: string, n: number, doses = false, unnote = 0): PrepAction {
  const b = nearestBank(step);
  return {
    kind: 'TAKE',
    label: unnote > 0 ? `Unnote ${name}${unnote > 1 ? ` (${unnote}${doses ? ' doses' : ''})` : ''} at a bank${n > unnote ? '; withdraw the rest' : ''}`
      : doses ? `Take ${n} ${n === 1 ? 'dose' : 'doses'} from the bank` : `Take from the bank${n > 1 ? ` ×${n}` : ''}`,
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

/** An item the step must not start without: not a level or a quest, but a death or a lost trip when missing. */
interface SafetyRule { names: string[]; label: string; detail: string }
export const SAFETY: Record<string, SafetyRule[]> = {
  // Boarding the ship for Crandor: Elvarg's fire hits up to 70 without the shield.
  'S5-08': [{
    names: ['Anti-dragon shield', 'Dragonfire shield', 'Dragonfire ward', 'Ancient wyvern shield'],
    label: 'No Anti-dragon shield with you',
    detail: "Do not board the ship without it: Elvarg's fire hits up to 70. Duke Horacio in Lumbridge Castle gives it free.",
  }],
};

/**
 * The safety blockers of a step: a rule is broken only when the plan SAW the item missing or in the bank (not in the bag or worn). An item that was not
 * checked (no game connection, bank not opened) is unknown, never a block: the plan does not claim what it does not know.
 */
export function safetyBlockers(stepId: string, lines: readonly PrepLine[]): { label: string; detail?: string }[] {
  const out: { label: string; detail?: string }[] = [];
  for (const rule of SAFETY[stepId] ?? []) {
    const mine = lines.filter((l) => rule.names.includes(l.name));
    if (!mine.length || mine.some((l) => l.where === 'INVENTORY' || l.where === 'EQUIPPED' || l.where === 'UNKNOWN')) continue;
    out.push({ label: mine.some((l) => l.where === 'BANK') ? `${rule.names[0]} is in the bank, not with you` : rule.label, detail: rule.detail });
  }
  return out;
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
    const count = ing.count * Math.max(1, parent.count - ((parent.have.bag ?? 0) + parent.have.noted + (parent.have.bank ?? 0)));
    const usable = held.bag ?? 0;
    if (usable >= count) continue;
    const total = held.total ?? usable;
    const where: PrepWhere = total >= count ? 'BANK' : held.presence === 'UNKNOWN' || held.bank === null ? 'UNKNOWN' : 'MISSING';
    const unnote = Math.min(held.noted, Math.max(0, count - usable));
    const spot = ing.npc ? npcSpot(ing.npc, step.id) : undefined;
    out.push({
      key: `recipe:${parent.key}:${ing.nameEn}`, name: ing.nameEn, count, exact: true, where,
      have: { bag: held.bag, noted: held.noted, bank: held.bank, equipped: held.equipped },
      toGet: where === 'MISSING' ? Math.max(0, count - total) : where === 'BANK' ? count - usable : null, priority: 'IMPORTANT', timing: parent.timing,
      ...(unnote > 0 ? { unnote } : {}),
      action: where === 'BANK' ? bankAction(step, ing.nameEn, count - usable, false, unnote)
        : { kind: 'GATHER', label: ing.how, ...(spot ? { nav: { label: `${recipe.makeAt}: ${ing.nameEn}`, x: spot.x, y: spot.y, plane: spot.plane, itemName: ing.nameEn, stepId: step.id } } : {}) },
      why: `${parent.name} is made from ${recipe.from.map((f) => f.nameEn).join(' + ')} — or buy it`, usedIn: parent.usedIn,
    });
  }
  return out;
}

const ORDER: Record<PrepPriority, number> = { CRITICAL: 0, IMPORTANT: 1, OPTIMIZATION: 2, OPTIONAL: 3 };
const TIMING: Record<PrepTiming, number> = { NOW: 0, SOON: 1, IN_STEP: 2, LATER: 3 };

/** Every source of the line in this step belongs to a loadout other than the first one. */
export function buildPrepPlan(i: PrepPlanInput): PrepPlan {
  const { step, state, trip } = i;
  const detail = i.detail ?? ((id: number) => itemById.get(id));
  const ids = trip.stepIds;
  const heals = new Map(preflightItems(step).filter((p) => p.heals).map((p) => [p.nameEn.toLowerCase(), p.heals as number]));
  const coinsTotal = trip.coins.have;
  const danger = Boolean(step.foes?.length);
  const lines: PrepLine[] = [];
  const phase = loadoutPhase(step, i.questInstruction);

  for (const t of trip.lines) {
    const inStep = t.line.inStepOnly && !(phase?.confirmed && t.line.sources.some(s => s.stepId === step.id && s.phase === phase.id));
    const dose = Boolean(t.line.dose);
    const equipped = t.held.equipped;
    const allIds = t.allocation.filter((x) => x.need > 0).map((x) => x.stepId);
    // One item is divided by deadlines: how much this step needs, how much the nearest ones, how much later. What is in the bag is spent first,
    // then what is in the bank: so it is visible what to do with what, rather than "need 40, have 20".
    let bagPool = t.held.bag ?? 0;
    let notedPool = t.held.noted;
    const bankKnown = t.held.bank !== null || t.held.source === 'manual';
    let bankPool = t.held.bank ?? Math.max(0, (t.held.total ?? 0) - bagPool - notedPool);
    const known = t.held.presence !== 'UNKNOWN';
    const groups = new Map<PrepTiming, { need: number; ids: string[]; bag: number; bank: number; noted: number; missing: number; unknown: number }>();
    for (const a of t.allocation.filter((x) => x.need > 0)) {
      const idx = ids.indexOf(a.stepId);
      // An item of a later loadout of the same step is taken on the next visit to the bank, not before the first stretch (no runes into the tomb).
      const phaseNeed = idx <= 0 ? loadoutNeed(step, t.line.nameEn, t.line.sources.filter(s => s.stepId === a.stepId), phase) : 'NOW';
      if (idx <= 0 && phaseNeed === 'PAST') continue;
      const later = !inStep && idx <= 0 && phaseNeed === 'SOON';
      const timing: PrepTiming = inStep ? 'IN_STEP' : later ? 'LATER' : idx <= 0 ? 'NOW' : idx <= 2 ? 'SOON' : 'LATER';
      const g = groups.get(timing) ?? { need: 0, ids: [], bag: 0, bank: 0, noted: 0, missing: 0, unknown: 0 };
      const fromBag = Math.min(bagPool, a.need);
      bagPool -= fromBag;
      let rest = a.need - fromBag;
      const fromNotes = Math.min(notedPool, rest);
      notedPool -= fromNotes;
      rest -= fromNotes;
      let fromBank = 0;
      if (rest > 0 && known) {
        fromBank = Math.min(bankPool, rest);
        bankPool -= fromBank;
        rest -= fromBank;
        // Spend the confirmed lower bound even when other tiers/sources are unread.
        if (bankKnown) g.missing += rest;
        else g.unknown += rest;
      } else if (rest > 0) {
        g.unknown += rest;
      }
      g.need += a.need; g.bag += fromBag; g.bank += fromBank + fromNotes; g.noted += fromNotes;
      g.ids.push(a.stepId);
      groups.set(timing, g);
    }
    for (const [timing, g] of groups) {
      const where: PrepWhere = g.unknown > 0 ? 'UNKNOWN' : g.missing > 0 ? 'MISSING' : g.bank > 0 ? 'BANK' : equipped > 0 && equipped >= g.bag ? 'EQUIPPED' : 'INVENTORY';
      const satisfied = where === 'INVENTORY' || where === 'EQUIPPED';
      const priority: PrepPriority = inStep ? 'OPTIONAL' : timing === 'NOW' ? 'CRITICAL' : 'IMPORTANT';
      const toGet = where === 'UNKNOWN' ? null : where === 'MISSING' ? g.missing : where === 'BANK' ? g.bank : 0;
      let action: PrepAction | undefined;
      const acquired = phase?.confirmed ? step.itemsRequired?.find(item => item.inStep && item.phase === phase.id && item.nameEn === t.line.nameEn) : undefined;
      if (inStep && !satisfied) {
        action = { kind: 'GATHER', label: 'You get it during the step' };
      } else if (where === 'BANK') {
        action = bankAction(step, t.line.nameEn, g.bank, dose, g.noted);
      } else if (where === 'MISSING' && acquired) {
        const spot = acquired.from ? npcSpot(acquired.from, step.id) : undefined;
        action = { kind: 'GATHER', label: acquired.howToGet, ...(spot ? { nav: { label: `${acquired.from}: ${acquired.nameEn}`, x: spot.x, y: spot.y, plane: spot.plane, itemName: acquired.nameEn, stepId: step.id } } : {}) };
      } else if (where === 'MISSING' && dose) {
        // Doses, not potions: the shortfall and the sizes that cover it; Shopping prices every size and names the package.
        action = { kind: 'BUY', label: shortText(t.line.nameEn, g.missing), href: '#/shopping' };
      } else if (where === 'MISSING') {
        const plan = planSources({ name: t.line.nameEn, need: g.missing, detail: t.line.id !== undefined ? detail(t.line.id) : undefined, manualKey: t.line.key,
          ...(i.prices !== undefined ? { gePrice: itemPrice(i.prices, t.line.nameEn, t.line.id, g.missing).unit } : {}),
        }, state);
        // No source the player can surely use (only a guild shop behind an unconfirmed door, say): the route's own way to get it, the shop as an "or".
        const maybe = plan.alternatives.find((o) => o.kind === 'shop' && o.access !== 'open');
        action = !plan.primary && maybe && t.line.howToGet
          ? { kind: 'GATHER', label: `${t.line.howToGet.split(/(?<=[.!?])\s/)[0].replace(/\.$/, '')} · or ${maybe.label}` }
          : sourceAction(plan.primary, t.line.nameEn, g.missing, coinsTotal, step.id);
      } else if (where === 'UNKNOWN') {
        action = state.connected
          ? { kind: 'CONNECT', label: 'Open the bank in the game and I will check what you have' }
          : { kind: 'CONNECT', label: 'Connect RuneLite and I will check what you have', href: '#/settings' };
      }
      // A consumable is counted by what the nearest deadline needs: whether it is enough to go out with.
      const supply = timing === 'NOW' ? supplyOf(g.need, g.bag, t.line.reusable, danger) : undefined;
      // Doses in more potions than they need: pouring them together frees bag slots, and the line says how.
      const carry = dose && timing === 'NOW' && t.held.sizes ? carryOf(t.held.sizes, g.need, displayName(t.line.nameEn).toLowerCase()) : null;
      const kind = dose ? doseKind(t.line.nameEn) : null;
      const packages = kind && where === 'BANK' && t.held.sizes ? [
        ...takeFromBank(kind.base, t.held.sizes, g.bank - g.noted),
        ...takeFromBank(kind.base, t.held.sizes.map((x) => ({ ...x, bank: x.noted })), g.noted),
      ] : [];
      const potions = [...packages.reduce((m, p) => m.set(p.name, (m.get(p.name) ?? 0) + p.count), new Map<string, number>())].map(([name, count]) => ({ name, count }));
      const why = whyOf(t.line, g.ids, allIds, step.id, ids, heals.get(t.line.nameEn.toLowerCase()));
      lines.push({
        key: timing === 'NOW' || timing === 'IN_STEP' ? t.line.key : `${t.line.key}@${timing.toLowerCase()}`,
        name: t.line.nameEn, count: g.need, exact: t.line.exact, where,
        have: { bag: t.held.bag, noted: t.held.noted, bank: t.held.bank, equipped },
        toGet, priority, timing, ...(supply ? { supply } : {}), ...(action ? { action } : {}),
        why: carry?.combine ? [why, carry.combine].filter(Boolean).join(' · ') : why, usedIn: g.ids, ...(dose ? { unit: 'dose' as const } : {}),
        ...(potions.length ? { potions } : {}),
        ...(g.noted > 0 ? { unnote: g.noted } : {}),
        bagShortfall: g.need - g.bag,
      });
    }
  }

  for (const l of lines) {
    const required = step.itemsRequired?.find(r => r.equip && r.nameEn === l.name);
    if (!required || !l.usedIn.includes(step.id)) continue;
    l.equip = true;
    const accepted = new Set([required.nameEn, ...(required.anyOf ?? [])].map(n => n.toLowerCase()));
    const worn = state.connected && state.equipmentKnown && Object.values(state.equipment).some(n => accepted.has(n.toLowerCase()));
    if (worn) {
      l.where = 'EQUIPPED';
      l.have.equipped = 1;
      l.toGet = 0;
      l.bagShortfall = 0;
      delete l.action;
      delete l.unnote;
    } else if (l.where !== 'INVENTORY' && l.where !== 'EQUIPPED') {
      continue;
    } else if (!state.connected || !state.equipmentKnown) {
      l.where = 'UNKNOWN';
      l.action = { kind: 'CONNECT', label: 'Connect RuneLite so equipped armour can be checked', href: '#/settings' };
    } else {
      l.where = 'INVENTORY';
      l.action = { kind: 'UPGRADE', label: `Equip ${l.name}` };
    }
  }

  // Made items: if one is missing, its ingredients are planned too.
  for (const l of [...lines]) lines.push(...recipeLines(l, step, state));

  // Price physical quantities once for every consumer. Unknown/untradeable items get no fabricated GE value.
  if (i.prices !== undefined) for (const l of lines) {
    if (l.unit === 'dose' || l.name.toLowerCase() === 'coins') continue;
    const row = trip.lines.find(t => t.line.nameEn === l.name);
    const id = row?.line.id;
    const d = id !== undefined ? detail(id) : undefined;
    const price = marketItemPrice(i.prices, l.name, id, l.count, Boolean(d?.gePrice));
    if (price) l.marketPrice = price;
  }

  // Recommended: not needed for the step but it saves time; we do not force it: that is an "improvement".
  const window = tripWindow(i.steps, i.progress, step.id, Math.max(0, ids.length - 1));
  const recommended = aggregateShopping(window).recommended;
  const optimizations: PrepLine[] = [];
  for (const r of recommended.slice(0, 6)) {
    // A potion in doses, every size counted, as the required lines and Shopping count it.
    const held = heldUnits(state, r.nameEn, r.key);
    if (held.presence === 'PRESENT' && (held.bag ?? 0) >= r.count) continue;
    const inCurrent = r.sources.some((s) => s.stepId === step.id);
    const bank = (held.bank ?? 0) > 0 || held.noted > 0;
    const bagHas = held.bag ?? 0;
    const short = held.total !== null && held.bank !== null ? Math.max(0, r.count - held.total) : 0;
    const buy: PrepAction | null = r.dose && short > 0 ? { kind: 'BUY', label: shortText(r.nameEn, short), href: '#/shopping' } : null;
    optimizations.push({
      key: `rec:${r.key}`, name: r.nameEn, count: r.count, exact: r.exact,
      where: held.presence === 'UNKNOWN' ? 'UNKNOWN' : bank ? 'BANK' : 'MISSING',
      have: { bag: held.bag, noted: held.noted, bank: held.bank, equipped: held.equipped },
      toGet: null, priority: inCurrent ? 'OPTIMIZATION' : 'OPTIONAL', timing: inCurrent ? 'NOW' : 'SOON',
      ...(bank ? { action: bankAction(step, r.nameEn, Math.min((held.bank ?? 0) + held.noted, Math.max(0, r.count - bagHas)), Boolean(r.dose), Math.min(held.noted, Math.max(0, r.count - bagHas))) } : buy ? { action: buy } : {}),
      why: r.sources[0] ? `Recommended in ${r.sources[0].stepId}` : 'Recommended', usedIn: r.sources.map((s) => s.stepId),
      ...(r.dose ? { unit: 'dose' as const } : {}),
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

  // What items cannot fix: levels, quests, a closed step. Then the hard safety checks: an item without which the step ends in a death.
  const blockers = [
    ...i.readiness.problems
      .filter((p) => p.hard && (p.kind === 'skill' || p.kind === 'quest' || p.kind === 'step' || p.kind === 'qp' || p.kind === 'mode'))
      .map((p) => ({ label: p.label, ...(p.detail ? { detail: p.detail } : {}) })),
    ...safetyBlockers(step.id, lines),
  ];

  const stepOrder = (l: PrepLine) => (l.usedIn[0] ? ids.indexOf(l.usedIn[0]) : 99);
  lines.sort((a, b) => ORDER[a.priority] - ORDER[b.priority] || TIMING[a.timing] - TIMING[b.timing] || stepOrder(a) - stepOrder(b) || (a.key < b.key ? -1 : 1));
  const satisfiedOf = prepSatisfied;
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
  const doseNeeds = new Map<string, { name: string; need: number }>();
  for (const l of [...now, ...soon]) {
    if (l.where === 'UNKNOWN') continue;
    const n = l.bagShortfall ?? Math.max(0, l.count - (l.have.bag ?? 0));
    if (l.unit === 'dose') {
      const base = doseKind(l.name)!.base;
      const previous = doseNeeds.get(base);
      doseNeeds.set(base, { name: l.name, need: (previous?.need ?? 0) + n });
    } else {
      adding += stacks(l.name) ? (n > 0 && !(l.have.bag && l.have.bag > 0) ? 1 : 0) : n;
    }
  }
  for (const { name, need } of doseNeeds.values()) {
    const h = heldUnits(state, name);
    const kind = doseKind(name)!;
    // Each known (1)/(2)/(3)/(4) is a physical bottle, including notes that must first be unnoted.
    const pulls = takeFromBank(kind.base, (h.sizes ?? []).map((x) => ({ ...x, bank: (x.bank ?? 0) + x.noted })), need);
    const supplied = pulls.reduce((a, p) => a + doseKind(p.name)!.per * p.count, 0);
    adding += pulls.reduce((a, p) => a + p.count, 0) + Math.ceil(Math.max(0, need - supplied) / 4);
  }
  // A quest hands things over during the step (three goblin mails, map parts): they need room too, so the warning comes before the first one is picked up, not after.
  // Not for training steps: gathered ore and logs are dropped or banked as they come.
  if (step.type === 'quest') {
    for (const l of byTheWay) {
      const n = Math.max(0, l.count - ((l.have.bag ?? 0) + l.have.noted));
      adding += stacks(l.name) ? (n > 0 ? 1 : 0) : n;
    }
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
  // What a step keeps for a later one is not "extra" whatever the bag says, nor what the window's quests check for themselves.
  for (const w of window) for (const c of carryoverOf(w)) needed.add(c.item);
  for (const k of questItemKeys(window)) needed.add(k);
  const advice = weightAdvice(step, state, needed, window);
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
