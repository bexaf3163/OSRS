import type { PriceView } from './funding/quotes';
import { FRESH_MS } from './funding/quotes';

/** A market estimate for display/acquisition; database planning prices cannot masquerade as market quotes. */
export interface ItemPrice {
  state: 'current' | 'cached' | 'unavailable';
  unit: number | null;
  total: number | null;
  quantity: number;
  label: string;
  text: string;
  detail: string;
}

/** Omit GE metadata for items the market cannot identify (including untradeable quest items). */
export function marketItemPrice(prices: PriceView | null | undefined, name: string, id: number | undefined, quantity: number, knownTradeable = false): ItemPrice | undefined {
  const q = prices?.buy(name, id);
  if (!knownTradeable && prices?.idOf(name) === undefined && (!q || q.basis === 'baked')) return undefined;
  return itemPrice(prices, name, id, quantity);
}

export function itemPrice(prices: PriceView | null | undefined, name: string, id: number | undefined, quantity: number, side: 'buy' | 'sell' = 'buy'): ItemPrice {
  const unavailable: ItemPrice = { state: 'unavailable', unit: null, total: null, quantity, label: 'Price unavailable', text: 'Price unavailable', detail: `No usable market ${side} quote. Check the offer before ${side === 'buy' ? 'buying' : 'selling'}.` };
  if (!Number.isSafeInteger(quantity) || quantity < 1) return unavailable;
  const q = side === 'sell' ? prices?.sell(name, id) : prices?.buy(name, id);
  if (!q || q.basis === 'baked' || !Number.isSafeInteger(q.price) || q.price < 1 || !Number.isSafeInteger(q.price * quantity)) return unavailable;
  const cached = prices!.status !== 'live' || q.ageMinutes === null || q.ageMinutes * 60_000 > FRESH_MS;
  const total = q.price * quantity;
  const gp = (n: number) => n.toLocaleString('en-US');
  const market = side === 'sell' ? 'GE sell estimate' : 'GE estimate';
  const label = cached ? `Cached ${market}` : q.basis === 'other-side' ? `Indicative ${market}` : market;
  return {
    state: cached ? 'cached' : 'current', unit: q.price, total, quantity, label,
    text: `${label}: ≈ ${gp(total)} gp${quantity > 1 ? ` (${gp(q.price)} each)` : ''}`,
    detail: [...q.notes, ...(side === 'sell' ? ['Before any exchange tax.'] : []), 'An estimate, not a guaranteed offer price.'].join(' '),
  };
}
