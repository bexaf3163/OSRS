import { describe, expect, it } from 'vitest';
import type { Quote, QuoteBoard } from '../../src/services/pricesApi';
import { absorbs, buildPriceView, buyOf, sellOf, THIN_VOLUME } from '../../src/lib/funding/quotes';

const NOW = 1_792_000_000_000;
const min = (m: number) => NOW - m * 60_000;

const quote = (id: number, high: [number | null, number | null], low: [number | null, number | null], hour: Quote['hour'] = null): Quote => ({
  id,
  high: { price: high[0], at: high[1] },
  low: { price: low[0], at: low[1] },
  hour,
});

// Real shapes seen on 2026-10-18 (Big bones 334/325 with a deep market; Black scimitar 3050/1744 with almost no trades).
const bigBones = quote(532, [334, min(1)], [325, min(2)], { avgHigh: 344.87, avgLow: 331.74, highVolume: 19738, lowVolume: 13046 });
const blackScimitar = quote(1327, [3050, min(40)], [1744, min(300)], { avgHigh: 3000, avgLow: 1800, highVolume: 3, lowVolume: 2 });

describe('buying and selling prices', () => {
  it('a deep, fresh market is HIGH confidence with no notes', () => {
    const b = buyOf(bigBones, NOW)!;
    expect(b).toMatchObject({ price: 334, confidence: 'HIGH', basis: 'side', ageMinutes: 1 });
    expect(b.notes).toEqual([]);
    // Selling never counts on more than the hour's average low: 325 < 331.74, so the latest low stands.
    expect(sellOf(bigBones, NOW)).toMatchObject({ price: 325, confidence: 'HIGH', volumePerHour: 32784 });
  });

  it('sell uses the hour average when the latest low is above it (a lucky print is not income)', () => {
    const lucky = quote(1, [400, min(1)], [390, min(1)], { avgHigh: 380, avgLow: 360.9, highVolume: 500, lowVolume: 500 });
    const s = sellOf(lucky, NOW)!;
    expect(s.price).toBe(360);
    expect(s.basis).toBe('average');
  });

  it('buy uses the hour average when the latest high is more than 25% above it (a spike)', () => {
    const spike = quote(1, [500, min(1)], [380, min(1)], { avgHigh: 390.4, avgLow: 385, highVolume: 500, lowVolume: 500 });
    const b = buyOf(spike, NOW)!;
    expect(b.price).toBe(390);
    expect(b.basis).toBe('average');
    expect(b.confidence).toBe('MEDIUM');
    expect(b.notes.join(' ')).toMatch(/spike|far above/i);
  });

  it('an old side lowers the confidence and says how old', () => {
    const old = quote(1, [100, min(60 * 8)], [90, min(1)], { avgHigh: 100, avgLow: 90, highVolume: 500, lowVolume: 500 });
    const b = buyOf(old, NOW)!;
    expect(b.confidence).toBe('LOW');
    expect(b.notes.join(' ')).toMatch(/8 h ago/);
    // The sell side of the same item is fresh: one side must not vouch for the other.
    expect(sellOf(old, NOW)!.confidence).toBe('HIGH');
  });

  it('a dated side (30 min to 6 h) is MEDIUM', () => {
    const q = quote(1, [100, min(120)], [90, min(1)], { avgHigh: 100, avgLow: 90, highVolume: 500, lowVolume: 500 });
    expect(buyOf(q, NOW)!.confidence).toBe('MEDIUM');
  });

  it('a missing side is never silently filled: the substitute is LOW and says so', () => {
    const onlyHigh = quote(2, [500, min(1)], [null, null], { avgHigh: 500, avgLow: null, highVolume: 200, lowVolume: 0 });
    const s = sellOf(onlyHigh, NOW)!;
    expect(s.basis).toBe('other-side');
    expect(s.confidence).toBe('LOW');
    expect(s.price).toBeLessThan(500);
    expect(s.notes[0]).toMatch(/No recent sell price/);
    const onlyLow = quote(3, [null, null], [40, min(1)], null);
    const b = buyOf(onlyLow, NOW)!;
    expect(b).toMatchObject({ price: 40, basis: 'other-side', confidence: 'LOW' });
    expect(buyOf(quote(4, [null, null], [null, null]), NOW)).toBeNull();
    expect(sellOf(undefined, NOW)).toBeNull();
  });

  it('a thin market with a huge gap between the sides cannot be HIGH or MEDIUM', () => {
    const b = buyOf(blackScimitar, NOW)!;
    const s = sellOf(blackScimitar, NOW)!;
    expect(b.confidence).toBe('LOW');
    expect(s.confidence).toBe('LOW');
    expect(s.notes.join(' ')).toMatch(/Thin market/);
    expect(s.notes.join(' ')).toMatch(/% apart/);
    expect(5).toBeLessThan(THIN_VOLUME);
  });

  it('a thin market with a small gap is at best MEDIUM', () => {
    const q = quote(5, [100, min(1)], [98, min(1)], { avgHigh: 100, avgLow: 98, highVolume: 6, lowVolume: 4 });
    expect(buyOf(q, NOW)!.confidence).toBe('MEDIUM');
  });
});

