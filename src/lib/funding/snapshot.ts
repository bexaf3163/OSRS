// The one player snapshot the funding system reads. It is built from the shared PlayerState (levels, coins, bag, bank knowledge, quests, mode,
// position) and the facts around it (the trade restriction, what the route and the quests protect). Nothing is read from the bridge a second time.
//
// Every fact is known or it is not: an unknown level, quest or bank is carried as unknown and never as zero or "none". The snapshot belongs to one
// character; a plan saved for another character is not applied to it (see plan.ts).

import type { Step } from '../../types';
import { nameKey, parseAmount } from '../checklist';
import { carryoverOf } from '../carryover';
import { heldOf, levelOf, questOf, type Held, type PlayerState, type QuestPresence, type WorldPoint } from '../playerState';
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
export function protectionsFor(window: readonly Step[]): Map<string, Protection> {
  const out = new Map<string, Protection>();
  const add = (name: string, qty: number, why: string) => {
    const k = nameKey(name);
    const have = out.get(k);
    // The same item asked for by several steps: the largest single need, not the sum (one stock serves them in turn).
    if (!have || qty > have.qty) out.set(k, { name, qty, why });
  };
  for (const s of window) {
    for (const i of s.itemsRequired ?? []) {
      if (i.inStep) continue;
      add(i.nameEn, parseAmount(i.amount) ?? 1, `Needed for ${s.id}`);
      for (const alt of i.anyOf ?? []) add(alt, 0, `Can stand in for ${i.nameEn}`);
    }
    for (const it of s.inGame?.completionTrigger?.items ?? []) {
      for (const n of it.names) add(n, it.count, `${s.id} is done when you hold ${it.count}`);
    }
    for (const c of carryoverOf(s)) add(c.item, Infinity, `Kept for a later step`);
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
    protections: protectionsFor(i.window),
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
