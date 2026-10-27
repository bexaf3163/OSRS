// The Grand Exchange bulk list: one purchase for several steps ahead instead of trips to the exchange before each.
// The items are collected from the itemsRequired of the selected steps, identical ones are summed by ID (without an ID, by name).

import type { Step, StepItemRequirement } from '../types';
import { nameKey, parseAmount, type OwnedState } from './checklist';
import { toolFamilyOf } from './toolTiers';
import { doseKind, heldUnits } from './doses';
import gearJson from '../data/gear.json';
import { heldFood, type FoodHolding } from './foodAdvice';

/**
 * Tools and gear: they are not used up, so one is enough for all the steps: the largest
 * quantity per step is taken, not the sum. Everything else (ore, food, quest items) is summed.
 */
export const REUSABLE = new Set([
  'bronze axe', 'bronze pickaxe', 'mithril axe', 'small fishing net', 'fly fishing rod', 'harpoon', 'lobster pot',
  'tinderbox', 'spade', 'hammer', 'knife', 'shears', 'chisel', 'secateurs', 'ghostspeak amulet', 'dramen staff',
  'anti-dragon shield', 'rune sword', 'rune scimitar', 'adamant scimitar', 'holy symbol',
]);

/** Anything worn (weapons, armour, amulets) is not used up either: the gear data knows every one of them. */
const WORN = new Set((gearJson as { items: { name: string; slot?: string }[] }).items.filter((p) => p.slot).map((p) => nameKey(p.name)));

/** One is enough for every step: a tool of any tier, or something worn. */
export function isReusable(nameEn: string): boolean {
  const k = nameKey(nameEn);
  return REUSABLE.has(k) || WORN.has(k) || toolFamilyOf(nameEn) !== null;
}

