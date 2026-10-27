// The one player snapshot the funding system reads. It is built from the shared PlayerState (levels, coins, bag, bank knowledge, quests, mode,
// position) and the facts around it (the trade restriction, what the route and the quests protect). Nothing is read from the bridge a second time.
//
// Every fact is known or it is not: an unknown level, quest or bank is carried as unknown and never as zero or "none". The snapshot belongs to one
// character; a plan saved for another character is not applied to it (see plan.ts).

import type { Step } from '../../types';
import { nameKey, parseAmount } from '../checklist';
import { carryoverOf } from '../carryover';
import { heldExact, heldOf, levelOf, questOf, type Held, type PlayerState, type QuestPresence, type WorldPoint } from '../playerState';
import { aggregateShopping } from '../shopping';
import { doseKind, doseNames } from '../doseKind';
import { effectiveHeal, FOODS } from '../foodAdvice';
import { toolFamilyOf, usableAt } from '../toolTiers';
import { questItemKeys } from '../questItems';
import { totalLevelOf, tradeRestriction, type SellOverride, type TradeRestriction } from '../tradeRestriction';

/** Coins that can be spent: the number and how much of it is certain. */
export interface Liquid {
  /** Known coins; null — the bag is not known either. */
  amount: number | null;
  /** The bank is known too, so `amount` is the whole of it. false — `amount` is only what is in the bag, a floor. */
  complete: boolean;
}

export interface Protection {
  name: string;
  /** How many must stay; Infinity — all of them (a quest item). */
  qty: number;
  why: string;
}

export interface FundingSnapshot {
  character: string | null;
  members: boolean;
  /** null — the account type is not known (no game connection). */
  ironman: boolean | null;
  connected: boolean;
  level(skill: string): number | undefined;
  quest(name: string): QuestPresence;
  questPoints: number | null;
  coins: { bag: number | null; bank: number | null };
  liquid: Liquid;
  bankSeen: boolean;
  /** When the bank was last read (ms); null — read this session or never. */
  bankSavedAt: number | null;
  held(name: string): Held;
  bag: { name: string; count: number }[] | null;
  position: WorldPoint | null;
  restriction: TradeRestriction;
  /** nameKey -> what stays. */
  protections: ReadonlyMap<string, Protection>;
}

export function liquidOf(s: Pick<PlayerState, 'coins'>): Liquid {
  const bag = s.coins.bag.known ? s.coins.bag.value : null;
  const bank = s.coins.bank.known ? s.coins.bank.value : null;
  if (bag === null) return { amount: bank, complete: false };
  if (bank === null) return { amount: bag, complete: false };
  return { amount: bag + bank, complete: true };
}

/**
 * What must not be sold, spent or counted as stock for the window of steps: the items the steps require (the food and the tools too), the items a step
 * is completed by (bank 50 Big bones), the carry-over a step keeps for a later one, and the quest items the quest machines check for.
 */
