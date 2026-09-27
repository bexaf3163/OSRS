// Оптовый список Grand Exchange: одна закупка на несколько шагов вперёд вместо походов на биржу перед каждым.
// Предметы собираются из itemsRequired выбранных шагов, одинаковые складываются по ID (без ID — по имени).

import type { Step, StepItemRequirement } from '../types';
import { nameKey, parseAmount } from './checklist';

/**
 * Инструменты и снаряжение: не тратятся, поэтому одного хватает на все шаги — берётся наибольшее
 * количество за шаг, а не сумма. Всё остальное (руда, еда, квестовые предметы) складывается.
 */
export const REUSABLE = new Set([
  'bronze axe', 'bronze pickaxe', 'mithril axe', 'small fishing net', 'fly fishing rod', 'harpoon', 'lobster pot',
  'tinderbox', 'spade', 'hammer', 'knife', 'shears', 'chisel', 'secateurs', 'ghostspeak amulet', 'dramen staff',
  'anti-dragon shield', 'rune sword', 'rune scimitar', 'adamant scimitar', 'holy symbol',
]);

const COINS_ID = 995;
/** «Из шага S2-01», «Из S4-05: …», «Сохранённые из S1-04!», «Запасной из шага S1-03». */
const CARRY_OVER = /(?:^|[\s(])из\s+(?:шага\s+)?(S\d-\d{2})/i;

export function carryOverFrom(item: StepItemRequirement): string | null {
  return item.howToGet.match(CARRY_OVER)?.[1] ?? null;
}

export interface ShoppingSource {
  stepId: string;
  amount: string | number;
  /** Тот же предмет, что куплен/добыт в более раннем выбранном шаге, — второй раз не считается. */
  carryOver: boolean;
}

export interface ShoppingLine {
  key: string;
  nameEn: string;
  nameRu: string;
  id?: number;
  iconUrl?: string;
  count: number;
  /** false — хотя бы в одном шаге количество не числом («сколько есть»): count — нижняя оценка. */
  exact: boolean;
  reusable: boolean;
  /** Во всех шагах добывается по ходу самого шага (не закупкой) — покупать не обязательно. */
  inStepOnly: boolean;
  sources: ShoppingSource[];
  /** Где взять — из первого шага, где предмет нужен. */
  howToGet: string;
}

export interface ShoppingList {
  required: ShoppingLine[];
  recommended: ShoppingLine[];
  /** Сколько монет нужно на сами шаги (проезд, плата NPC). */
  coins: number;
}

interface Acc {
  line: ShoppingLine;
  perStep: Map<string, number>;
  allInStep: boolean;
}

function collect(steps: Step[], pick: (s: Step) => StepItemRequirement[] | undefined, selected: Set<string>, coinsOut?: { n: number }): ShoppingLine[] {
  const byId = new Map<number, Acc>();
  const byName = new Map<string, Acc>();
  const order: Acc[] = [];
  for (const step of steps) {
    for (const item of pick(step) ?? []) {
      const n = parseAmount(item.amount);
      if (item.wikiItemId === COINS_ID || nameKey(item.nameEn) === 'coins') {
        if (coinsOut && n) coinsOut.n += n;
        continue;
      }
      const from = carryOverFrom(item);
      const carryOver = from !== null && selected.has(from);
      const name = nameKey(item.nameEn);
      let acc = (item.wikiItemId !== undefined ? byId.get(item.wikiItemId) : undefined) ?? byName.get(name);
      if (!acc) {
        acc = {
          line: {
            key: item.wikiItemId !== undefined ? `id:${item.wikiItemId}` : `name:${name}`,
            nameEn: item.nameEn, nameRu: item.nameRu, id: item.wikiItemId, iconUrl: item.iconUrl,
            count: 0, exact: true, reusable: REUSABLE.has(name), inStepOnly: true, sources: [], howToGet: item.howToGet,
          },
          perStep: new Map(),
          allInStep: true,
        };
        order.push(acc);
      }
      if (item.wikiItemId !== undefined) {
        byId.set(item.wikiItemId, acc);
        acc.line.id ??= item.wikiItemId;
      }
      acc.line.iconUrl ??= item.iconUrl;
      byName.set(name, acc);
      acc.line.sources.push({ stepId: step.id, amount: item.amount, carryOver });
      if (carryOver) continue;
      if (n === null) acc.line.exact = false;
      // В шаге-закупке (gear) «по ходу шага» и значит «купить на бирже».
      if (!item.inStep || step.type === 'gear') acc.allInStep = false;
      // Две строки одного предмета в одном шаге — разные нужды (ловушка для рыбы и для Оракула): складываются.
      acc.perStep.set(step.id, (acc.perStep.get(step.id) ?? 0) + (n ?? 1));
    }
  }
  return order
    .filter((a) => a.perStep.size > 0)
    .map((a) => {
      const counts = [...a.perStep.values()];
      const count = a.line.reusable ? Math.max(...counts) : counts.reduce((x, y) => x + y, 0);
      return { ...a.line, count, inStepOnly: a.allInStep };
    });
}

/** Сводный список по выбранным шагам (в порядке маршрута). */
export function aggregateShopping(steps: Step[]): ShoppingList {
  const selected = new Set(steps.map((s) => s.id));
  const coins = { n: 0 };
  const required = collect(steps, (s) => s.itemsRequired, selected, coins);
  const requiredKeys = new Set(required.flatMap((l) => [l.key, `name:${nameKey(l.nameEn)}`]));
  // Рекомендуемое, которое и так в обязательном списке (по ID или по имени), второй раз не показываем.
  const recommended = collect(steps, (s) => s.itemsRecommended, selected)
    .filter((l) => !requiredKeys.has(l.key) && !requiredKeys.has(`name:${nameKey(l.nameEn)}`));
  return { required, recommended, coins: coins.n };
}

/** Русское число: plural(21, 'позиция', 'позиции', 'позиций') → «позиция». */
export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m100 >= 11 && m100 <= 14) return many;
  if (m10 === 1) return one;
  if (m10 >= 2 && m10 <= 4) return few;
  return many;
}

