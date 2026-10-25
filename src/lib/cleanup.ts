// Inventory cleanup: what in the bag can be sold, dropped or destroyed because nothing ahead asks for it. Advice only: the app never touches the bag.
//
// The rule that shapes everything: "nothing in the route asks for it" is not "useless". So the verdicts are asymmetric:
//   keep    — the route asks for it (a count, from the open steps), the player said so, or it is a kind of thing that is always carried;
//   sell    — tradeable, nothing ahead asks for the surplus, and selling is open to this account (the surplus only: "keep 3, sell 20");
//   drop    — only an item on the small verified table (OBSOLETE), never a guess;
//   review  — anything uncertain: charged or transformed things, gear, untradeables, a restricted or Ironman account, an unknown state.
// The words never say "safe to discard": at most "no future use identified in the selected route".

import type { Step } from '../types';
import { nameKey } from './checklist';
import { FOODS } from './foodAdvice';
import { questUsing } from './questItems';
import { questStepOf } from './questSteps';
import { allSteps } from '../data';
import { aggregateShopping, REUSABLE, type ShoppingLine } from './shopping';
import { isRestrictedItem } from './tradeRestriction';

export type CleanupAction = 'keep' | 'sell' | 'drop' | 'review';
export type AccountKind = 'normal' | 'ironman';

export interface BagStack {
  id?: number;
  name: string;
  count: number;
  /** A banknote: the same item name, but a different thing in the bag (it sells without a trip, and a step that needs the item itself is not met by it). */
  noted?: boolean;
}

export interface CleanupPrefs {
  /** nameKey of items the player marked "Always keep". */
  keep: string[];
  /** "nameKey|action" of suggestions the player dismissed: a different suggestion for the same item shows again. */
  dismissed: string[];
  /** The player's word about the account when the game did not say. */
  account?: AccountKind;
}

export const emptyCleanupPrefs = (): CleanupPrefs => ({ keep: [], dismissed: [] });

export interface CleanupInput {
  /** null — the bag has not arrived from the game: there is no advice (unknown is not "empty"). */
  bag: BagStack[] | null;
  /** The names of worn items. Worn things are never advice; a spare in the bag is only a "review". */
  worn?: string[];
  /** The steps that are still open, in route order. Partly done quests are open steps: all of their remaining needs count. */
  openSteps: Step[];
  /** Shared allocated stock protection from the selected plans. This is an additional floor, never a permission to discard. */
  reserves?: ReadonlyMap<string, { qty: number; why: string }>;
  /** The bank was opened in this session. Only changes how sure the words are. */
  bankSeen: boolean;
  /** From the game when the plugin sent it, else the player's word, else null. */
  account: AccountKind | null;
  /** The new-account Grand Exchange restriction: lifted, restricted or unknown. */
  restriction: 'LIFTED' | 'RESTRICTED' | 'UNKNOWN';
  /** Exchange price of the item by name, or null. */
  price: (name: string) => number | null;
  priceLabel?: (name: string) => string;
  /** Whether the item can be traded at all: null while the item list has not loaded. */
  tradeable: (name: string) => boolean | null;
  prefs: CleanupPrefs;
  /** Steps proven completed (live quest facts, or an explicit done fallback); skips cannot authorize disposal. */
  closedSteps?: ReadonlySet<string>;
}

export interface CleanupRec {
  key: string;
  name: string;
  id?: number;
  noted: boolean;
  /** How many the advice is about (the surplus for a sell; the whole stack for keep and review). */
  qty: number;
  /** How many of this item are in the bag. */
  have: number;
  /** The count the open steps need (0 when none). */
  keepQty: number;
  action: CleanupAction;
  reason: string;
  /** A few words for the in-game card ("no use ahead", "its quest is done"); empty on keep lines. */
  short: string;
  /** What the sale gives, before the exchange tax. An estimate; null — no price. */
  proceeds: number | null;
  priceLabel?: string;
  /** The recovery note for drop/destroy: where to get it again. */
  recovery?: string;
}

