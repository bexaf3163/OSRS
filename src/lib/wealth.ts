// Money and stock: exact coins separately from the item estimate. Coins in the bag and bank are a fact from the game;
// items are "~" at exchange prices (the plugin's estimate through RuneLite prices), this is not money until they are sold.
//
// There is no double counting by construction: what lies there now (bag + bank) is counted, not the events "picked up →
// put in the bag → took to the bank". An item moved to the bank is not added a second time: it simply
// moved from one sum to the other. The gain per step is the difference between snapshots.

import type { GearState } from '../services/runeliteBridge';

export interface Wealth {
  /** Coins: bag, bank; total — only if both are known (the bank was opened). */
  cash: { bag: number | null; bank: number | null; total: number | null };
  /** The estimate of items without coins: in the bag and worn, in the bank. */
  items: { carried: number | null; bank: number | null; total: number | null };
  /** Coins + the item estimate; null — something is missing for the full sum. */
  estimatedTotal: number | null;
  /** The bank was not opened in this session: only the bag is known. */
  bankUnknown: boolean;
}

export function wealthOf(gear: GearState | null): Wealth | null {
  if (!gear || gear.coins === null) return null;
  const bank = gear.bankCoins;
  const carried = gear.carriedValue ?? null;
  const bankItems = gear.bankValue ?? null;
  const cashTotal = bank === null ? null : gear.coins + bank;
  const itemsTotal = carried === null || bankItems === null ? null : carried + bankItems;
  return {
    cash: { bag: gear.coins, bank, total: cashTotal },
    items: { carried, bank: bankItems, total: itemsTotal },
    estimatedTotal: cashTotal === null || itemsTotal === null ? null : cashTotal + itemsTotal,
    bankUnknown: bank === null,
  };
}

export interface MoneyGoalProgress {
  goal: number;
  /** Exact coins (bag + bank). */
  cash: number;
  /** How many coins are missing. */
  missingCash: number;
  /** The item estimate: if sold, how much is added (≈). */
  itemsValue: number | null;
  /** Coins + items (≈) against the goal. */
  withItems: number | null;
  done: boolean;
  /** The goal is reached if the items (≈) are sold, but not by coins yet. */
  doneIfSold: boolean;
}

/** The progress of an earning step. null — the bank coins are unknown: without them the progress cannot be honestly counted. */
export function moneyGoalProgress(goal: number, w: Wealth | null): MoneyGoalProgress | null {
  if (!w || w.cash.total === null) return null;
  const cash = w.cash.total;
  const itemsValue = w.items.total;
  const withItems = itemsValue === null ? null : cash + itemsValue;
  return {
    goal,
    cash,
    missingCash: Math.max(0, goal - cash),
    itemsValue,
    withItems,
    done: cash >= goal,
    doneIfSold: cash < goal && withItems !== null && withItems >= goal,
  };
}