export function protectionsFor(window: readonly Step[], state?: PlayerState): Map<string, Protection> {
  const out = new Map<string, Protection>();
  const add = (name: string, qty: number, why: string) => {
    const k = nameKey(name);
    const have = out.get(k);
    if (!have || qty > have.qty) out.set(k, { name, qty, why });
  };
  // Use the same demand ledger as Shopping: independent consumables add, tools reuse,
  // and a carried stock from a selected producer is not bought again for its consumer.
  // The exchange list's quantities (food for the whole planned goal, not one trip): what Shopping has the player buy is never surplus to sell.
  const list = aggregateShopping(window.map(s => ({ ...s, itemsRequired: s.itemsRequired?.filter(i => !i.inStep), goalItemsRequired: s.goalItemsRequired?.filter(i => !i.inStep) })), { wholeGoal: true });
  const used = new Map<string, number>();
  const hp = state ? levelOf(state, 'hitpoints') : undefined;
  const heals = new Map(FOODS.map(f => [nameKey(f.name), effectiveHeal(f, hp)]));
  const stock = (name: string, key?: string) => state ? heldExact(state, name, key).total ?? 0 : 0;
  for (const line of list.required) {
    const foodHeal = line.heals ? effectiveHeal({ heals: line.heals }, hp) : heals.get(nameKey(line.nameEn));
    let remaining = line.count * (foodHeal ?? 1);
    const family = toolFamilyOf(line.nameEn);
    const sourceItems = window.flatMap(s => line.sources.some(src => src.stepId === s.id) ? (s.goalItemsRequired ?? s.itemsRequired ?? []).filter(i => !i.inStep && (nameKey(i.nameEn) === nameKey(line.nameEn) || (line.id !== undefined && i.wikiItemId === line.id))) : []);
    // A merged shopping row may have different alternatives on different steps. Only a common
    // alternative can cover the whole merged demand; keep the primary deficit otherwise.
    const common = (line.anyOf ?? []).filter(n => sourceItems.every(i => i.anyOf?.some(a => nameKey(a) === nameKey(n))));
    const names = [...new Map([line.nameEn, ...common, ...(family ?? []), ...doseNames(line.nameEn)].map(n => [nameKey(n), n])).values()];
    if (!line.exact) {
      for (const name of [...names, ...(line.anyOf ?? [])]) add(name, Infinity, `Quantity not confirmed for ${line.sources.map(s => s.stepId).join(', ')}`);
      continue;
    }
    // A row with heterogeneous alternatives cannot yet be split into source allocations by
    // Shopping. Protect its held partial alternatives as well as the conservative primary
    // deficit: losing that protection would make useful stock look safe to sell.
    const alternatives = [...new Set(sourceItems.flatMap(item => item.anyOf ?? []))];
    for (const name of alternatives.filter(n => !common.some(c => nameKey(c) === nameKey(n)))) {
      const key = nameKey(name);
      const possibleNeed = sourceItems.filter(it => it.anyOf?.some(n => nameKey(n) === key)).reduce((sum, it) => {
        const n = parseAmount(it.amount);
        return n === null ? Infinity : sum + n * (it.heals ? effectiveHeal({ heals: it.heals }, hp) : foodHeal ?? 1);
      }, 0);
      const per = foodHeal ? heals.get(key) ?? foodHeal : 1;
      const qty = Math.min(Math.max(0, stock(name) - (used.get(key) ?? 0)), Math.ceil(possibleNeed / per));
      if (qty > 0) {
        add(name, (out.get(key)?.qty ?? 0) + qty, `Alternative needed for ${line.sources.map(s => s.stepId).join(', ')}`);
        used.set(key, (used.get(key) ?? 0) + qty);
      }
    }
    let primaryPicked = 0;
    // Prefer already held stock; keep the named item as the deficit for future procurement.
    for (const name of names) {
      const key = nameKey(name);
      if (family && state && !usableAt(name, skill => levelOf(state, skill) ?? null)) continue;
      const per = line.dose ? doseKind(name)?.per ?? line.dose.per : foodHeal ? heals.get(key) ?? foodHeal : 1;
      const available = Math.max(0, stock(name, key === nameKey(line.nameEn) ? line.key : undefined) - (line.reusable ? 0 : used.get(key) ?? 0));
      const qty = Math.min(available, Math.ceil(remaining / per));
      if (qty <= 0) continue;
      const previous = out.get(key)?.qty ?? 0;
      add(name, line.reusable ? Math.max(previous, qty) : previous + qty, `Needed for ${line.sources.map(s => s.stepId).join(', ')}`);
      if (key === nameKey(line.nameEn)) primaryPicked += qty;
      if (!line.reusable) used.set(key, (used.get(key) ?? 0) + qty);
      remaining = Math.max(0, remaining - qty * per);
      if (remaining === 0) break;
    }
    if (remaining > 0) {
      const per = line.dose?.per ?? foodHeal ?? 1;
      const k = nameKey(line.nameEn);
      const qty = Math.ceil(remaining / per);
      add(line.nameEn, line.reusable ? Math.max(out.get(k)?.qty ?? 0, primaryPicked + qty) : (out.get(k)?.qty ?? 0) + qty, `Needed for ${line.sources.map(s => s.stepId).join(', ')}`);
    }
  }
  for (const s of window) {
    const trigger = s.inGame?.completionTrigger;
    const goals = trigger?.items ?? [];
    const chosen = trigger?.anyOf ? [goals.find(it => it.names.reduce((sum, n) => sum + stock(n), 0) >= it.count) ?? goals[0]].filter(Boolean) : goals;
    for (const it of chosen) {
      let remaining = it.count;
      for (const name of it.names) {
        const qty = Math.min(stock(name), remaining);
        if (qty > 0) add(name, qty, `${s.id} is done when you hold ${it.count}`);
        remaining -= qty;
      }
      if (remaining > 0 && it.names[0]) add(it.names[0], remaining + Math.min(stock(it.names[0]), it.count), `${s.id} is done when you hold ${it.count}`);
    }
    for (const c of carryoverOf(s)) add(c.item, c.count, `Kept for ${c.forStep}`);
  }
  for (const k of questItemKeys(window)) add(k, Infinity, 'A quest checks for it');
  return out;
}

export interface SnapshotInput {
  state: PlayerState;
  /** The steps the preparation looks at (the current one and the next few). */
  window: readonly Step[];
  questPoints: number | null;
  /** The game's total level, or null. */
  totalLevel?: number | null;
  ironman: boolean | null;
  sellOverride?: SellOverride;
  bankSavedAt?: number | null;
  /** Where the player stands, when the app asked the game for it; absent - whatever the state says (it does not poll for it). */
  position?: WorldPoint | null;
}

export function buildSnapshot(i: SnapshotInput): FundingSnapshot {
  const s = i.state;
  const levels: Record<string, number> = {};
  for (const [k, v] of Object.entries(s.levels)) if (v.known) levels[k] = v.value;
  const total = i.totalLevel ?? totalLevelOf(levels);
  return {
    character: s.player,
    members: s.mode === 'members',
    ironman: i.ironman,
    connected: s.connected,
    level: (skill) => levelOf(s, skill),
    quest: (name) => questOf(s, name),
    questPoints: i.questPoints,
    coins: { bag: s.coins.bag.known ? s.coins.bag.value : null, bank: s.coins.bank.known ? s.coins.bank.value : null },
    liquid: liquidOf(s),
    bankSeen: s.bankSeen,
    bankSavedAt: i.bankSavedAt ?? null,
    held: (name) => heldOf(s, name),
    bag: s.bagItems.known ? s.bagItems.value : null,
    position: i.position !== undefined ? i.position : s.position.known ? s.position.value : null,
    restriction: tradeRestriction({ questPoints: i.questPoints, totalLevel: total, override: i.sellOverride }),
    protections: protectionsFor(i.window, s),
  };
}

/** How many of an item must stay with the player: 0 when nothing protects it. */
export function protectedQty(s: Pick<FundingSnapshot, 'protections'>, name: string): number {
  return s.protections.get(nameKey(name))?.qty ?? 0;
}

/** How many are still missing to reach the protected amount (what the next drops go to first); Infinity items are never "missing" to sell. */
export function reserveGap(s: Pick<FundingSnapshot, 'protections' | 'held'>, name: string): number {
  const need = protectedQty(s, name);
  if (!Number.isFinite(need)) return 0;
  const h = s.held(name);
  return Math.max(0, need - (h.total ?? 0));
}
