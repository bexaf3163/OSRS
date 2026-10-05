// The Grand Exchange bulk list: one purchase for several steps ahead instead of trips to the exchange before each.
// The items are collected from the itemsRequired of the selected steps, identical ones are summed by ID (without an ID, by name).

import type { Step, StepItemRequirement } from '../types';
import { nameKey, parseAmount, type OwnedState } from './checklist';
import { heldOf } from './playerState';

/**
 * Tools and gear: they are not used up, so one is enough for all the steps: the largest
 * quantity per step is taken, not the sum. Everything else (ore, food, quest items) is summed.
 */
export const REUSABLE = new Set([
  'bronze axe', 'bronze pickaxe', 'mithril axe', 'small fishing net', 'fly fishing rod', 'harpoon', 'lobster pot',
  'tinderbox', 'spade', 'hammer', 'knife', 'shears', 'chisel', 'secateurs', 'ghostspeak amulet', 'dramen staff',
  'anti-dragon shield', 'rune sword', 'rune scimitar', 'adamant scimitar', 'holy symbol',
]);

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
}

export interface ShoppingLine {
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
}

export interface ShoppingList {
  required: ShoppingLine[];
  recommended: ShoppingLine[];
  /** How many coins the steps themselves need (fare, an NPC's fee). */
  coins: number;
}

interface Acc {
  line: ShoppingLine;
  perStep: Map<string, number>;
  allInStep: boolean;
}

function collect(steps: Step[], pick: (s: Step) => StepItemRequirement[] | undefined, selected: Set<string>, coinsOut?: { n: number }): ShoppingLine[] {
  const byId = new Map<number, Acc>();
  const byName = new Map<string, Acc>();
  const order: Acc[] = [];
  for (const step of steps) {
    for (const item of pick(step) ?? []) {
      const n = parseAmount(item.amount);
      if (item.wikiItemId === COINS_ID || nameKey(item.nameEn) === 'coins') {
        if (coinsOut && n) coinsOut.n += n;
        continue;
      }
      const from = carryOverFrom(item);
      const carryOver = from !== null && selected.has(from);
      const name = nameKey(item.nameEn);
      let acc = (item.wikiItemId !== undefined ? byId.get(item.wikiItemId) : undefined) ?? byName.get(name);
      if (!acc) {
        acc = {
          line: {
            key: item.wikiItemId !== undefined ? `id:${item.wikiItemId}` : `name:${name}`,
            nameEn: item.nameEn, id: item.wikiItemId, iconUrl: item.iconUrl,
            count: 0, exact: true, reusable: REUSABLE.has(name), inStepOnly: true, sources: [], howToGet: item.howToGet,
          },
          perStep: new Map(),
          allInStep: true,
        };
        order.push(acc);
      }
      if (item.wikiItemId !== undefined) {
        byId.set(item.wikiItemId, acc);
        acc.line.id ??= item.wikiItemId;
      }
      acc.line.iconUrl ??= item.iconUrl;
      byName.set(name, acc);
      acc.line.sources.push({ stepId: step.id, amount: item.amount, carryOver });
      if (carryOver) continue;
      if (n === null) acc.line.exact = false;
      // In a purchase step (gear) "during the step" means "buy at the exchange".
      if (!item.inStep || step.type === 'gear') acc.allInStep = false;
      // Two rows of one item in one step are different needs (a trap for fish and for the Oracle): they are summed.
      acc.perStep.set(step.id, (acc.perStep.get(step.id) ?? 0) + (n ?? 1));
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
export function aggregateShopping(steps: Step[]): ShoppingList {
  const selected = new Set(steps.map((s) => s.id));
  const coins = { n: 0 };
  const required = collect(steps, (s) => s.itemsRequired, selected, coins);
  const requiredKeys = new Set(required.flatMap((l) => [l.key, `name:${nameKey(l.nameEn)}`]));
  // A recommended item that is already in the required list (by ID or by name) is not shown a second time.
  const recommended = collect(steps, (s) => s.itemsRecommended, selected)
    .filter((l) => !requiredKeys.has(l.key) && !requiredKeys.has(`name:${nameKey(l.nameEn)}`));
  return { required, recommended, coins: coins.n };
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
}

/** Text for the clipboard: English names, as they are searched at the exchange. */
export function shoppingText(title: string, lines: CopyLine[], coins: number): string {
  const rows = lines.filter((l) => l.buy > 0).map((l) => `${l.nameEn} x${l.buy}${l.exact ? '' : '+'}`);
  const out = [title, ...rows];
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
  line: Pick<ShoppingLine, 'nameEn' | 'count' | 'exact'>,
  owned: { bankSeen: boolean; items: Map<string, { carried: number; noted: number; bank?: number }> } | null,
  manual?: number,
  onGe = true,
): Holding {
  const required = line.count;
  // The same "how much there is" calculation as readiness and the single requirements (playerState.heldOf).
  const h = heldOf({ owned: owned as OwnedState | null, equipment: {}, manual: manual !== undefined ? { m: manual } : {}, bankSeen: owned?.bankSeen === true }, line.nameEn, manual !== undefined ? 'm' : undefined);
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
  // The bank is unknown: what is in the bag suffices, it is known; what is lacking is unknown, not "none".
  if (carried !== undefined) {
    if (carried >= required) return { ...base, owned: carried, buy: 0, status: status(carried), source: 'bag' };
    return { ...base, owned: null, buy: required - carried, status: status(null), source: 'bag' };
  }
  return { ...base, owned: null, buy: required, status: status(null), source: 'none' };
}

/**
 * How much to ask the plugin for a hint at the exchange. The plugin itself subtracts what it sees in the game; the manual mark
 * is unknown to it: we subtract it here, not counting twice what it already sees in the bag.
 */
export function pluginCount(h: Holding): number {
  if (h.source !== 'manual') return h.required;
  return h.buy + (h.carried ?? 0);
}
