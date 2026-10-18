// The exchange as it was on 2026-10-18 (tests/funding/fixtures/market-2026-10-18.json: real latest and hourly figures), turned into a PriceView through the
// production quote code. A test may override single items to say "the price moved".

import fixture from './fixtures/market-2026-10-18.json';
import type { Quote, QuoteBoard } from '../../src/services/pricesApi';
import { buildPriceView, type PriceView } from '../../src/lib/funding/quotes';

interface Row { id: number; limit: number | null; high: number | null; highTime: number | null; low: number | null; lowTime: number | null; avgHigh: number | null; avgLow: number | null; highVolume: number; lowVolume: number }
const rows = fixture.items as unknown as Record<string, Row>;

export const MARKET_NOW = Math.max(...Object.values(rows).map((r) => Math.max(r.highTime ?? 0, r.lowTime ?? 0))) * 1000 + 60_000;

export type Override = Partial<Pick<Row, 'high' | 'low' | 'avgHigh' | 'avgLow' | 'highVolume' | 'lowVolume' | 'limit'>> & { highAgeMin?: number; lowAgeMin?: number };

export function market(over: Record<string, Override> = {}, status: QuoteBoard['status'] = 'live', now = MARKET_NOW): PriceView {
  const quotes = new Map<number, Quote>();
  const mapping = new Map<number, { name: string; limit?: number }>();
  for (const [name, base] of Object.entries(rows)) {
    const r = { ...base, ...(over[name] ?? {}) };
    const o = over[name];
    mapping.set(r.id, { name, ...(r.limit ? { limit: r.limit } : {}) });
    quotes.set(r.id, {
      id: r.id,
      high: { price: r.high, at: o?.highAgeMin !== undefined ? now - o.highAgeMin * 60_000 : r.high === null ? null : (r.highTime ?? 0) * 1000 },
      low: { price: r.low, at: o?.lowAgeMin !== undefined ? now - o.lowAgeMin * 60_000 : r.low === null ? null : (r.lowTime ?? 0) * 1000 },
      hour: { avgHigh: r.avgHigh, avgLow: r.avgLow, highVolume: r.highVolume, lowVolume: r.lowVolume },
    });
  }
  const board: QuoteBoard = { at: now - 60_000, hourAt: now - 60_000, quotes, status };
  return buildPriceView({ board, mapping, baked: new Map(), now });
}