const COINS_ID = 995;
/** "From step S2-01", "From S4-05: ...", "The ones saved from S1-04!", "The spare one from step S1-03". */
const CARRY_OVER = /(?:^|[\s(])from\s+(?:step\s+)?(S\d-\d{2})/i;

export function carryOverFrom(item: StepItemRequirement): string | null {
  return item.howToGet.match(CARRY_OVER)?.[1] ?? null;
}

export interface ShoppingSource {
  stepId: string;
  amount: string | number;
  /** The same item as bought/obtained in an earlier selected step: not counted a second time. */
  carryOver: boolean;
  /** The loadout of the step this item is taken for (Step.loadouts); absent means the opening one. */
  phase?: string;
  /** A potion: the doses in one of the step's potions ("Strength potion(4)" is 4); amount × per is what the step needs. */
  per?: number;
}

export interface ShoppingLine {
  equip?: boolean;
  key: string;
  nameEn: string;
  id?: number;
  iconUrl?: string;
  count: number;
  /** false means in at least one step the quantity is not a number ("as many as you have"): count is a lower estimate. */
  exact: boolean;
  reusable: boolean;
  /** In every step it is obtained during the step itself (not by a purchase): buying is not mandatory. */
  inStepOnly: boolean;
  sources: ShoppingSource[];
  /** Where to get it: from the first step where the item is needed. */
  howToGet: string;
  /** Items that do the same job (any of them counts): food of another kind, another tier of a tool. */
  anyOf?: string[];
  /** For food: the health one piece restores; alternatives are counted by healing. */
  heals?: number;
  /**
   * A potion: `count` is in doses and every size counts ("Strength potion(4)" ×4 is 16 doses; a (3) and a (1) are 4 of them). One line per potion
   * whatever sizes the steps name; nameEn is the size the first step names.
   */
  dose?: { base: string; per: number };
}

export interface ShoppingList {
  required: ShoppingLine[];
  recommended: ShoppingLine[];
  /** How many coins the steps themselves need (fare, an NPC's fee). */
  coins: number;
  /** The same coins by step, with what they pay for ("For buying the ship Lady Lumbridge."): kept apart from purchases in the budget. */
  coinLines?: { stepId: string; amount: number; why: string }[];
}

interface Acc {
  line: ShoppingLine;
  perStep: Map<string, number>;
  allInStep: boolean;
}

/** The item as the exchange list buys it: food with a personal plan for the whole goal. */
function wholeGoal(i: StepItemRequirement): StepItemRequirement {
  return i.totalAmount === undefined ? i : { ...i, amount: i.totalAmount };
}

function collect(
  steps: Step[], pick: (s: Step) => StepItemRequirement[] | undefined, selected: Set<string>,
  coinsOut?: { n: number; lines: { stepId: string; amount: number; why: string }[] },
): ShoppingLine[] {
  const byId = new Map<number, Acc>();
  const byName = new Map<string, Acc>();
  const order: Acc[] = [];
  for (const step of steps) {
    for (const item of pick(step) ?? []) {
      const n = parseAmount(item.amount);
      if (item.wikiItemId === COINS_ID || nameKey(item.nameEn) === 'coins') {
        if (coinsOut && n) {
          coinsOut.n += n;
          coinsOut.lines.push({ stepId: step.id, amount: n, why: item.howToGet });
        }
        continue;
      }
      const from = carryOverFrom(item);
      const carryOver = from !== null && selected.has(from);
      // A potion is one line in doses whatever size a step names: a (4) of one step and a (3) of another are one need.
      const dose = doseKind(item.nameEn);
      const name = dose ? `dose:${nameKey(dose.base)}` : nameKey(item.nameEn);
      let acc = (!dose && item.wikiItemId !== undefined ? byId.get(item.wikiItemId) : undefined) ?? byName.get(name);
      if (!acc) {
        acc = {
          line: {
            key: dose ? name : item.wikiItemId !== undefined ? `id:${item.wikiItemId}` : `name:${name}`,
            nameEn: item.nameEn, id: item.wikiItemId, iconUrl: item.iconUrl,
            count: 0, exact: true, reusable: isReusable(item.nameEn), inStepOnly: true, sources: [], howToGet: item.howToGet,
            ...(dose ? { dose } : {}),
          },
          perStep: new Map(),
          allInStep: true,
        };
        order.push(acc);
      }
      if (item.wikiItemId !== undefined && !dose) {
        byId.set(item.wikiItemId, acc);
        acc.line.id ??= item.wikiItemId;
      }
      acc.line.iconUrl ??= item.iconUrl;
      if (item.equip) acc.line.equip = true;
      if (!carryOver) {
        const alternatives = [...new Map((item.anyOf ?? []).filter(n => nameKey(n) !== name).map(n => [nameKey(n), n])).values()];
        if (acc.perStep.size === 0) {
          acc.line.heals = item.heals;
          acc.line.anyOf = alternatives;
        } else {
          if (acc.line.heals !== item.heals) acc.line.heals = undefined;
          const accepted = new Set(alternatives.map(nameKey));
          acc.line.anyOf = (acc.line.anyOf ?? []).filter(n => accepted.has(nameKey(n)));
        }
      }
      byName.set(name, acc);
      acc.line.sources.push({ stepId: step.id, amount: item.amount, carryOver, ...(item.phase ? { phase: item.phase } : {}), ...(dose ? { per: dose.per } : {}) });
      if (carryOver) continue;
      if (n === null) acc.line.exact = false;
      // In a purchase step (gear) "during the step" means "buy at the exchange".
      if (!item.inStep || step.type === 'gear') acc.allInStep = false;
      // Two rows of one item in one step are different needs (a trap for fish and for the Oracle): they are summed.
      acc.perStep.set(step.id, (acc.perStep.get(step.id) ?? 0) + (n ?? 1) * (dose?.per ?? 1));
    }
  }
  return order
    .filter((a) => a.perStep.size > 0)
    .map((a) => {
      const counts = [...a.perStep.values()];
      const count = a.line.reusable ? Math.max(...counts) : counts.reduce((x, y) => x + y, 0);
      return { ...a.line, count, inStepOnly: a.allInStep };
    });
}

/** The summary list for the selected steps (in route order). */
/**
 * wholeGoal — the Grand Exchange list: food with a personal plan counts for the whole remaining goal (`totalAmount`), so one trip to the exchange is
 * enough. Without it (what to carry now, the next steps' kit) the food is one trip, as readiness asks.
 */
export function aggregateShopping(steps: Step[], opts: { wholeGoal?: boolean } = {}): ShoppingList {
  const selected = new Set(steps.map((s) => s.id));
  const coins = { n: 0, lines: [] as { stepId: string; amount: number; why: string }[] };
  const required = collect(steps, (s) => (opts.wholeGoal ? (s.goalItemsRequired ?? s.itemsRequired)?.map(wholeGoal) : s.itemsRequired), selected, coins);
  const requiredKeys = new Set(required.flatMap((l) => [l.key, `name:${nameKey(l.nameEn)}`]));
  // A recommended item that is already in the required list (by ID or by name) is not shown a second time.
  const recommended = collect(steps, (s) => s.itemsRecommended, selected)
    .filter((l) => !requiredKeys.has(l.key) && !requiredKeys.has(`name:${nameKey(l.nameEn)}`));
  return { required, recommended, coins: coins.n, coinLines: coins.lines };
}

/** English plural: plural(21, 'item', 'items') gives "items"; plural(1, ...) gives "item". */
export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

export function formatGp(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export interface CopyLine {
  nameEn: string;
  /** How much to buy. */
  buy: number;
  exact: boolean;
  /** Ownership was not observed: the quantity is an upper estimate, not a confirmed shortage. */
  unverified?: boolean;
}

/** Text for the clipboard: English names, as they are searched at the exchange. */
export function shoppingText(title: string, lines: CopyLine[], coins: number): string {
  const text = (l: CopyLine) => `${l.nameEn} x${l.buy}${l.exact ? '' : '+'}`;
  const open = lines.filter((l) => l.buy > 0);
  const out = [title, ...open.filter((l) => !l.unverified).map(text)];
  // Items the app could not check stay in the text, but apart: the player may already own them.
  const unverified = open.filter((l) => l.unverified);
  if (unverified.length > 0) out.push('Unverified (check your bank first):', ...unverified.map(text));
  if (coins > 0) out.push(`Coins ~${formatGp(coins)} gp (for the steps themselves)`);
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// "I already have it": how much of an item there already is and how much is left to buy.
//
// Sources by seniority: the game's data if it is complete (the bank was opened in this RuneLite session), then
// the player's mark "I have N", then unknown. "Unknown" is not zero: without the bank the bag speaks only of the
// bag, and the app does not conclude that there is no more.

/** MISSING means none at all, PARTIAL part, SUFFICIENT enough, UNKNOWN unknown, UNAVAILABLE not sold at the exchange. */
export type ShoppingItemStatus = 'MISSING' | 'PARTIAL' | 'SUFFICIENT' | 'UNKNOWN' | 'UNAVAILABLE';

export interface Holding {
  required: number;
  /** How much there is, by the best source; null means unknown. */
  owned: number | null;
  /** How much to buy. With the unknown: everything not confirmed (an upper estimate). */
  buy: number;
  status: ShoppingItemStatus;
  source: 'live' | 'manual' | 'bag' | 'none';
  /** From the game: in the bag (with banknotes) and in the bank; bank null means the bank was not opened in this session. */
  carried?: number;
  bank?: number | null;
  /** The player's mark, if there is one. */
  manual?: number;
  /** The player marked more than the game confirms with an open bank: the mark is out of date. */
  stale?: boolean;
}

export function holdingFor(
  line: Pick<ShoppingLine, 'nameEn' | 'count' | 'exact'> & Partial<Pick<ShoppingLine, 'heals' | 'anyOf'>>,
  owned: { bankSeen: boolean; items: Map<string, { carried: number; noted: number; bank?: number }> } | null,
  manual?: number,
  onGe = true,
  hitpoints?: number,
  allocatedFood?: FoodHolding,
): Holding {
  const required = line.count;
  // The same "how much there is" calculation as readiness and the single requirements (playerState.heldOf; a potion in doses, doses.ts).
  const state = { owned: owned as OwnedState | null, equipment: {}, manual: (manual !== undefined ? { m: manual } : {}) as Record<string, number>, bankSeen: owned?.bankSeen === true };
  const h = line.heals ? allocatedFood ?? heldFood(state, { ...line, heals: line.heals }, manual !== undefined ? 'm' : undefined, hitpoints)
    : heldUnits(state, line.nameEn, manual !== undefined ? 'm' : undefined);
  const inGame = h.bag !== null;
  const carried = inGame ? (h.bag ?? 0) + h.noted : undefined;
  const bank = inGame ? h.bank : undefined;
  const base = {
    required,
    ...(carried !== undefined ? { carried, bank } : {}),
    ...(manual !== undefined ? { manual } : {}),
  };
  const status = (have: number | null): ShoppingItemStatus => {
    if (!onGe) return 'UNAVAILABLE';
    if (have === null) return 'UNKNOWN';
    if (have >= required) return 'SUFFICIENT';
    return have > 0 ? 'PARTIAL' : 'MISSING';
  };
  // The game knows everything: both the bag and the bank.
  if (h.source === 'game' && h.bank !== null) {
    const total = h.total ?? 0;
    return {
      ...base, owned: total, buy: Math.max(0, required - total), status: status(total), source: 'live',
      ...(manual !== undefined && manual > total ? { stale: true } : {}),
    };
  }
  // The player's mark: the bag from the game does not refute it (the rest may be in the bank).
  if (h.source === 'manual') {
    const have = h.total ?? 0;
    return { ...base, owned: have, buy: Math.max(0, required - have), status: status(have), source: 'manual' };
  }
  // A confirmed lower bound can prove sufficiency even if another accepted food is still unread.
  if (h.source === 'game' && h.total !== null && h.total >= required) {
    return { ...base, owned: h.total, buy: 0, status: status(h.total), source: 'live' };
  }
  // The bank is unknown: what is in the bag suffices, it is known; what is lacking is unknown, not "none".
  if (carried !== undefined) {
    if (carried >= required) return { ...base, owned: carried, buy: 0, status: status(carried), source: 'bag' };
    return { ...base, owned: null, buy: required - carried, status: status(null), source: 'bag' };
  }
  return { ...base, owned: null, buy: required, status: status(null), source: 'none' };
}

/** Counts and budgets of a list: what is confirmed to be missing, what is only unverified, kept apart. */
export interface ShoppingSummary {
  /** Items with a confirmed shortage (nothing or part of the quantity is owned). */
  confirmed: number;
  /** Items whose ownership was not observed. */
  unverified: number;
  owned: number;
  partial: number;
  missing: number;
  /** Price of the confirmed shortages, for the items that have a price. */
  confirmedGp: number;
  /** The most the unverified items could still cost if none of them were owned. */
  unverifiedGp: number;
  /** Confirmed or unverified items without a price. */
  unpriced: number;
}

export function summarizeShopping(rows: { h: Pick<Holding, 'status' | 'buy'>; unitPrice: number | null }[]): ShoppingSummary {
  const out: ShoppingSummary = { confirmed: 0, unverified: 0, owned: 0, partial: 0, missing: 0, confirmedGp: 0, unverifiedGp: 0, unpriced: 0 };
  for (const { h, unitPrice } of rows) {
    if (h.status === 'SUFFICIENT') { out.owned++; continue; }
    if (h.status === 'UNAVAILABLE' || h.buy <= 0) continue;
    const cost = unitPrice === null ? 0 : unitPrice * h.buy;
    if (unitPrice === null) out.unpriced++;
    if (h.status === 'UNKNOWN') {
      out.unverified++;
      out.unverifiedGp += cost;
    } else {
      out.confirmed++;
      out.confirmedGp += cost;
      if (h.status === 'PARTIAL') out.partial++; else out.missing++;
    }
  }
  return out;
}

/**
 * How much to ask the plugin for a hint at the exchange. The plugin itself subtracts what it sees in the game; the manual mark
 * is unknown to it: we subtract it here, not counting twice what it already sees in the bag.
 */
export function pluginCount(h: Holding): number {
  if (h.source !== 'manual') return h.required;
  return h.buy + (h.carried ?? 0);
}