export function formatGp(n: number): string {
  return Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ');
}

export interface CopyLine {
  nameEn: string;
  /** Сколько купить. */
  buy: number;
  exact: boolean;
}

/** Текст для буфера обмена: английские названия — как их искать на бирже. */
export function shoppingText(title: string, lines: CopyLine[], coins: number): string {
  const rows = lines.filter((l) => l.buy > 0).map((l) => `${l.nameEn} x${l.buy}${l.exact ? '' : '+'}`);
  const out = [title, ...rows];
  if (coins > 0) out.push(`Coins ~${formatGp(coins)} gp (на сами шаги)`);
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// «У меня уже есть»: сколько предмета уже есть и сколько осталось купить.
//
// Источники по старшинству: данные из игры, если они полные (банк открывали в этой сессии RuneLite), →
// отметка игрока «у меня есть N» → неизвестно. «Неизвестно» — не ноль: без банка сумка говорит только о
// сумке, и программа не делает вывод, что остального нет.

/** MISSING — нет совсем, PARTIAL — часть, SUFFICIENT — хватает, UNKNOWN — неизвестно, UNAVAILABLE — не продаётся на бирже. */
export type ShoppingItemStatus = 'MISSING' | 'PARTIAL' | 'SUFFICIENT' | 'UNKNOWN' | 'UNAVAILABLE';

export interface Holding {
  required: number;
  /** Сколько есть — по лучшему источнику; null — неизвестно. */
  owned: number | null;
  /** Сколько купить. При неизвестном — всё, что не подтверждено (верхняя оценка). */
  buy: number;
  status: ShoppingItemStatus;
  source: 'live' | 'manual' | 'bag' | 'none';
  /** Из игры: в сумке (с банкнотами) и в банке; bank null — банк в этой сессии не открывали. */
  carried?: number;
  bank?: number | null;
  /** Отметка игрока, если есть. */
  manual?: number;
  /** Игрок отметил больше, чем подтверждает игра с открытым банком: отметка устарела. */
  stale?: boolean;
}

/** Ключ строки списка для ручной отметки: по ID предмета, у предметов без ID — по имени (§97.18). */
export const lineKey = (line: Pick<ShoppingLine, 'key'>) => line.key;

export function holdingFor(
  line: Pick<ShoppingLine, 'nameEn' | 'count' | 'exact'>,
  owned: { bankSeen: boolean; items: Map<string, { carried: number; noted: number; bank?: number }> } | null,
  manual?: number,
  onGe = true,
): Holding {
  const required = line.count;
  const o = owned?.items.get(nameKey(line.nameEn));
  const carried = o ? o.carried + o.noted : undefined;
  const bank = o ? (owned!.bankSeen ? o.bank ?? 0 : null) : undefined;
  const base = {
    required,
    ...(carried !== undefined ? { carried, bank } : {}),
    ...(manual !== undefined ? { manual } : {}),
  };
  const status = (have: number | null): ShoppingItemStatus => {
    if (!onGe) return 'UNAVAILABLE';
    if (have === null) return 'UNKNOWN';
    if (have >= required) return 'SUFFICIENT';
    return have > 0 ? 'PARTIAL' : 'MISSING';
  };
  // Игра знает всё: и сумку, и банк.
  if (o && owned!.bankSeen) {
    const total = carried! + (bank ?? 0);
    return {
      ...base, owned: total, buy: Math.max(0, required - total), status: status(total), source: 'live',
      ...(manual !== undefined && manual > total ? { stale: true } : {}),
    };
  }
  // Отметка игрока: сумка из игры её не опровергает (остальное может лежать в банке).
  if (manual !== undefined) {
    const have = Math.max(manual, carried ?? 0);
    return { ...base, owned: have, buy: Math.max(0, required - have), status: status(have), source: 'manual' };
  }
  // Банк неизвестен: хватает того, что в сумке, — известно; не хватает — неизвестно, а не «нет».
  if (carried !== undefined) {
    if (carried >= required) return { ...base, owned: carried, buy: 0, status: status(carried), source: 'bag' };
    return { ...base, owned: null, buy: required - carried, status: status(null), source: 'bag' };
  }
  return { ...base, owned: null, buy: required, status: status(null), source: 'none' };
}

/**
 * Сколько просить у плагина для подсказки на бирже. Плагин сам вычитает то, что видит в игре; ручная отметка
 * ему неизвестна — её вычитаем здесь, не считая дважды то, что он и так видит в сумке.
 */
export function pluginCount(h: Holding): number {
  if (h.source !== 'manual') return h.required;
  return h.buy + (h.carried ?? 0);
}