export interface CleanupResult {
  /** Anything to act on or look at, most useful first: sell, drop, review. */
  recs: CleanupRec[];
  /** What stays and why (the route needs it, always kept, tools): shown collapsed. */
  keeps: CleanupRec[];
  /** The advice cannot be trusted completely, in words. */
  notes: string[];
  /** Sum of the proceeds of the sell lines (estimate). */
  proceeds: number;
}

/** Things that are carried on the way though no step names them. */
const SUPPLY = /(^coins$|\brunes?$|\brunes? pack\b|\barrows?\b|\bbolts?\b|\bpotion\b|\(\d\)$|\bteleport\b|\bpouch\b|^chronicle$|^spade$)/i;
const JEWELLERY = /\b(ring|amulet|necklace|bracelet|cape)\b/i;
/** Gear: an older piece can be a deliberate backup, so it is looked at by the player, not sold by a rule. */
const GEAR = /\b(sword|scimitar|longsword|dagger|axe|mace|warhammer|battleaxe|halberd|spear|helm|helmet|platebody|platelegs|plateskirt|chainbody|kiteshield|shield|boots|gloves|bow|crossbow|staff|coif|vambraces|chaps|body|hat|robe|top|bottom)\b/i;
/** Charged, uncharged, stored contents, or a transformed form: it is not the plain item and its worth is not the plain item's. */
const VARIANT = /(\(\d+ ?charges?\)|\(uncharged\)|\(charged\)|\(empty\)|\(full\)|\(i\)|\(\d+\)$|\bcharged\b|\buncharged\b|\(unstrung\)|\(broken\))/i;
/** General tools that serve many quests; cheap to carry, annoying to buy back. */
const UTILITY = new Set(['bucket', 'pot', 'jug', 'bowl', 'tinderbox', 'knife', 'hammer', 'chisel', 'saw', 'needle', 'thread', 'shears', 'rope', 'spade', 'axe', 'pickaxe']);

const FOOD_KEYS = new Set(FOODS.map((f) => nameKey(f.name)));

/**
 * The few items whose disposal has been checked: nothing else is ever advised to drop. Empty entries are not guesses to be filled in later;
 * an item is added here only with the wiki's own words (and a test).
 */
export interface Obsolete {
  action: 'drop' | 'destroy';
  why: string;
  recovery: string;
  /** The quests that must be done first, by the game's name (lib/questSteps.ts finds their route steps): before them the item may still be needed. */
  afterQuests: string[];
  /** Where it was checked. */
  source: string;
}
export const OBSOLETE: Readonly<Record<string, Obsolete>> = {
  // OSRS Wiki, "Research package": untradeable, "Destroy" option, only used to be delivered to Aubury in Rune Mysteries.
  'research package': {
    action: 'destroy', afterQuests: ['Rune Mysteries'], source: 'OSRS Wiki: Research package',
    why: 'Only used in Rune Mysteries, which is done; it cannot be traded or sold.',
    recovery: "Archmage Sedridor at the Wizards' Tower gives another.",
  },
  // OSRS Wiki, "Ghost's skull": untradeable, "used only in The Restless Ghost"; dropping it destroys it.
  "ghost's skull": {
    action: 'drop', afterQuests: ['The Restless Ghost'], source: "OSRS Wiki: Ghost's skull",
    why: 'Only used in The Restless Ghost, which is done; it cannot be traded or sold. Dropping it destroys it.',
    recovery: 'It cannot be picked up again after the quest, and nothing else uses it.',
  },
};

/** Known uses beyond what the route lists: a short table checked by hand, so the advice does not call a still-useful item surplus. */
export interface OtherUse { why: string }
export const OTHER_USES: Readonly<Record<string, OtherUse>> = {
  'dramen staff': { why: 'opens the fairy rings and the Lunar Isle route' },
  'ghostspeak amulet': { why: 'lets you talk to ghosts (more than one quest)' },
  'anti-dragon shield': { why: 'protects from dragonfire (many dragons, not only the quest)' },
  'holy symbol': { why: 'needed again for later vampyre quests' },
  'lobster pot': { why: 'a fishing tool, reused by every lobster trip' },
};

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function fmtGp(n: number): string {
  return `${Math.round(n).toLocaleString('en-US')} gp`;
}

