// Деньги и запас: точные монеты отдельно от оценки предметов. Монеты в сумке и банке — факт из игры;
// предметы — «~» по ценам биржи (оценка плагина через цены RuneLite), это не деньги, пока их не продали.
//
// Двойного счёта нет по построению: считается то, что лежит сейчас (сумка + банк), а не события «подобрал →
// положил в сумку → отнёс в банк». Предмет, переложенный в банк, не прибавляется второй раз: он просто
// переехал из одной суммы в другую. Прибавка за шаг — разница между снимками.

import type { GearState } from '../services/runeliteBridge';

export interface Wealth {
  /** Монеты: сумка, банк; total — только если известны оба (банк открывали). */
  cash: { bag: number | null; bank: number | null; total: number | null };
  /** Оценка предметов без монет: в сумке и на себе, в банке. */
  items: { carried: number | null; bank: number | null; total: number | null };
  /** Монеты + оценка предметов; null — чего-то не хватает для полной суммы. */
  estimatedTotal: number | null;
  /** Банк в этой сессии не открывали — известна только сумка. */
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
  /** Точные монеты (сумка + банк). */
  cash: number;
  /** Сколько не хватает монетами. */
  missingCash: number;
  /** Оценка предметов: если продать, сколько добавится (≈). */
  itemsValue: number | null;
  /** Монеты + предметы (≈) против цели. */
  withItems: number | null;
  done: boolean;
  /** Цели хватит, если продать предметы (≈), но монетами ещё нет. */
  doneIfSold: boolean;
}

/** Прогресс шага-заработка. null — монеты в банке неизвестны: без них прогресс не посчитать честно. */
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
