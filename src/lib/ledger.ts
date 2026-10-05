// The resource journal: what increased and decreased during the session and why: gathering, buying, selling, a reward, moving
// to the bank, spending. It is built from the changes between state snapshots (playerState.diffPlayerState), not from
// "picked up, put down, carried": moving to the bank does not count as earnings, and an estimate of loot is not passed off as money.
// "Known coins" and "item estimate" are always separate.

import type { StateChange, PlayerState } from './playerState';

export type LedgerReason = 'LOOT' | 'PICKUP' | 'PURCHASE' | 'SALE' | 'QUEST_REWARD' | 'BANK_TRANSFER' | 'CONSUMED' | 'UNKNOWN';

export interface LedgerEntry {
  /** An item; for coins it is "Coins". */
  name: string;
  quantityDelta: number;
  reason: LedgerReason;
  timestamp: number;
  /** An estimate of the value of a gain at Grand Exchange prices; no price means no estimate. */
  estimatedGpValue?: number;
}

export type PriceOf = (name: string) => number | undefined;

const COINS = 'Coins';

/**
 * Records for one state change. The reason is by what happened next to it at the same moment:
 *  - an item increased and bag coins decreased: a purchase; an item decreased and coins increased: a sale;
 *  - a quest was counted at the same moment: a quest reward;
 *  - the bank was opened or closed (totals are not comparable): no records, that is not a gain but the appearance of data;
 *  - otherwise a gain is gathering and a loss is spending.
 * When the bank is known both before and after, moving does not change the totals: there will be no records, and it does not count as earnings.
 */
export function entriesFor(prev: PlayerState | null, next: PlayerState, changes: StateChange[], now: number, priceOf?: PriceOf): LedgerEntry[] {
  if (!prev || !changes.length) return [];
  if (prev.bankSeen !== next.bankSeen) return [];
  const coin = changes.find((c): c is Extract<StateChange, { kind: 'COINS' }> => c.kind === 'COINS' && c.where === 'bag');
  const bankCoin = changes.find((c): c is Extract<StateChange, { kind: 'COINS' }> => c.kind === 'COINS' && c.where === 'bank');
  const items = changes.filter((c): c is Extract<StateChange, { kind: 'ITEM' }> => c.kind === 'ITEM');
  const questDone = changes.some((c) => c.kind === 'QUEST');
  const out: LedgerEntry[] = [];
  const gained = items.some((i) => i.to > i.from);
  const lost = items.some((i) => i.to < i.from);
  // The coins of the bag and the bank together: put money in the bank and the bag decreased and the bank increased, the total is zero.
  const coinDelta = (coin ? coin.to - coin.from : 0) + (bankCoin ? bankCoin.to - bankCoin.from : 0);
  const bagDelta = coin ? coin.to - coin.from : 0;
  if (coinDelta !== 0) {
    const reason: LedgerReason = questDone ? 'QUEST_REWARD' : coinDelta < 0 ? (gained ? 'PURCHASE' : 'CONSUMED') : lost ? 'SALE' : 'LOOT';
    out.push({ name: COINS, quantityDelta: coinDelta, reason, timestamp: now, estimatedGpValue: coinDelta });
  } else if (bagDelta !== 0 && bankCoin) {
    out.push({ name: COINS, quantityDelta: bagDelta, reason: 'BANK_TRANSFER', timestamp: now });
  }
  for (const i of items) {
    const delta = i.to - i.from;
    const reason: LedgerReason = delta > 0
      ? (questDone ? 'QUEST_REWARD' : coinDelta < 0 ? 'PURCHASE' : 'LOOT')
      : (coinDelta > 0 ? 'SALE' : 'CONSUMED');
    const price = priceOf?.(i.name);
    out.push({ name: i.name, quantityDelta: delta, reason, timestamp: now, ...(price !== undefined ? { estimatedGpValue: price * delta } : {}) });
  }
  return out;
}

export interface LedgerSummary {
  /** Coins received from gathering, rewards and selling (not counting moving to the bank). */
  coinsEarned: number;
  /** Spent on purchases. */
  coinsSpent: number;
  /** An estimate of the gathered items at Grand Exchange prices: this is not money until they are sold. */
  estimatedLootValue: number;
  /** How many gathering records have no price: the estimate is understated by them. */
  unpricedLoot: number;
  entries: number;
}

export function summarize(entries: LedgerEntry[]): LedgerSummary {
  const s: LedgerSummary = { coinsEarned: 0, coinsSpent: 0, estimatedLootValue: 0, unpricedLoot: 0, entries: entries.length };
  for (const e of entries) {
    if (e.reason === 'BANK_TRANSFER') continue;
    if (e.name === COINS) {
      if (e.quantityDelta > 0) s.coinsEarned += e.quantityDelta;
      else if (e.reason === 'PURCHASE') s.coinsSpent += -e.quantityDelta;
      continue;
    }
    if (e.reason === 'LOOT' || e.reason === 'PICKUP') {
      if (e.estimatedGpValue !== undefined) s.estimatedLootValue += e.estimatedGpValue;
      else s.unpricedLoot += 1;
    }
  }
  return s;
}

/**
 * A goal for a resource: now, needed, missing, where from (game/manual/unknown) and the time, only if there are enough measurements.
 * "Known" and "estimate" are not mixed: current is what is surely there; estimated is the loot estimate (if given).
 */
export interface ResourceGoal {
  label: string;
  /** null means unknown. */
  current: number | null;
  target: number;
  missing: number | null;
  /** The loot estimate at Grand Exchange prices (for money): how much will be added if sold. */
  estimated?: number;
  /** An estimate of progress "known + loot": shown as a separate line with "~". */
  estimatedProgress?: number;
  done: boolean;
  /** Minutes to the goal at the session's pace; undefined means too few measurements, so the time is not invented. */
  etaMinutes?: number;
}

/** The minimum number of measurements to name a time. */
export const MIN_ETA_SECONDS = 120;

export function resourceGoal(
  label: string, current: number | null, target: number,
  opts: { estimated?: number; ratePerMinute?: number | null } = {},
): ResourceGoal {
  const missing = current === null ? null : Math.max(0, target - current);
  const estimatedProgress = current !== null && opts.estimated !== undefined ? current + opts.estimated : undefined;
  const goal: ResourceGoal = {
    label, current, target, missing, done: current !== null && current >= target,
    ...(opts.estimated !== undefined ? { estimated: opts.estimated } : {}),
    ...(estimatedProgress !== undefined ? { estimatedProgress } : {}),
  };
  if (missing !== null && missing > 0 && opts.ratePerMinute && opts.ratePerMinute > 0) goal.etaMinutes = Math.ceil(missing / opts.ratePerMinute);
  return goal;
}

/** The per-minute pace from the gathering records over the last windowMs; null means too few measurements (under MIN_ETA_SECONDS) or no gain. */
export function ratePerMinute(entries: LedgerEntry[], now: number, pick: (e: LedgerEntry) => number, windowMs = 10 * 60_000): number | null {
  const recent = entries.filter((e) => now - e.timestamp <= windowMs && e.reason !== 'BANK_TRANSFER');
  if (recent.length < 2) return null;
  const first = Math.min(...recent.map((e) => e.timestamp));
  const span = (now - first) / 1000;
  if (span < MIN_ETA_SECONDS) return null;
  const total = recent.reduce((s, e) => s + pick(e), 0);
  return total > 0 ? (total / span) * 60 : null;
}
