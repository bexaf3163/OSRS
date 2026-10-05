// Grand Exchange prices from the OSRS Wiki Prices API. One request gives the prices of all items,
// so we keep them in memory (a Map) and refresh no more often than once in 5 minutes.

const LATEST_URL = 'https://prices.runescape.wiki/api/v1/osrs/latest';
const MAPPING_URL = 'https://prices.runescape.wiki/api/v1/osrs/mapping';
export const PRICE_TTL_MS = 5 * 60 * 1000;

export interface GePrice {
  /** The instant buy price (high). */
  buyPrice: number;
  /** The instant sell price (low). */
  sellPrice: number;
  updatedAt: string;
}

interface LatestRow { high: number | null; highTime: number | null; low: number | null; lowTime: number | null }

type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface PriceService {
  getGePrice(itemId: number): Promise<GePrice | null>;
  /** All prices at once (one request, shared with getGePrice) and the time they were fetched — for the resource journal. */
  getAllPrices(): Promise<{ at: number; prices: Map<number, GePrice> }>;
  getMapping(): Promise<Map<number, MappingRow>>;
  clear(): void;
}

export interface MappingRow { id: number; name: string; examine?: string; members?: boolean; value?: number; highalch?: number; lowalch?: number; icon?: string }

export function createPriceService(fetchFn: Fetcher, now: () => number = Date.now): PriceService {
  let latest: { at: number; rows: Map<number, LatestRow> } | null = null;
  let inflight: Promise<Map<number, LatestRow>> | null = null;
  let mapping: Promise<Map<number, MappingRow>> | null = null;

  async function loadLatest(): Promise<Map<number, LatestRow>> {
    if (latest && now() - latest.at < PRICE_TTL_MS) return latest.rows;
    if (!inflight) {
      inflight = (async () => {
        const res = await fetchFn(LATEST_URL);
        if (!res.ok) throw new Error(`Prices unavailable (${res.status})`);
        const body = (await res.json()) as { data: Record<string, LatestRow> };
        const rows = new Map(Object.entries(body.data).map(([id, row]) => [Number(id), row]));
        latest = { at: now(), rows };
        return rows;
      })().finally(() => { inflight = null; });
    }
    return inflight;
  }

  const toPrice = (row: LatestRow | undefined): GePrice | null => {
    if (!row || (row.high == null && row.low == null)) return null;
    const time = Math.max(row.highTime ?? 0, row.lowTime ?? 0);
    return {
      buyPrice: row.high ?? row.low!,
      sellPrice: row.low ?? row.high!,
      updatedAt: new Date(time * 1000).toISOString(),
    };
  };

  return {
    async getGePrice(itemId) {
      return toPrice((await loadLatest()).get(itemId));
    },
    async getAllPrices() {
      const rows = await loadLatest();
      const prices = new Map<number, GePrice>();
      for (const [id, row] of rows) {
        const p = toPrice(row);
        if (p) prices.set(id, p);
      }
      return { at: latest?.at ?? now(), prices };
    },
    getMapping() {
      if (!mapping) {
        mapping = (async () => {
          const res = await fetchFn(MAPPING_URL);
          if (!res.ok) throw new Error(`The item reference is unavailable (${res.status})`);
          return new Map(((await res.json()) as MappingRow[]).map((m) => [m.id, m]));
        })();
        mapping.catch(() => { mapping = null; });
      }
      return mapping;
    },
    clear() {
      latest = null;
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
