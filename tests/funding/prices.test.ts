import { describe, expect, it, vi } from 'vitest';
import { BACKOFF_BASE_MS, createPriceService, HOUR_TTL_MS, PRICE_TTL_MS } from '../../src/services/pricesApi';

const V2 = 'https://prices.runescape.wiki/api/v2/osrs';
const V1 = 'https://prices.runescape.wiki/api/v1/osrs';
const NOW_S = 1_792_000_000;

const latest = {
  data: {
    '532': { high: 334, highTime: NOW_S, low: 325, lowTime: NOW_S - 20 },
    // The high side is three days old, the low side is fresh: the quote must not look fresh.
    '1': { high: 100, highTime: NOW_S - 3 * 86400, low: 90, lowTime: NOW_S },
    // Only the high side was ever seen.
    '2': { high: 500, highTime: NOW_S - 60, low: null, lowTime: null },
    // Only the low side.
    '3': { high: null, highTime: null, low: 40, lowTime: NOW_S - 30 },
    '4': { high: null, highTime: null, low: null, lowTime: null },
  },
};
const hour = {
  data: { '532': { avgHighPrice: 344.87, highPriceVolume: 19738, avgLowPrice: 331.74, lowPriceVolume: 13046 } },
  timestamp: NOW_S,
};

type Reply = { status: number; body?: unknown; retryAfter?: string };
/** A fetch that answers by address and counts the calls per address. */
function server(routes: Record<string, Reply | (() => Reply)>) {
  const calls: string[] = [];
  const fn = vi.fn(async (url: string) => {
    calls.push(url);
    const r = routes[url];
    const reply = typeof r === 'function' ? r() : r;
    if (!reply) return { ok: false, status: 404, json: async () => ({}) };
    return {
      ok: reply.status >= 200 && reply.status < 300, status: reply.status, json: async () => reply.body ?? {},
      headers: { get: (n: string) => (n.toLowerCase() === 'retry-after' ? reply.retryAfter ?? null : null) },
    };
  });
  return { fn, calls };
}

describe('GePrice stays compatible and stops lying about freshness', () => {
  it('keeps buyPrice / sellPrice and adds the side times', async () => {
    const s = server({ [`${V2}/latest`]: { status: 200, body: latest } });
    const svc = createPriceService(s.fn, () => NOW_S * 1000);
    const p = await svc.getGePrice(532);
    expect(p).toMatchObject({ buyPrice: 334, sellPrice: 325 });
    expect(p!.highAt).toBe(new Date(NOW_S * 1000).toISOString());
    expect(p!.lowAt).toBe(new Date((NOW_S - 20) * 1000).toISOString());
    expect(p!.substituted).toBeUndefined();
  });

  it('a fresh opposite side does not make a three-day-old price look fresh', async () => {
    const s = server({ [`${V2}/latest`]: { status: 200, body: latest } });
    const svc = createPriceService(s.fn, () => NOW_S * 1000);
    const p = await svc.getGePrice(1);
    expect(p!.updatedAt).toBe(new Date((NOW_S - 3 * 86400) * 1000).toISOString());
  });

  it('a missing side is marked as borrowed, with that side time null', async () => {
    const s = server({ [`${V2}/latest`]: { status: 200, body: latest } });
    const svc = createPriceService(s.fn, () => NOW_S * 1000);
    const high = await svc.getGePrice(2);
    expect(high).toMatchObject({ buyPrice: 500, sellPrice: 500, substituted: 'sell', lowAt: null });
    expect(high!.updatedAt).toBe(new Date((NOW_S - 60) * 1000).toISOString());
    const low = await svc.getGePrice(3);
    expect(low).toMatchObject({ buyPrice: 40, sellPrice: 40, substituted: 'buy', highAt: null });
    expect(await svc.getGePrice(4)).toBeNull();
  });
});

describe('quote board', () => {
  it('keeps both sides apart and never fills a missing side', async () => {
    const s = server({ [`${V2}/latest`]: { status: 200, body: latest } });
    const svc = createPriceService(s.fn, () => NOW_S * 1000);
    const board = await svc.getQuoteBoard();
    expect(board.status).toBe('live');
    expect(board.quotes.get(2)!.low).toEqual({ price: null, at: null });
    expect(board.quotes.get(2)!.high.price).toBe(500);
    expect(board.quotes.get(3)!.high).toEqual({ price: null, at: null });
    expect(board.quotes.has(4)).toBe(false);
    expect(board.quotes.get(532)!.hour).toBeNull();
  });

  it('asks for the hourly feed only when volumes are wanted, once, and caches it', async () => {
    let t = NOW_S * 1000;
    const s = server({ [`${V2}/latest`]: { status: 200, body: latest }, [`${V2}/1h`]: { status: 200, body: hour } });
    const svc = createPriceService(s.fn, () => t);
    await svc.getQuoteBoard();
    expect(s.calls).toEqual([`${V2}/latest`]);
    const board = await svc.getQuoteBoard({ volumes: true });
    expect(board.quotes.get(532)!.hour).toEqual({ avgHigh: 344.87, avgLow: 331.74, highVolume: 19738, lowVolume: 13046 });
    expect(board.hourAt).toBe(t);
    await svc.getQuoteBoard({ volumes: true });
    t += PRICE_TTL_MS - 1;
    await svc.getQuoteBoard({ volumes: true });
    expect(s.calls.filter((u) => u.endsWith('/1h'))).toHaveLength(1);
    t += HOUR_TTL_MS;
    await svc.getQuoteBoard({ volumes: true });
    expect(s.calls.filter((u) => u.endsWith('/1h'))).toHaveLength(2);
  });

  it('an item with no hourly row has zero volume, not a missing board', async () => {
    const s = server({ [`${V2}/latest`]: { status: 200, body: latest }, [`${V2}/1h`]: { status: 200, body: hour } });
    const svc = createPriceService(s.fn, () => NOW_S * 1000);
    const board = await svc.getQuoteBoard({ volumes: true });
    expect(board.quotes.get(1)!.hour).toEqual({ avgHigh: null, avgLow: null, highVolume: 0, lowVolume: 0 });
  });

  it('a failed hourly feed leaves the prices usable, volumes unknown', async () => {
    const s = server({ [`${V2}/latest`]: { status: 200, body: latest }, [`${V2}/1h`]: { status: 500 }, [`${V1}/1h`]: { status: 500 } });
    const svc = createPriceService(s.fn, () => NOW_S * 1000);
    const board = await svc.getQuoteBoard({ volumes: true });
    expect(board.status).toBe('live');
    expect(board.hourAt).toBeNull();
    expect(board.quotes.get(532)!.hour).toBeNull();
  });
});

