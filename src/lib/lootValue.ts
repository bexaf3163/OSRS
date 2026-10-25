// What loot is worth in time (2.75-2.78, T10): one rule for the fight plans (combatRoute/plans.ts), the Skills page's combat methods (combatRates.ts)
// and the gathering skills' bank-or-drop choice (skillingRates.ts). A drop is kept and banked only where its coins come faster than the simplest way to
// earn coins - killing cows for their hides (funding's cows-cowhide rate at the exchange's price after tax); then the coins count as the minutes that way
// would take.

import fundingJson from '../data/fundingMethods.json';
import { netEach } from './funding/ge';
import { isRestrictedItem, type TradeRestriction } from './tradeRestriction';
import type { PriceView } from './funding/quotes';
import type { MethodPriority } from './playStyle';

/** Seconds to pick one drop up: the click and a step or two, the fast and the slow end. */
export const PICKUP_SECONDS: [number, number] = [1.2, 3];
/** Bag cells a loot trip fills: the weapon is worn, two cells for potions or a few pieces of food. */
export const LOOT_SLOTS = 26;

const COWHIDE_METHOD = (fundingJson as unknown as { methods: { id: string; rate: { perHour: { typical: number } } }[] }).methods.find((m) => m.id === 'cows-cowhide');

/** What a minute is worth in coins: cowhides at the exchange's price after the tax. Null without a price: then no loot is planned. */
export function coinsPerMinute(prices: PriceView | null | undefined): number | null {
  const hide = prices?.sell('Cowhide')?.price;
  if (!hide || !COWHIDE_METHOD) return null;
  return (COWHIDE_METHOD.rate.perHour.typical * netEach(hide, 'Cowhide')) / 60;
}

/**
 * The share of a method's time its banked coins are worth, at most COIN_SHARE_CAP. The cowhide rate is a rough baseline (one free method at the typical
 * pace), not this character's best way to earn; so coins only ever trade against part of the time, and past the cap the XP decides.
 */
export const COIN_SHARE_CAP = 0.5;
export function coinTimeShare(lootPerHour: number | undefined, rate: number | null): number {
  return rate && lootPerHour && lootPerHour > 0 ? Math.min(COIN_SHARE_CAP, lootPerHour / (rate * 60)) : 0;
}

/** Coins one drop brings after the tax, or null: no price, nothing after the tax, or an item a restricted account cannot sell. */
export function dropValue(name: string, prices: PriceView | null | undefined, restriction: TradeRestriction['state'] | undefined): number | null {
  if (restriction === 'RESTRICTED' && isRestrictedItem(name)) return null;
  const price = prices?.sell(name)?.price;
  const each = price ? netEach(price, name) : 0;
  return each > 0 ? each : null;
}

/**
 * Whether banking one drop a kill pays: its coins per second of extra work (the pickup and its share of a bank trip, `tripMinutes` for LOOT_SLOTS
 * drops) against the rate. Returns the extra seconds a kill when it does, else null.
 */
export function lootSecondsPerKill(each: number, tripMinutes: number, rate: number | null, objective?: MethodPriority): number | null {
  const extra = (PICKUP_SECONDS[0] + PICKUP_SECONDS[1]) / 2 + (tripMinutes * 60) / LOOT_SLOTS;
  return bankingPays(each, extra, rate, objective) ? extra : null;
}

/**
 * The one rule for keeping anything: coins per extra second of keeping it (a pickup, a share of a bank trip) at least what a second earns. On the
 * fastest objective nothing that costs time is kept: the player asked for the level first, and the coins are not traded for it.
 */
export function bankingPays(each: number, extraSeconds: number, rate: number | null, objective?: MethodPriority): boolean {
  if (objective === 'fastest' && extraSeconds > 0) return false;
  return rate !== null && rate > 0 && each > 0 && (extraSeconds <= 0 || each / extraSeconds >= rate / 60);
}