/** A readable list: "Prince Ali Rescue", "Prince Ali Rescue and 2 more steps". */
function stepsPhrase(titles: string[]): string {
  const uniq = [...new Set(titles)];
  if (uniq.length <= 1) return uniq[0] ?? 'a later step';
  return `${uniq[0]} and ${uniq.length - 1} more ${plural(uniq.length - 1, 'step', 'steps')}`;
}

interface Need {
  count: number;
  /** false — a source says "as many as you have": the count is a lower bound and the surplus is not sure. */
  exact: boolean;
  titles: string[];
  recommended: boolean;
}

function needsOf(steps: Step[]): Map<string, Need> {
  const byStep = new Map(steps.map((s) => [s.id, s.title]));
  const out = new Map<string, Need>();
  const add = (l: ShoppingLine, recommended: boolean) => {
    const key = nameKey(l.nameEn);
    const titles = l.sources.map((s) => byStep.get(s.stepId)).filter((t): t is string => !!t);
    const prev = out.get(key);
    if (prev) {
      // Required wins over recommended; counts of the same item from two lists add up.
      prev.count += l.count;
      prev.exact = prev.exact && l.exact;
      prev.titles.push(...titles);
      prev.recommended = prev.recommended && recommended;
    } else {
      out.set(key, { count: l.count, exact: l.exact, titles, recommended });
    }
  };
  const list = aggregateShopping(steps, { wholeGoal: true });
  for (const l of list.required) add(l, false);
  for (const l of list.recommended) add(l, true);
  return out;
}

/**
 * The advice for the bag. Pure: the same inputs give the same lines.
 */