describe('an outage is honest and does not become a request storm', () => {
  it('no data at all: the board is offline with the reason, and the next calls wait for the backoff', async () => {
    let t = 1_000_000;
    const s = server({ [`${V2}/latest`]: { status: 503 }, [`${V1}/latest`]: { status: 503 } });
    const svc = createPriceService(s.fn, () => t);
    const first = await svc.getQuoteBoard();
    expect(first.status).toBe('offline');
    expect(first.error).toMatch(/503/);
    expect(first.quotes.size).toBe(0);
    const afterFirst = s.calls.length;
    expect(afterFirst).toBe(2); // v2, then v1 once
    for (let i = 0; i < 50; i++) await svc.getQuoteBoard();
    await Promise.all(Array.from({ length: 20 }, () => svc.getQuoteBoard()));
    expect(s.calls.length).toBe(afterFirst);
    t += BACKOFF_BASE_MS + 1;
    await svc.getQuoteBoard();
    expect(s.calls.length).toBe(afterFirst + 2);
    // The second failure waits twice as long.
    t += BACKOFF_BASE_MS + 1;
    await svc.getQuoteBoard();
    expect(s.calls.length).toBe(afterFirst + 2);
    t += BACKOFF_BASE_MS;
    await svc.getQuoteBoard();
    expect(s.calls.length).toBe(afterFirst + 4);
  });

  it('a refresh that fails after a good fetch serves the old data, marked stale', async () => {
    let t = 5_000_000;
    let ok = true;
    const s = server({
      [`${V2}/latest`]: () => (ok ? { status: 200, body: latest } : { status: 503 }),
      [`${V1}/latest`]: () => (ok ? { status: 200, body: latest } : { status: 503 }),
    });
    const svc = createPriceService(s.fn, () => t);
    expect((await svc.getQuoteBoard()).status).toBe('live');
    ok = false;
    t += PRICE_TTL_MS + 1;
    const board = await svc.getQuoteBoard();
    expect(board.status).toBe('stale');
    expect(board.quotes.get(532)!.high.price).toBe(334);
    expect(board.at).toBe(5_000_000);
    expect(board.error).toMatch(/503/);
    // The old callers get the old prices (their updatedAt shows the age) rather than an exception.
    expect((await svc.getGePrice(532))!.buyPrice).toBe(334);
  });

  it('a rate limit honours Retry-After and does not ask the other address', async () => {
    let t = 9_000_000;
    const s = server({ [`${V2}/latest`]: { status: 429, retryAfter: '120' }, [`${V1}/latest`]: { status: 200, body: latest } });
    const svc = createPriceService(s.fn, () => t);
    expect((await svc.getQuoteBoard()).status).toBe('offline');
    expect(s.calls).toEqual([`${V2}/latest`]);
    t += 119_000;
    await svc.getQuoteBoard();
    expect(s.calls).toHaveLength(1);
    t += 2_000;
    await svc.getQuoteBoard();
    expect(s.calls.length).toBeGreaterThan(1);
  });

  it('falls back to the older address once when the new one fails', async () => {
    const s = server({ [`${V2}/latest`]: { status: 500 }, [`${V1}/latest`]: { status: 200, body: latest } });
    const svc = createPriceService(s.fn, () => NOW_S * 1000);
    const board = await svc.getQuoteBoard();
    expect(board.status).toBe('live');
    expect(s.calls).toEqual([`${V2}/latest`, `${V1}/latest`]);
  });

  it('a garbled answer is a failure, not an empty market', async () => {
    const s = server({ [`${V2}/latest`]: { status: 200, body: { nope: true } }, [`${V1}/latest`]: { status: 200, body: { nope: true } } });
    const svc = createPriceService(s.fn, () => NOW_S * 1000);
    const board = await svc.getQuoteBoard();
    expect(board.status).toBe('offline');
    expect(board.error).toMatch(/unreadable/);
  });

  it('simultaneous board requests share one fetch', async () => {
    const s = server({ [`${V2}/latest`]: { status: 200, body: latest }, [`${V2}/1h`]: { status: 200, body: hour } });
    const svc = createPriceService(s.fn, () => NOW_S * 1000);
    await Promise.all([svc.getQuoteBoard({ volumes: true }), svc.getQuoteBoard({ volumes: true }), svc.getGePrice(532), svc.getAllPrices()]);
    expect(s.calls.filter((u) => u.endsWith('/latest'))).toHaveLength(1);
    expect(s.calls.filter((u) => u.endsWith('/1h'))).toHaveLength(1);
  });
});
