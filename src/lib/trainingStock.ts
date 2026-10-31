// Optional bank stock uses the same shopping ownership, sources and allocation rules as the current kit.
import type { Step } from '../types';
import { itemById } from '../data';
import { gearById } from '../services/gearAdvisor';
import { findLocalItem } from '../services/wikiService';
import { coinsOf, type PlayerState } from './playerState';
import { itemPrice } from './itemPrice';
import { doseKind } from './doseKind';
import { FRESH_MS, type PriceView } from './funding/quotes';
import { aggregateShopping, isReusable } from './shopping';
import { budgetOf, scopeList, shopRows, type RowContext, type ShopRow } from './shoppingView';

export function stockShoppingContext(state: PlayerState, prices?: PriceView | null, qp?: number | null): RowContext {
  return {
    state, qp,
    onGe: l => l.id !== undefined && (gearById.get(l.id)?.tradeable ?? true),
    detail: id => itemById.get(id),
    gePrice: l => itemPrice(prices, l.nameEn, l.id, 1).unit,
    geLimit: l => prices?.limitOf(l.nameEn, l.id),
    priceOf: name => itemPrice(prices, name, findLocalItem(name)?.id, 1).unit,
    priceLabel: (name, id) => itemPrice(prices, name, id ?? findLocalItem(name)?.id, 1).label,
  };
}

/** Current shopping is unchanged without a forecast. Stock-up forecasts never become mandatory whole-goal purchases. */
export function stockUpShopping(steps: Step[], ctx: RowContext, prices?: PriceView | null) {
  steps = [...new Map(steps.map(s => [s.id, s])).values()];
  const current = steps.map(s => s.stockItems?.length ? { ...s, goalItemsRequired: undefined,
    itemsRequired: s.itemsRequired?.map(i => ({ ...i, totalAmount: undefined })) } : s);
  const { list, trip } = scopeList(current);
  const rows = shopRows(list, { ...ctx, trip });
  const stock: ShopRow[] = [];
  const state = ctx.state, cash = coinsOf(state).total;
  const result = () => ({ list, trip, rows: [...rows, ...stock], stock });
  // Do not create a GE trip, a bank-verification trip or a funding goal solely for extras.
  if (!rows.some(r => !r.optional && r.channel === 'ge' && r.qty > 0) || !state.connected || !state.bankSeen
    || !state.owned || state.owned.bankSavedAt !== undefined || cash === null || prices?.status !== 'live') return result();
  if (rows.some(r => !r.optional && r.channel === 'ge' && !usable(prices.buy(r.name, r.id)))) return result();
  const budget = budgetOf(rows, list.coins, coinsOf(state));
  if (budget.unpriced || budget.unknownRows || budget.shortfall !== 0) return result();
  // Keep one full current consumable refill and the declared fares, in addition to paying current purchases.
  let refill = list.coins;
  for (const line of list.required.filter(l => !isReusable(l.nameEn))) {
    const quote = prices.buy(line.nameEn, line.id);
    if (!usable(quote)) return result();
    refill += quote.price * Math.ceil(line.count / (doseKind(line.nameEn)?.per ?? 1));
  }
  let remaining = Math.max(0, cash - budget.required - list.coins - refill);
  const candidates = steps.flatMap(s => s.stockItems?.length ? [{ ...s, itemsRequired: s.stockItems, goalItemsRequired: undefined, itemsRecommended: [] }] : []);
  const candidateList = aggregateShopping(candidates);
  // Allocate candidates together with every current line; alternatives cannot spend the same bank stock twice.
  const combined = new Map(list.required.map(l => [l.key, l]));
  for (const line of candidateList.required) {
    const old = combined.get(line.key);
    combined.set(line.key, old ? { ...line, count: Math.max(old.count, line.count) } : line);
  }
  const forecastRows = shopRows({ required: [...combined.values()], recommended: [], coins: 0 }, ctx);
  const currentByKey = new Map(rows.filter(r => !r.optional).map(r => [r.key, r]));
  let gear = 0;
  for (const line of [...candidateList.required].sort((a, b) => Number(b.reusable) - Number(a.reusable))) {
    const r = forecastRows.find(r => r.key === line.key), primary = currentByKey.get(line.key);
    if (!r || r.channel !== 'ge' || r.unit === 'dose' || r.own.total === null || r.own.source === 'manual') continue;
    const quote = prices.buy(r.name, r.id);
    if (!usable(quote) || r.reusable && gear >= 2) continue;
    const primaryQty = primary?.channel === 'ge' ? primary.qty : 0;
    const max = Math.min(r.qty - primaryQty, Math.floor(remaining / quote.price),
      Math.max(0, (prices.limitOf(r.name, r.id) ?? Infinity) - primaryQty));
    // A few extra arrows are not a useful reserve; keep at least one normal batch.
    const minimum = r.reusable ? 1 : Math.max(1, trip.get(line.key) ?? 1);
    if (!Number.isSafeInteger(max) || max < minimum) continue;
    const extra = r.reusable ? 1 : max;
    const cost = extra * quote.price;
    stock.push({ ...r, key: `stock:${r.key}`, optional: true, bankStock: true, qty: extra,
      required: (r.own.total ?? 0) + primaryQty + extra, cost, unitPrice: quote.price,
      action: 'Bank for upcoming training stages; optional now', priceLabel: 'GE estimate' });
    remaining -= cost;
    if (r.reusable) gear++;
    if (stock.length >= 6) break;
  }
  return result();
}

function usable(q: ReturnType<PriceView['buy']>): q is NonNullable<ReturnType<PriceView['buy']>> {
  return !!q && q.basis === 'side' && q.confidence !== 'LOW' && q.ageMinutes !== null && q.ageMinutes >= 0
    && q.ageMinutes * 60_000 <= FRESH_MS && Number.isSafeInteger(q.price) && q.price > 0;
}
