// Журнал ресурсов: что прибавилось и убавилось за сеанс и почему — добыча, покупка, продажа, награда, перекладывание
// в банк, расход. Строится из изменений между снимками состояния (playerState.diffPlayerState), а не из
// «подобрал → положил → отнёс»: перекладывание в банк не считается заработком, а оценка добычи не выдаётся за деньги.
// «Известные монеты» и «оценка предметов» всегда отдельно.

import type { StateChange, PlayerState } from './playerState';

export type LedgerReason = 'LOOT' | 'PICKUP' | 'PURCHASE' | 'SALE' | 'QUEST_REWARD' | 'BANK_TRANSFER' | 'CONSUMED' | 'UNKNOWN';

export interface LedgerEntry {
  /** Предмет; для монет — «Coins». */
  name: string;
  quantityDelta: number;
  reason: LedgerReason;
  timestamp: number;
  /** Оценка стоимости прибавки по ценам биржи; нет цены — нет оценки. */
  estimatedGpValue?: number;
}

export type PriceOf = (name: string) => number | undefined;

const COINS = 'Coins';

/**
 * Записи за одно изменение состояния. Причина — по тому, что случилось рядом в этот же миг:
 *  — предмет прибавился, монеты в сумке убавились → покупка; предмет убавился, монеты прибавились → продажа;
 *  — квест засчитан в этот же миг → награда за квест;
 *  — банк открыли или закрыли (суммы несравнимы) → записей нет: это не прибавка, а появление данных;
 *  — иначе прибавка — добыча, убыль — расход.
 * Когда банк известен и до, и после, перекладывание не меняет суммы — записей не будет, заработком оно не считается.
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
  // Монеты сумки и банка вместе: положил деньги в банк — сумка убавилась, банк прибавился, итог нулевой.
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
  /** Монеты, полученные добычей, наградами и продажей (без перекладывания в банк). */
  coinsEarned: number;
  /** Потрачено на покупки. */
  coinsSpent: number;
  /** Оценка добытых предметов по ценам биржи — это не деньги, пока их не продали. */
  estimatedLootValue: number;
  /** Сколько записей добычи без цены: оценка занижена на них. */
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
 * Цель по ресурсу: сейчас, нужно, не хватает, откуда (игра/вручную/неизвестно) и время — только если хватает замеров.
 * «Известно» и «оценка» не смешиваются: current — то, что точно есть; estimated — оценка добычи (если задана).
 */
export interface ResourceGoal {
  label: string;
  /** null — неизвестно. */
  current: number | null;
  target: number;
  missing: number | null;
  /** Оценка добычи по ценам биржи (для денег): сколько прибавится, если продать. */
  estimated?: number;
  /** Оценка прогресса «известное + добыча»: показывается отдельной строкой с «~». */
  estimatedProgress?: number;
  done: boolean;
  /** Минут до цели по темпу сеанса; undefined — замеров мало, время не выдумываем. */
  etaMinutes?: number;
}

/** Минимум замеров, чтобы называть время. */
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

/** Темп в минуту по записям добычи за последние windowMs; null — замеров мало (меньше MIN_ETA_SECONDS) или нет прироста. */
export function ratePerMinute(entries: LedgerEntry[], now: number, pick: (e: LedgerEntry) => number, windowMs = 10 * 60_000): number | null {
  const recent = entries.filter((e) => now - e.timestamp <= windowMs && e.reason !== 'BANK_TRANSFER');
  if (recent.length < 2) return null;
  const first = Math.min(...recent.map((e) => e.timestamp));
  const span = (now - first) / 1000;
  if (span < MIN_ETA_SECONDS) return null;
  const total = recent.reduce((s, e) => s + pick(e), 0);
  return total > 0 ? (total / span) * 60 : null;
}
