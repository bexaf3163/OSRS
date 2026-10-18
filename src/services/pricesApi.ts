// Grand Exchange prices from the OSRS Wiki Prices API (https://oldschool.runescape.wiki/w/RuneScape:Real-time_Prices). One request gives the prices of all
// items, so we keep them in memory (a Map) and refresh no more often than once in 5 minutes. The hourly feed (averages and the number traded) is a second
// bulk request made only for callers that ask for volumes. A failure never turns into a request storm: the next try waits (exponential backoff, or the
// server's Retry-After), and what we had stays available, marked stale.
//
// The two sides of a quote are kept apart. `high` is the price instant buyers paid last, `low` what instant sellers got; each has its own time. A side the
// exchange has not seen is missing (null), never filled from the other side silently: GePrice still offers a number for old callers, but says which side was
// borrowed, and its `updatedAt` is the time of the OLDER side that exists, so a fresh opposite side cannot make an old price look fresh.

const BASES = ['https://prices.runescape.wiki/api/v2/osrs', 'https://prices.runescape.wiki/api/v1/osrs'] as const;
export const PRICE_TTL_MS = 5 * 60 * 1000;
/** The hourly averages change slowly; a longer cache keeps the extra request rare. */
export const HOUR_TTL_MS = 10 * 60 * 1000;
export const BACKOFF_BASE_MS = 30_000;
export const BACKOFF_MAX_MS = 5 * 60 * 1000;

export interface GePrice {
  /** The instant buy price (high). If that side is missing, the low side stands in and `substituted` says so. */
  buyPrice: number;
  /** The instant sell price (low). If that side is missing, the high side stands in and `substituted` says so. */
  sellPrice: number;
  /** The time of the older of the sides the exchange really has (ISO). */
  updatedAt: string;
  /** When each side was last seen (ISO); null — the exchange has never seen that side. */
  highAt?: string | null;
  lowAt?: string | null;
  /** Which of buyPrice / sellPrice is borrowed from the other side. */
  substituted?: 'buy' | 'sell';
}

export interface LatestRow { high: number | null; highTime: number | null; low: number | null; lowTime: number | null }
export interface HourRow { avgHighPrice: number | null; highPriceVolume: number | null; avgLowPrice: number | null; lowPriceVolume: number | null }

/** One side of a quote: the price and when it was seen (ms). */
export interface SideQuote { price: number | null; at: number | null }

export interface Quote {
  id: number;
  high: SideQuote;
  low: SideQuote;
  /** The last full hour's averages and the number traded on each side; null — the hourly feed was not asked for or not available. */
  hour: { avgHigh: number | null; avgLow: number | null; highVolume: number; lowVolume: number } | null;
}

export interface QuoteBoard {
  /** When the latest-prices feed was fetched (ms); 0 when nothing was ever fetched. */
  at: number;
  /** When the hourly feed was fetched (ms); null — not available. */
  hourAt: number | null;
  quotes: Map<number, Quote>;
  /** live — fresh; stale — the refresh failed and the earlier data is served; offline — no data at all. */
  status: 'live' | 'stale' | 'offline';
  error?: string;
}

type FetchResult = { ok: boolean; status: number; json(): Promise<unknown>; headers?: { get(name: string): string | null } };
type Fetcher = (url: string) => Promise<FetchResult>;

export interface PriceService {
  getGePrice(itemId: number): Promise<GePrice | null>;
  /** All prices at once (one request, shared with getGePrice) and the time they were fetched — for the resource journal. */
  getAllPrices(): Promise<{ at: number; prices: Map<number, GePrice> }>;
  getMapping(): Promise<Map<number, MappingRow>>;
  /** Both sides with their own times, optionally with the hourly volumes. Never throws: an outage is reported in `status`. */
  getQuoteBoard(opts?: { volumes?: boolean }): Promise<QuoteBoard>;
  clear(): void;
}

export interface MappingRow { id: number; name: string; examine?: string; members?: boolean; value?: number; limit?: number; highalch?: number; lowalch?: number; icon?: string }