describe('can the market take this many', () => {
  it('compares the quantity with an hour of trades, and unknown volume stays unknown', () => {
    const p = sellOf(bigBones, NOW)!;
    expect(absorbs(p, 100).plausible).toBe(true);
    expect(absorbs(p, 100).share).toBeCloseTo(100 / 32784, 6);
    expect(absorbs(p, 10_000).plausible).toBe(false);
    const noVolume = sellOf(quote(9, [100, min(1)], [95, min(1)], null), NOW)!;
    expect(absorbs(noVolume, 5)).toEqual({ share: null, plausible: null });
    expect(absorbs(sellOf(blackScimitar, NOW)!, 3).plausible).toBe(false);
  });
});

describe('the price view', () => {
  const board = (status: QuoteBoard['status'], quotes: Quote[]): QuoteBoard => ({ at: NOW - 60_000, hourAt: NOW - 60_000, quotes: new Map(quotes.map((q) => [q.id, q])), status });
  const mapping = new Map([[532, { name: 'Big bones', limit: 3000 }], [1327, { name: 'Black scimitar', limit: 70 }]]);
  const baked = new Map([['salmon', { buy: 30, sell: 28 }], ['big bones', { buy: 300, sell: 290 }]]);

  it('prices by name from the board', () => {
    const v = buildPriceView({ board: board('live', [bigBones]), mapping, baked, now: NOW });
    expect(v.status).toBe('live');
    expect(v.buy('Big bones')!.price).toBe(334);
    expect(v.idOf('big BONES')).toBe(532);
    expect(v.sell('Nothing named this')).toBeNull();
  });
  it('a known item ID can use its real quote even when the name mapping is unavailable', () => {
    const v = buildPriceView({ board: board('live', [bigBones]), mapping: null, baked, now: NOW });
    expect(v.status).toBe('live');
    expect(v.buy('Different display label', 532)).toMatchObject({ price: 334, basis: 'side' });
    expect(v.buy('Big bones')).toMatchObject({ basis: 'baked' });
    expect(v.idOf('Big bones')).toBeUndefined();
  });

  it('a name the board does not know falls back to the guide database, marked LOW', () => {
    const v = buildPriceView({ board: board('live', [bigBones]), mapping, baked, now: NOW });
    expect(v.buy('Salmon')).toMatchObject({ price: 30, basis: 'baked', confidence: 'LOW' });
  });

  it('an offline board is baked prices only, and says so', () => {
    const v = buildPriceView({ board: { at: 0, hourAt: null, quotes: new Map(), status: 'offline', error: 'x' }, mapping: null, baked, now: NOW });
    expect(v.status).toBe('baked');
    expect(v.at).toBeNull();
    expect(v.sell('Big bones')).toMatchObject({ price: 290, confidence: 'LOW', basis: 'baked' });
  });

  it('a stale board is capped at LOW even for a deep market', () => {
    const v = buildPriceView({ board: board('stale', [bigBones]), mapping, baked, now: NOW });
    expect(v.status).toBe('stale');
    expect(v.buy('Big bones')!.confidence).toBe('LOW');
    expect(v.buy('Big bones')!.notes[0]).toMatch(/did not answer/);
  });

  it('one name for several items picks the tradeable one with the larger limit', () => {
    const m = new Map([[1, { name: 'Bones', limit: 0 }], [2, { name: 'Bones', limit: 25000 }]]);
    const v = buildPriceView({ board: board('live', [quote(2, [90, min(1)], [80, min(1)])]), mapping: m, baked, now: NOW });
    expect(v.idOf('Bones')).toBe(2);
  });
});
