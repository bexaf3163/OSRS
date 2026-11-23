// What loot is worth in time (2.75-2.78, T10): one rule for the fight plans (combatRoute/plans.ts), the Skills page's combat methods (combatRates.ts)
// and the gathering skills' bank-or-drop choice (skillingRates.ts). A drop is kept and banked only where its coins come faster than the simplest way to
// earn coins - killing cows for their hides (funding's cows-cowhide rate at the exchange's price after tax); then the coins count as the minutes that way
// would take.

import { fundingMethodsJson as fundingJson, fundingWikiJson } from '../../data';
import { netEach } from './ge';
import { isRestrictedItem, type TradeRestriction } from './tradeRestriction';
import type { PriceView } from './quotes';

/** Seconds to pick one drop up: the click and a step or two, the fast and the slow end. */
export const PICKUP_SECONDS: [number, number] = [1.2, 3];
/** Bag cells a loot trip fills: the weapon is worn, two cells for potions or a few pieces of food. */
export const LOOT_SLOTS = 26;

const BASELINES = (fundingJson as unknown as { methods: { id: string; rate: { perHour: { typical: number } } }[] }).methods;
const COWHIDE_METHOD = BASELINES.find((m) => m.id === 'cows-cowhide');
const GOAT_METHOD = BASELINES.find((m) => m.id === 'grind-goat-horns');

/** What a minute is worth in coins: cowhides at the exchange's price after the tax. Null without a price: then no loot is planned. */
export function coinsPerMinute(prices: PriceView | null | undefined, mode: 'f2p' | 'members' = 'f2p'): number | null {
  const hide = prices?.sell('Cowhide')?.price;
  if (!hide || !COWHIDE_METHOD) return null;
  const cows = (COWHIDE_METHOD.rate.perHour.typical * netEach(hide, 'Cowhide')) / 60;
  // A Members minute is worth at least the simplest Members method: grinding goat horns needs no level (owner, 2026-11-15).
  const dust = prices?.sell('Goat horn dust')?.price, horn = prices?.buy('Goat horn')?.price;
  if (mode !== 'members' || !GOAT_METHOD || !dust || !horn) return cows;
  return Math.max(cows, (GOAT_METHOD.rate.perHour.typical * (netEach(dust, 'Goat horn dust') - horn)) / 60);
}

/**
 * The share of a method's time its banked coins are worth, at most COIN_SHARE_CAP. The cowhide rate is a rough baseline (one free method at the typical
 * pace), not this character's best way to earn; so coins only ever trade against part of the time, and past the cap the XP decides.
 */
export const COIN_SHARE_CAP = 0.5;

/** netPerHour: coins banked less coins used up (arrows, runes, bait, food), an hour. A gain is capped; a cost counts in full (it is real money). */
export function coinTimeShare(netPerHour: number | undefined, rate: number | null): number {
  if (!rate || !netPerHour) return 0;
  const share = netPerHour / (rate * 60);
  return share > 0 ? Math.min(COIN_SHARE_CAP, share) : share;
}

/** Coins one drop brings after the tax, or null: no price, nothing after the tax, or an item a restricted account cannot sell. */
type GuideOutput = { item: { name: string }; qty: number; chance?: [number, number] };
const GUIDE_OUTPUTS = new Map((fundingWikiJson as unknown as { methods: { id: string; outputs?: GuideOutput[] }[] }).methods.map((m) => [m.id, m.outputs ?? []]));

/** One kill of a per-kill money guide: every output at its expected count, sold, or alched when the player can cast High Alchemy
 * (`alch`) and the alch value less a nature rune pays more. An output with no price adds nothing, so the value is a floor. */
export function guideDropValue(guide: string, prices: PriceView | null | undefined, restriction?: TradeRestriction['state'], alch = false): number | null {
  const outputs = GUIDE_OUTPUTS.get(guide);
  if (!outputs?.length || !prices) return null;
  const nature = alch ? prices.buy('Nature rune')?.price ?? null : null;
  const each = (name: string) => {
    const sold = dropValue(name, prices, restriction) ?? 0;
    const value = nature === null ? undefined : prices.alchOf?.(name);
    return value === undefined ? sold : Math.max(sold, value - nature!);
  };
  return outputs.reduce((sum, o) => sum + each(o.item.name) * o.qty * (o.chance ? o.chance[0] / o.chance[1] : 1), 0);
}

export function dropValue(name: string, prices: PriceView | null | undefined, restriction: TradeRestriction['state'] | undefined): number | null {
  if (restriction === 'RESTRICTED' && isRestrictedItem(name)) return null;
  // Coins (high alchemy) are money already: one each, no exchange and no tax.
  if (name.toLowerCase() === 'coins') return 1;
  const price = prices?.sell(name)?.price;
  const each = price ? netEach(price, name) : 0;
  return each > 0 ? each : null;
}

/**
 * Whether banking one drop a kill pays: its coins per second of extra work (the pickup and its share of a bank trip, `tripMinutes` for LOOT_SLOTS
 * drops) against the rate. Returns the extra seconds a kill when it does, else null.
 */
export function lootSecondsPerKill(each: number, tripMinutes: number, rate: number | null): number | null {
  const extra = (PICKUP_SECONDS[0] + PICKUP_SECONDS[1]) / 2 + (tripMinutes * 60) / LOOT_SLOTS;
  return bankingPays(each, extra, rate) ? extra : null;
}

/**
 * The one rule for keeping anything: coins per extra second of keeping it (a pickup, a share of a bank trip) at least what a second earns.
 */
export function bankingPays(each: number, extraSeconds: number, rate: number | null): boolean {
  return rate !== null && rate > 0 && each > 0 && (extraSeconds <= 0 || each / extraSeconds >= rate / 60);
}