class RateLimited extends Error {
  constructor(readonly retryAfterMs: number | null) { super('Prices unavailable (429)'); }
}

function retryAfterMs(res: FetchResult): number | null {
  const raw = res.headers?.get('retry-after');
  const s = raw ? Number(raw) : NaN;
  return Number.isFinite(s) && s > 0 ? Math.min(s * 1000, BACKOFF_MAX_MS) : null;
}

interface FeedResult<T> { data: T; at: number; stale: boolean; error?: string }

export function createPriceService(fetchFn: Fetcher, now: () => number = Date.now): PriceService {
  /** A bulk feed with its own cache, shared in-flight request and backoff. */
  function feed<T>(path: string, parse: (body: unknown) => T, ttl: number) {
    let cache: { at: number; data: T } | null = null;
    let inflight: Promise<void> | null = null;
    let failures = 0;
    let retryAt = 0;
    let lastError = '';

    async function fetchOnce(): Promise<T> {
      let last: unknown = new Error('Prices unavailable');
      for (const base of BASES) {
        try {
          const res = await fetchFn(base + path);
          // Rate limited: asking the other address would only add to the load.
          if (res.status === 429) throw new RateLimited(retryAfterMs(res));
          if (!res.ok) { last = new Error(`Prices unavailable (${res.status})`); continue; }
          return parse(await res.json());
        } catch (e) {
          if (e instanceof RateLimited) throw e;
          last = e;
        }
      }
      throw last;
    }

    function refresh(): Promise<void> {
      if (!inflight) {
        inflight = (async () => {
          try {
            const data = await fetchOnce();
            cache = { at: now(), data };
            failures = 0; retryAt = 0; lastError = '';
          } catch (e) {
            failures += 1;
            const wait = e instanceof RateLimited && e.retryAfterMs !== null ? e.retryAfterMs : Math.min(BACKOFF_BASE_MS * 2 ** (failures - 1), BACKOFF_MAX_MS);
            retryAt = now() + wait;
            lastError = e instanceof Error ? e.message : 'Prices unavailable';
          }
        })().finally(() => { inflight = null; });
      }
      return inflight;
    }

    return {
      async get(): Promise<FeedResult<T>> {
        if (cache && now() - cache.at < ttl) return { data: cache.data, at: cache.at, stale: false };
        if (now() >= retryAt) await refresh();
        if (cache && now() - cache.at < ttl) return { data: cache.data, at: cache.at, stale: false };
        if (cache) return { data: cache.data, at: cache.at, stale: true, error: lastError };
        throw new Error(lastError || 'Prices unavailable');
      },
      clear() { cache = null; failures = 0; retryAt = 0; lastError = ''; },
    };
  }

  const latestFeed = feed<Map<number, LatestRow>>('/latest', (body) => {
    const data = (body as { data?: Record<string, LatestRow> } | null)?.data;
    if (!data || typeof data !== 'object') throw new Error('Prices unavailable (unreadable answer)');
    return new Map(Object.entries(data).map(([id, row]) => [Number(id), row]));
  }, PRICE_TTL_MS);

  const hourFeed = feed<Map<number, HourRow>>('/1h', (body) => {
    const data = (body as { data?: Record<string, HourRow> } | null)?.data;
    if (!data || typeof data !== 'object') throw new Error('Prices unavailable (unreadable answer)');
    return new Map(Object.entries(data).map(([id, row]) => [Number(id), row]));
  }, HOUR_TTL_MS);

  let mapping: Promise<Map<number, MappingRow>> | null = null;

  const iso = (sec: number | null) => (sec ? new Date(sec * 1000).toISOString() : null);

  const toPrice = (row: LatestRow | undefined): GePrice | null => {
    if (!row || (row.high == null && row.low == null)) return null;
    const highAt = row.high == null ? null : iso(row.highTime ?? 0) ?? new Date(0).toISOString();
    const lowAt = row.low == null ? null : iso(row.lowTime ?? 0) ?? new Date(0).toISOString();
    // The older of the sides that exist: a fresh opposite side must not make an old price look fresh.
    const times = [highAt, lowAt].filter((t): t is string => t !== null).map((t) => Date.parse(t));
    return {
      buyPrice: row.high ?? row.low!,
      sellPrice: row.low ?? row.high!,
      updatedAt: new Date(Math.min(...times)).toISOString(),
      highAt, lowAt,
      ...(row.high == null ? { substituted: 'buy' as const } : row.low == null ? { substituted: 'sell' as const } : {}),
    };
  };

  return {
    async getGePrice(itemId) {
      return toPrice((await latestFeed.get()).data.get(itemId));
    },
    async getAllPrices() {
      const f = await latestFeed.get();
      const prices = new Map<number, GePrice>();
      for (const [id, row] of f.data) {
        const p = toPrice(row);
        if (p) prices.set(id, p);
      }
      return { at: f.at, prices };
    },
    async getQuoteBoard(opts) {
      let latest: FeedResult<Map<number, LatestRow>>;
      try {
        latest = await latestFeed.get();
      } catch (e) {
        return { at: 0, hourAt: null, quotes: new Map(), status: 'offline', error: e instanceof Error ? e.message : 'Prices unavailable' };
      }
      let hour: FeedResult<Map<number, HourRow>> | null = null;
      if (opts?.volumes) {
        try { hour = await hourFeed.get(); } catch { hour = null; }
      }
      const quotes = new Map<number, Quote>();
      for (const [id, row] of latest.data) {
        if (row.high == null && row.low == null) continue;
        const h = hour?.data.get(id);
        quotes.set(id, {
          id,
          high: { price: row.high ?? null, at: row.high == null ? null : (row.highTime ?? 0) * 1000 },
          low: { price: row.low ?? null, at: row.low == null ? null : (row.lowTime ?? 0) * 1000 },
          hour: hour ? {
            avgHigh: h?.avgHighPrice ?? null, avgLow: h?.avgLowPrice ?? null,
            highVolume: h?.highPriceVolume ?? 0, lowVolume: h?.lowPriceVolume ?? 0,
          } : null,
        });
      }
      return {
        at: latest.at, hourAt: hour ? hour.at : null, quotes,
        status: latest.stale ? 'stale' : 'live', ...(latest.error ? { error: latest.error } : {}),
      };
    },
    getMapping() {
      if (!mapping) {
        mapping = (async () => {
          let last: unknown = new Error('The item reference is unavailable');
          for (const base of BASES) {
            try {
              const res = await fetchFn(`${base}/mapping`);
              if (res.status === 429) throw new RateLimited(retryAfterMs(res));
              if (!res.ok) { last = new Error(`The item reference is unavailable (${res.status})`); continue; }
              return new Map(((await res.json()) as MappingRow[]).map((m) => [m.id, m]));
            } catch (e) {
              last = e;
              if (e instanceof RateLimited) break;
            }
          }
          throw last;
        })();
        mapping.catch(() => { mapping = null; });
      }
      return mapping;
    },
    clear() {
      latestFeed.clear();
      hourFeed.clear();
      mapping = null;
    },
  };
}

// Without a limit a hung connection would hold the shared price request forever — and with it every dossier waiting for
// the price. The price file is big (~1.5 MB), so the margin is generous.
const PRICES_TIMEOUT_MS = 20_000;
const prices = createPriceService((url) => fetch(url, { signal: AbortSignal.timeout(PRICES_TIMEOUT_MS) }));

/** The current Grand Exchange price of an item or null if the item is not traded. */
export function getGePrice(itemId: number): Promise<GePrice | null> {
  return prices.getGePrice(itemId);
}

export function getMapping(): Promise<Map<number, MappingRow>> {
  return prices.getMapping();
}

export function getAllPrices(): Promise<{ at: number; prices: Map<number, GePrice> }> {
  return prices.getAllPrices();
}

/** Both sides of every quote with their own times (and the hourly volumes when asked); an outage is a status, not an exception. */
export function getQuoteBoard(opts?: { volumes?: boolean }): Promise<QuoteBoard> {
  return prices.getQuoteBoard(opts);
}
