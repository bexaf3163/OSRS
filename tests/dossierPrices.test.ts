import { describe, expect, it } from 'vitest';
import { itemPrice } from '../src/lib/itemPrice';
import { buildPriceView } from '../src/lib/funding/quotes';
import { alchMargin } from '../src/lib/alchemy';

const now = 1_800_000_000_000;
function prices(low: number | null = 100, status: 'live' | 'stale' = 'live') {
  return buildPriceView({ now, mapping: null, baked: new Map([['lobster', { buy: 9999, sell: 9998 }]]),
    board: { at: now, hourAt: null, status, quotes: new Map([[379, { id: 379,
      high: { price: 200, at: now }, low: { price: low, at: low === null ? null : now }, hour: null,
    }]]) },
  });
}

describe('dossier buy/sell and alchemy estimates', () => {
  it('keeps actual market sides distinct without name mapping and multiplies physical quantities', () => {
    const view = prices();
    expect(itemPrice(view, 'Lobster', 379, 20)).toMatchObject({ unit: 200, total: 4000, label: 'GE estimate' });
    expect(itemPrice(view, 'Lobster', 379, 20, 'sell')).toMatchObject({ unit: 100, total: 2000, label: 'GE sell estimate' });
    expect(itemPrice(view, 'Lobster', 379, 20, 'sell').detail).toContain('Before any exchange tax');
  });
  it('labels stale sell estimates and opposite-side substitutes', () => {
    expect(itemPrice(prices(100, 'stale'), 'Lobster', 379, 1, 'sell')).toMatchObject({ state: 'cached', label: 'Cached GE sell estimate' });
    expect(itemPrice(prices(null), 'Lobster', 379, 1, 'sell')).toMatchObject({ unit: 175, label: 'Indicative GE sell estimate' });
  });
  it('cannot promote a database fallback to a displayed market sale or alchemy profit', () => {
    const view = buildPriceView({ now, board: null, mapping: null, baked: new Map([['lobster', { buy: 10, sell: 9 }]]) });
    const buy = itemPrice(view, 'Lobster', 379, 1);
    expect(buy.unit).toBeNull();
    expect(itemPrice(view, 'Lobster', 379, 1, 'sell').state).toBe('unavailable');
    expect(alchMargin(1000, buy.unit ?? undefined, 100)).toBeNull();
  });
  it.each([-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])('invalid input %s cannot create a profit', value => {
    expect(alchMargin(value, 700, 100)).toBeNull();
    expect(alchMargin(1000, value, 100)).toBeNull();
    expect(alchMargin(1000, 700, value)).toBeNull();
  });
  it('retains valid Nature-rune arithmetic and rejects an unsafe resulting total', () => {
    expect(alchMargin(1000, 700, 100)).toEqual({ profit: 200, worth: true });
    expect(alchMargin(0, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)).toBeNull();
  });
});
