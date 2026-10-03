// Цены для оценки добычи: свежие с биржи (OSRS Wiki Prices), а пока их нет — из базы предметов проекта.
// Оценка добычи пересчитывается по текущим ценам при каждом показе, а не фиксируется в момент находки:
// цена, которая была час назад, — не цена сейчас.

import { nameKey } from './checklist';
import type { LedgerEntry } from './ledger';

export interface PriceBook {
  /** Цена продажи за штуку по названию; нет цены — undefined. */
  priceOf: (name: string) => number | undefined;
  /** live — цены биржи, baked — из базы проекта (биржа недоступна). */
  source: 'live' | 'baked';
  /** Когда получены свежие цены (мс); для baked — null. */
  at: number | null;
}

export interface LivePrices {
  at: number;
  prices: Map<number, { sellPrice: number }>;
}

/**
 * Свежие цены по названию: идентификатор → название берётся из справочника биржи. Предмета нет в свежих ценах
 * (не торгуется или редкий) — берём цену из базы проекта, если она там есть. Сети нет вовсе — только база.
 */
export function buildPriceBook(live: LivePrices | null, mapping: Map<number, { name: string }> | null, baked: Map<string, number>): PriceBook {
  if (!live || !mapping || live.prices.size === 0) {
    return { priceOf: (name) => baked.get(nameKey(name)), source: 'baked', at: null };
  }
  const byName = new Map<string, number>();
  for (const [id, p] of live.prices) {
    const m = mapping.get(id);
    // Одно название у нескольких предметов (версии, банкноты) — берём меньшую цену: оценка не должна завышаться.
    if (m && p.sellPrice > 0) {
      const k = nameKey(m.name);
      const prev = byName.get(k);
      byName.set(k, prev === undefined ? p.sellPrice : Math.min(prev, p.sellPrice));
    }
  }
  return { priceOf: (name) => byName.get(nameKey(name)) ?? baked.get(nameKey(name)), source: 'live', at: live.at };
}

/** Записи журнала с оценкой по текущим ценам; монеты и записи без цены остаются как были. */
export function reprice(entries: LedgerEntry[], book: PriceBook): LedgerEntry[] {
  return entries.map((e) => {
    if (e.name === 'Coins') return e;
    const price = book.priceOf(e.name);
    if (price === undefined) {
      if (e.estimatedGpValue === undefined) return e;
      const { estimatedGpValue: _drop, ...rest } = e;
      return rest;
    }
    return { ...e, estimatedGpValue: price * e.quantityDelta };
  });
}

/** «по ценам биржи на 20:15» / «по ценам из базы — биржа недоступна». */
export function priceNote(book: PriceBook): string {
  if (book.source === 'live' && book.at !== null) {
    const d = new Date(book.at);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `по ценам биржи на ${hh}:${mm}`;
  }
  return 'по ценам из базы — биржа недоступна';
}
