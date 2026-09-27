// Цены Grand Exchange с OSRS Wiki Prices API. Один запрос отдаёт цены всех предметов,
// поэтому держим их в памяти (Map) и обновляем не чаще раза в 5 минут.

const LATEST_URL = 'https://prices.runescape.wiki/api/v1/osrs/latest';
const MAPPING_URL = 'https://prices.runescape.wiki/api/v1/osrs/mapping';
export const PRICE_TTL_MS = 5 * 60 * 1000;

export interface GePrice {
  /** Цена мгновенной покупки (high). */
  buyPrice: number;
  /** Цена мгновенной продажи (low). */
  sellPrice: number;
  updatedAt: string;
}

interface LatestRow { high: number | null; highTime: number | null; low: number | null; lowTime: number | null }

type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface PriceService {
  getGePrice(itemId: number): Promise<GePrice | null>;
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
        if (!res.ok) throw new Error(`Цены недоступны (${res.status})`);
        const body = (await res.json()) as { data: Record<string, LatestRow> };
        const rows = new Map(Object.entries(body.data).map(([id, row]) => [Number(id), row]));
        latest = { at: now(), rows };
        return rows;
      })().finally(() => { inflight = null; });
    }
    return inflight;
  }

  return {
    async getGePrice(itemId) {
      const row = (await loadLatest()).get(itemId);
      if (!row || (row.high == null && row.low == null)) return null;
      const time = Math.max(row.highTime ?? 0, row.lowTime ?? 0);
      return {
        buyPrice: row.high ?? row.low!,
        sellPrice: row.low ?? row.high!,
        updatedAt: new Date(time * 1000).toISOString(),
      };
    },
    getMapping() {
      if (!mapping) {
        mapping = (async () => {
          const res = await fetchFn(MAPPING_URL);
          if (!res.ok) throw new Error(`Справочник предметов недоступен (${res.status})`);
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

// Без предела зависшее соединение держало бы общий запрос цен вечно — и вместе с ним каждое досье, которое ждёт
// цену. Файл цен большой (~1,5 МБ), поэтому запас щедрый.
const PRICES_TIMEOUT_MS = 20_000;
const prices = createPriceService((url) => fetch(url, { signal: AbortSignal.timeout(PRICES_TIMEOUT_MS) }));

/** Актуальная цена предмета на Grand Exchange или null, если предмет не торгуется. */
export function getGePrice(itemId: number): Promise<GePrice | null> {
  return prices.getGePrice(itemId);
}

export function getMapping(): Promise<Map<number, MappingRow>> {
  return prices.getMapping();
}