export function cleanupAdvice(i: CleanupInput): CleanupResult {
  const empty: CleanupResult = { recs: [], keeps: [], notes: [], proceeds: 0 };
  if (!i.bag) return empty;
  const notes: string[] = [];
  if (!i.bankSeen) notes.push('The bank has not been opened in this session: what is in it is unknown, so only what is in the bag is judged.');
  const worn = new Set((i.worn ?? []).map(nameKey));
  const needs = needsOf(i.openSteps);
  const alwaysKeep = new Set(i.prefs.keep);
  const dismissed = new Set(i.prefs.dismissed);
  const sellOpen = i.account === 'normal';

  // The same item can be in the bag twice: plain and as banknotes. Together they cover a need; the surplus is sold from the notes first.
  const groups = new Map<string, BagStack[]>();
  for (const s of i.bag) {
    if (s.count <= 0) continue;
    const k = nameKey(s.name);
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }

  const recs: CleanupRec[] = [];
  const keeps: CleanupRec[] = [];
  let proceeds = 0;

  for (const [key, stacks] of groups) {
    const have = stacks.reduce((n, s) => n + s.count, 0);
    const name = stacks[0].name;
    const baseNeed = needs.get(key);
    const reserved = i.reserves?.get(key);
    const need = reserved && reserved.qty > 0 ? {
      count: Math.max(baseNeed?.count ?? 0, reserved.qty),
      exact: Number.isFinite(reserved.qty) && (baseNeed?.exact ?? true),
      titles: baseNeed?.titles ?? ['the selected route'], recommended: false,
    } : baseNeed;
    const make = (stack: BagStack, p: Partial<CleanupRec> & Pick<CleanupRec, 'action' | 'reason'>): CleanupRec => ({
      key, name, ...(stack.id !== undefined ? { id: stack.id } : {}), noted: !!stack.noted, qty: stack.count, have, keepQty: need?.count ?? 0, proceeds: null, short: '', ...p,
    });
    const keepAll = (reason: string) => stacks.forEach((s) => keeps.push(make(s, { action: 'keep', reason })));

    if (alwaysKeep.has(key)) { keepAll('You marked it "Always keep".'); continue; }
    if (worn.has(key) && !stacks.some((s) => !s.noted)) { keepAll('Worn.'); continue; }
    if (key === 'coins') { keepAll('Money.'); continue; }
    if (FOOD_KEYS.has(key)) { keepAll('Food is always carried.'); continue; }
    if (SUPPLY.test(name) || JEWELLERY.test(name)) { keepAll('Supplies and jewellery are kept: they are needed on the way even when no step names them.'); continue; }
    const use = OTHER_USES[key];
    if (use) { keepAll(`Kept: ${use.why}.`); continue; }
    if (REUSABLE.has(key) || UTILITY.has(key)) { keepAll('A general tool: it serves many quests and costs a trip to replace.'); continue; }

    if (need && need.count > 0) {
      if (have <= need.count) {
        keepAll(need.recommended
          ? `Recommended for ${stepsPhrase(need.titles)}.`
          : `Needed for ${stepsPhrase(need.titles)}${need.count > 1 ? ` (${need.count})` : ''}.`);
        continue;
      }
      if (!need.exact) { keepAll(`Needed for ${stepsPhrase(need.titles)}: the amount depends on you, so nothing is called surplus.`); continue; }
    }

    // An item the open quest's own steps check for (the relic it hands over, a key): kept while that quest is open, though no list names it.
    if (!need || need.count <= 0) {
      const quest = questUsing(i.openSteps, { id: stacks.find((s) => s.id !== undefined)?.id, name });
      if (quest) { keepAll(`A quest item: ${quest.title} checks for it, and that quest is still open.`); continue; }
    }

    // Beyond this point something may be surplus: all of it, or what the route does not ask for.
    const keepQty = need && need.exact ? need.count : 0;
    const keepPhrase = keepQty > 0 ? `Keep ${keepQty} for ${stepsPhrase(need!.titles)}` : '';
    const noUse = keepQty > 0 ? 'The rest has no future use identified in the selected route.' : 'No future use identified in the selected route.';
    // The plain stack covers the route's need first (a step wants the item itself, not a banknote); what is left over is the surplus.
    let toKeep = keepQty;
    const parts = [...stacks].sort((a, b) => Number(!!a.noted) - Number(!!b.noted)).map((s) => {
      const kept = Math.min(s.count, toKeep);
      toKeep -= kept;
      return { s, kept, extra: s.count - kept };
    });
    let said = false;
    // A sale continues the sentence ("Keep 3 for X; sell the remaining 2."); a review reason is a sentence of its own ("Keep 1 for X. The item list …").
    const lead = (join: '; ' | '. ') => {
      if (said || keepQty === 0) return '';
      said = true;
      return keepPhrase + join;
    };
    const keptLine = (st: BagStack, kept: number) => keeps.push(make(st, { action: 'keep', qty: kept, reason: `Needed for ${stepsPhrase(need!.titles)}.` }));
    const reviewAll = (reason: string, short: string) => {
      for (const { s: st, kept, extra } of parts) {
        if (kept > 0) keptLine(st, kept);
        if (extra > 0) recs.push(make(st, { action: 'review', qty: extra, reason: `${lead('. ')}${reason}`, short: keepQty > 0 ? `keep ${keepQty}; ${short}` : short }));
      }
    };

    if (VARIANT.test(name)) {
      reviewAll(`Charged or transformed item: charges or stored contents are lost when it is sold, and it is not the plain item. Check it yourself.`, 'charged or changed, check it');
      continue;
    }
    const gone = OBSOLETE[key];
    if (gone && keepQty === 0) {
      if (gone.afterQuests.every((q) => { const s = questStepOf(allSteps, q); return s !== undefined && i.closedSteps?.has(s.id) === true; })) {
        stacks.forEach((s) => recs.push(make(s, { action: 'drop', reason: `${gone.why}${gone.action === 'destroy' ? ' Use Destroy.' : ' Drop it.'}`, recovery: gone.recovery, short: 'its quest is done, no other use' })));
      } else {
        reviewAll('A quest item: its quest is not finished in your route, so it may still be needed.', 'its quest is not done yet');
      }
      continue;
    }
    if (GEAR.test(name)) {
      reviewAll(`Gear: an older piece can be a deliberate backup. Sell it only if you no longer want it.`, 'gear, maybe a backup');
      continue;
    }

    const trade = i.tradeable(name);
    if (trade === null) { reviewAll(`The item list has not loaded, so it is not known whether this can be sold.`, 'item list not loaded'); continue; }
    if (trade === false) {
      reviewAll(`Cannot be traded, so it cannot be sold. ${noUse} Destroy or drop it only if you are sure you will not need it.`, 'untradeable, no use ahead');
      continue;
    }
    if (i.account === 'ironman') {
      reviewAll(`Ironman accounts cannot trade on the Grand Exchange. ${noUse}`, 'no use ahead (Ironman)');
      continue;
    }
    if (!sellOpen) {
      reviewAll(`The account type is not known, and Ironman accounts cannot sell. ${noUse}`, 'no use ahead; account type unknown');
      continue;
    }
    if (i.restriction !== 'LIFTED' && isRestrictedItem(name)) {
      reviewAll(`${i.restriction === 'RESTRICTED' ? 'New-account restrictions still stop' : 'It is not known whether new-account restrictions still stop'} the sale of this item on the Grand Exchange.`, 'new-account trade limit');
      continue;
    }

    // Sell the surplus; notes first (no bank trip, one slot).
    const unit = i.price(name);
    for (const { s: st, kept, extra } of [...parts].sort((a, b) => Number(!!b.s.noted) - Number(!!a.s.noted))) {
      if (kept > 0) keptLine(st, kept);
      if (extra <= 0) continue;
      const estimate = unit !== null ? unit * extra : null;
      const p = estimate !== null && Number.isSafeInteger(estimate) && estimate >= 0 ? estimate : null;
      if (p !== null) proceeds += p;
      const lead0 = lead('; ');
      const what = lead0 ? `${lead0}sell the remaining ${extra}` : keepQty > 0 ? `Sell the remaining ${extra}` : noUse.slice(0, -1);
      recs.push(make(st, {
        action: 'sell', qty: extra, proceeds: p, short: keepQty > 0 ? `keep ${keepQty}, the rest has no use ahead` : 'no use ahead',
        ...(p !== null && i.priceLabel ? { priceLabel: i.priceLabel(name) } : {}),
        reason: `${what}${st.noted ? ' (banknotes)' : ''}.${p === null ? ' No exchange price available.' : ''}`,
      }));
    }
  }

  const rank: Record<CleanupAction, number> = { sell: 0, drop: 1, review: 2, keep: 3 };
  recs.sort((a, b) => rank[a.action] - rank[b.action] || (b.proceeds ?? -1) - (a.proceeds ?? -1) || a.name.localeCompare(b.name));
  keeps.sort((a, b) => a.name.localeCompare(b.name));
  const visible = recs.filter((r) => !dismissed.has(`${r.key}|${r.action}`));
  if (visible.length < recs.length) notes.push(`${recs.length - visible.length} dismissed ${plural(recs.length - visible.length, 'suggestion is', 'suggestions are')} hidden.`);
  return { recs: visible, keeps, notes, proceeds };
}

/** "Ball of wool ×23" for a line. */
export function recLabel(r: CleanupRec): string {
  return `${r.name}${r.qty > 1 ? ` ×${r.qty.toLocaleString('en-US')}` : ''}${r.noted ? ' (noted)' : ''}`;
}

/** What the action is called on the card. */
export const ACTION_LABEL: Record<CleanupAction, string> = { keep: 'Keep', sell: 'Sell', drop: 'Drop/Destroy', review: 'Review' };

export function proceedsText(r: CleanupRec): string | null {
  return r.proceeds === null ? null : `~${fmtGp(r.proceeds)} (${r.priceLabel ?? 'estimate'}, before exchange tax)`;
}
