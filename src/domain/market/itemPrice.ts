import { type PriceView, FRESH_MS } from './quotes';
import { nameKey } from '../items/itemKey';
import { items } from '../../data';

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
    detail: [...q.notes, ...(q.planningPolicy ? [`Planning reference ${gp(q.referencePrice!)} gp; ${side === 'buy' ? '+10%' : '−10%'} applied once.`] : []),
      ...(side === 'sell' ? ['Before any exchange tax.'] : []), 'An estimate, not a guaranteed offer price.'].join(' '),
  };
}

/** A shop price at or above this is the item data's "not sold here" placeholder, not a price. */
export const NOT_SOLD_PRICE = 1e9;
const DETAIL = new Map(items.map((i) => [nameKey(i.nameEn), i]));
/**
 * What one unit of a used-up supply (arrows, runes, bait, food) costs to replace, for the rate models: the exchange buy price, else the cheapest
 * shop of the item data that sells it for coins to this account (a members shop never on a free one). null when neither is known: unknown,
 * never free. Travel to the shop is not in it.
 */
export function supplyPrice(name: string, prices: PriceView | null | undefined, mode: 'f2p' | 'members'): number | null {
  const ge = prices?.buy(name)?.price;
  if (ge !== undefined) return ge;
  const shop = (DETAIL.get(nameKey(name))?.buyLocations ?? [])
    .filter((b) => !(b.members && mode === 'f2p') && b.stock !== 0 && b.price < NOT_SOLD_PRICE)
    .reduce<number | null>((a, b) => (a === null || b.price < a ? b.price : a), null);
  return shop;
}
