// Проверка вылета: всё ли из предметов шага лежит в сумке перед выходом из банка.
// Счёт приходит из RuneLite (событие OWNED); правила — те же, что в плагине (Checklist.java).

import type { Step, StepItemRequirement } from '../types';

/** Сколько предмета есть у игрока, по данным плагина. bank — undefined, пока банк в этой сессии не открывали. */
export interface OwnedItem {
  name: string;
  id?: number;
  /** В сумке и надето (без банкнот). */
  carried: number;
  /** Банкнотами в сумке. */
  noted: number;
  bank?: number;
}

export interface OwnedState {
  bankSeen: boolean;
  /** По ключу nameKey(name). */
  items: Map<string, OwnedItem>;
}

/** Имя как ключ сравнения — так же, как ActiveTarget.nameKey в плагине. */
export function nameKey(s: string): string {
  return s.replace(/<[^>]*>/g, '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Количество из маршрута: 1, «23 (20 сдать, 3 в банк)» → 23, «20+» → 20, «1 000» → 1000.
 * null — количество не числом («Сколько есть», «По одной на алхимию»).
 */
export function parseAmount(amount: string | number): number | null {
  if (typeof amount === 'number') return Number.isFinite(amount) && amount > 0 ? Math.floor(amount) : null;
  const m = amount.match(/^\s*(\d{1,3}(?:[  ]\d{3})+|\d+)/);
  if (!m) return null;
  const n = Number(m[1].replace(/[  ]/g, ''));
  return n > 0 ? n : null;
}

export interface PreflightItem {
  nameEn: string;
  nameRu: string;
  id?: number;
  count: number;
  /** false — в маршруте количество не числом: проверяется «есть хотя бы один». */
  exact: boolean;
  heals?: number;
}

/** Что проверять у банка: требуемые предметы, кроме тех, что добываются по ходу самого шага. */
export function preflightItems(step: Step): PreflightItem[] {
  return (step.itemsRequired ?? [])
    .filter((i: StepItemRequirement) => !i.inStep)
    .map((i) => {
      const n = parseAmount(i.amount);
      return { nameEn: i.nameEn, nameRu: i.nameRu, id: i.wikiItemId, count: n ?? 1, exact: n !== null, heals: i.heals };
    });
}

export type PreflightState = 'IN_BAG_READY' | 'MISSING_FROM_BAG' | 'NOT_FOUND_IN_BANK';

export interface PreflightRow {
  item: PreflightItem;
  have: number;
  /** null — банк ещё не открывали. */
  inBank: number | null;
  state: PreflightState;
}

export interface PreflightResult {
  rows: PreflightRow[];
  /** READY_TO_DEPART: всё на руках. */
  ready: boolean;
  missing: number;
}

export function evaluatePreflight(items: PreflightItem[], owned: OwnedState): PreflightResult {
  const rows = items.map((item): PreflightRow => {
    const o = owned.items.get(nameKey(item.nameEn));
    const have = o?.carried ?? 0;
    const inBank = owned.bankSeen ? o?.bank ?? 0 : null;
    let state: PreflightState;
    if (have >= item.count) state = 'IN_BAG_READY';
    else if (inBank === null || have + inBank >= item.count) state = 'MISSING_FROM_BAG';
    else state = 'NOT_FOUND_IN_BANK';
    return { item, have, inBank, state };
  });
  const missing = rows.filter((r) => r.state !== 'IN_BAG_READY').length;
  return { rows, ready: rows.length > 0 && missing === 0, missing };
}

/** Разбор события OWNED из плагина; мусор отбрасывается. */
export function parseOwned(e: unknown): OwnedState | null {
  if (!e || typeof e !== 'object') return null;
  const { bankSeen, items } = e as { bankSeen?: unknown; items?: unknown };
  if (!Array.isArray(items)) return null;
  const map = new Map<string, OwnedItem>();
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.name !== 'string') continue;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
    map.set(nameKey(r.name), {
      name: r.name,
      id: typeof r.id === 'number' ? r.id : undefined,
      carried: num(r.carried),
      noted: num(r.noted),
      bank: typeof r.bank === 'number' ? num(r.bank) : undefined,
    });
  }
  return { bankSeen: bankSeen === true, items: map };
}

/** Всего у игрока: сумка, банкноты и банк (если его открывали). */
export function ownedTotal(owned: OwnedState | null, name: string): number | null {
  if (!owned) return null;
  const o = owned.items.get(nameKey(name));
  if (!o) return null;
  return o.carried + o.noted + (o.bank ?? 0);
}
