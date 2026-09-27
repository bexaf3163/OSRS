// Координаты места по его названию — для «📍» в инспекторе предметов, карты мира и стрелки в RuneLite.
//
// Порядок:
// 0. Строка «где лежит бесплатно»: точка спавна из {{ItemSpawnLine}} на странице предмета — это клетка,
//    а не центр города. Без сети — дальше по списку.
// 1. Словарь src/data/majorLocations.json (собран с карт статей OSRS Wiki): точное название, синоним,
//    название без регистра и служебных слов.
// 2. OSRS Wiki: карта {{Map}} в статье магазина, NPC или места. Cargo API у вики нет
//    (action=cargoquery отвечает «Unrecognized value») — поэтому разбирается разметка статьи,
//    та же, из которой собран словарь.
// 3. Словарь «примерно»: место, упомянутое в строке («Varrock - east of the Grand Exchange» → Grand Exchange),
//    или похожее написание. Идёт после вики: точка спавна с вики точнее центра города.
// 4. Ничего не нашлось — поиск на OSRS Wiki (статья места с её картой).
//
// Ответы вики кешируются (в памяти и в localStorage на неделю): одно место не запрашивается дважды,
// а найденное раньше работает и без интернета.

import majorLocations from '../data/majorLocations.json';
import { articleMapPoint, cleanWikiText, fetchWikitext, spawnPoint, WIKI_ORIGIN, type FetchFn, type WikiPoint } from './wikiApi';

export type LocationSource = 'dictionary' | 'wiki' | 'search-fallback';

export interface ResolvedPoint extends WikiPoint {
  label: string;
  source: 'dictionary' | 'wiki';
  /** Как нашлось: точное имя, синоним, без регистра, по упоминанию, похожее написание, спавн, статья. */
  match: 'exact' | 'alias' | 'normalized' | 'substring' | 'fuzzy' | 'spawn' | 'article';
  /** Статья вики, с карты которой взята точка. */
  page?: string;
}

export interface SearchFallback {
  source: 'search-fallback';
  label: string;
  searchUrl: string;
}

export type ResolvedLocation = ResolvedPoint | SearchFallback;

/** Что ещё известно о месте: магазин и продавец из таблицы магазинов, страница предмета для спавна. */
export interface ResolveContext {
  shopName?: string;
  itemPage?: string;
  itemName?: string;
}

interface DictEntry extends WikiPoint {
  label: string;
  kind: string;
  aliases?: string[];
  page: string;
}

const DICT = (majorLocations as { locations: Record<string, DictEntry> }).locations;

/** Служебные слова строк мест: «shop», «by», «south of»… Значимые слова названий не трогаются. */
const STOP = /\b(?:shop|store|by|near|the|of|in|at|north|south|east|west|north-east|north-west|south-east|south-west|outside|inside|upstairs|downstairs|behind)\b/g;

/** Название без регистра, пометок этажа и подписки, пунктуации и служебных слов. */
export function normalizeName(s: string): string {
  return cleanWikiText(s)
    .toLowerCase()
    .replace(/\((?:только для подписки|[^)]*этаж[^)]*)\)/g, ' ')
    .replace(/\b(?:ground|\d+(?:st|nd|rd|th)) floor\b/g, ' ')
    .replace(/[’`]/g, "'")
    .replace(/[.,:;!?()"-]/g, ' ')
    .replace(/'s\b/g, '')
    .replace(/'/g, '')
    .replace(STOP, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface IndexKey {
  key: string;
  norm: string;
  entry: DictEntry;
  alias: boolean;
}

const INDEX: IndexKey[] = Object.entries(DICT).flatMap(([name, entry]) => [
  { key: name, norm: normalizeName(name), entry, alias: false },
  ...(entry.aliases ?? []).map((a) => ({ key: a, norm: normalizeName(a), entry, alias: true })),
]).filter((k) => k.norm.length > 0);

function point(entry: DictEntry, match: ResolvedPoint['match']): ResolvedPoint {
  return { x: entry.x, y: entry.y, plane: entry.plane, label: entry.label, source: 'dictionary', match, page: entry.page };
}

/** Точное совпадение: имя, синоним, затем без регистра и служебных слов. */
export function matchStrict(text: string): ResolvedPoint | null {
  const raw = text.trim();
  if (!raw) return null;
  const exact = INDEX.find((k) => k.key === raw);
  if (exact) return point(exact.entry, exact.alias ? 'alias' : 'exact');
  const lower = raw.toLowerCase();
  const ci = INDEX.find((k) => k.key.toLowerCase() === lower);
  if (ci) return point(ci.entry, ci.alias ? 'alias' : 'exact');
  const norm = normalizeName(raw);
  const n = norm ? INDEX.find((k) => k.norm === norm) : undefined;
  return n ? point(n.entry, 'normalized') : null;
}

/** Расстояние Левенштейна — для опечаток и разного написания («Draynor Vilage»). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

/**
 * Примерное совпадение: самое длинное известное место, упомянутое в строке целыми словами,
 * иначе похожее написание (не больше одной ошибки на пять букв).
 */
export function matchLoose(text: string): ResolvedPoint | null {
  const norm = normalizeName(text);
  if (!norm) return null;
  const padded = ` ${norm} `;
  const contained = INDEX.filter((k) => k.norm.length >= 3 && padded.includes(` ${k.norm} `))
    .sort((a, b) => b.norm.length - a.norm.length);
  if (contained.length) return point(contained[0].entry, 'substring');
  let best: { k: IndexKey; d: number } | null = null;
  for (const k of INDEX) {
    const d = levenshtein(norm, k.norm);
    if (d <= Math.max(1, Math.floor(k.norm.length / 5)) && (!best || d < best.d)) best = { k, d };
  }
  return best ? point(best.k.entry, 'fuzzy') : null;
}

export function searchUrl(query: string): string {
  return `${WIKI_ORIGIN}/w/Special:Search?search=${encodeURIComponent(query)}`;
}

// ---------- Вики с кешем ----------

const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FAIL_TTL_MS = 60 * 1000;
const TEXT_TTL_MS = 10 * 60 * 1000;
const STORAGE_KEY = 'osrs-put:location-cache';
const TIMEOUT_MS = 8000;

export interface Cached {
  at: number;
  value: WikiPoint | null;
  failed?: boolean;
}

export interface WikiLocator {
  /** Точка статьи ({{Map}}); null — статьи или карты нет. */
  article(page: string): Promise<WikiPoint | null>;
  /** Точка спавна предмета на его странице. */
  spawn(itemPage: string, itemName: string, location: string): Promise<WikiPoint | null>;
  clear(): void;
}

/** Больше стольких мест кеш не держит: старые вытесняются, localStorage не растёт без конца. */
const MAX_ENTRIES = 300;

function loadStore(now: number): Record<string, Cached> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? (JSON.parse(raw) as Record<string, Cached>) : {};
    if (!data || typeof data !== 'object') return {};
    // Устаревшие и ошибки прошлых запусков не нужны: ошибки не пишутся, а устаревшее всё равно спросим заново.
    for (const [k, v] of Object.entries(data)) if (!v || v.failed || typeof v.at !== 'number' || now - v.at >= TTL_MS) delete data[k];
    return data;
  } catch {
    return {};
  }
}

export function pruneStore(data: Record<string, Cached>, max = MAX_ENTRIES): Record<string, Cached> {
  const ok = Object.entries(data).filter(([, v]) => !v.failed);
  if (ok.length <= max) return Object.fromEntries(ok);
  return Object.fromEntries(ok.sort((a, b) => b[1].at - a[1].at).slice(0, max));
}

function saveStore(data: Record<string, Cached>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pruneStore(data)));
  } catch {
    // Хранилище недоступно — кеш только в памяти.
  }
}

const validPoint = (p: unknown): p is WikiPoint => {
  const q = p as WikiPoint | null;
  return !!q && Number.isInteger(q.x) && Number.isInteger(q.y) && Number.isInteger(q.plane) && q.x > 0 && q.y > 0 && q.plane >= 0 && q.plane <= 3;
};

/**
 * Запросы к вики за координатами: один запрос на статью, ответы — в памяти и localStorage.
 * Ошибка сети запоминается на минуту — повторный клик не долбит вики, но и не блокирует надолго.
 */
export function createWikiLocator(fetchFn: FetchFn, now: () => number = Date.now, persistent = true): WikiLocator {
  const store: Record<string, Cached> = persistent ? loadStore(now()) : {};
  // Разметка статьи держится несколько минут: у предмета спавны в разных местах — страница одна.
  const texts = new Map<string, { at: number; p: Promise<{ title: string; text: string } | null> }>();
  const inflight = new Map<string, Promise<WikiPoint | null>>();

  const text = (page: string) => {
    const hit = texts.get(page);
    if (hit && now() - hit.at < TEXT_TTL_MS) return hit.p;
    const p = fetchWikitext(fetchFn, page);
    texts.set(page, { at: now(), p });
    p.catch(() => texts.delete(page));
    return p;
  };

  async function cached(key: string, load: () => Promise<WikiPoint | null>): Promise<WikiPoint | null> {
    const hit = store[key];
    if (hit && now() - hit.at < (hit.failed ? FAIL_TTL_MS : TTL_MS)) {
      if (hit.failed) throw new Error('OSRS Wiki недавно не ответила');
      return validPoint(hit.value) ? hit.value : null;
    }
    let p = inflight.get(key);
    if (!p) {
      p = load()
        .then((value) => {
          store[key] = { at: now(), value: validPoint(value) ? value : null };
          if (persistent) saveStore(store);
          return store[key].value;
        })
        .catch((e: unknown) => {
          store[key] = { at: now(), value: null, failed: true };
          throw e;
        })
        .finally(() => inflight.delete(key));
      inflight.set(key, p);
    }
    return p;
  }

  return {
    article: (page) => cached(`a:${page}`, async () => {
      const t = await text(page);
      return t ? articleMapPoint(t.text) : null;
    }),
    spawn: (itemPage, itemName, location) => cached(`s:${itemPage}|${itemName}|${location}`, async () => {
      const t = await text(itemPage);
      return t ? spawnPoint(t.text, itemName, location) : null;
    }),
    clear() {
      for (const k of Object.keys(store)) delete store[k];
      texts.clear();
      if (persistent) saveStore(store);
    },
  };
}

/** Строка спавна в досье помечена «(только для подписки)» — на вики этой пометки нет. */
const withoutMembersMark = (s: string) => cleanWikiText(s).replace(/\s*\(только для подписки\)$/, '');

const defaultFetch: FetchFn =(url) => fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
let defaultLocator: WikiLocator | null = null;
const locator = () => (defaultLocator ??= createWikiLocator(defaultFetch));

/**
 * Координаты места. locationName — строка из данных («Lumbridge - outside Fred the Farmer's house», «Port Sarim»),
 * npcName — продавец или NPC. Никогда не бросает: без точки — поиск на вики.
 */
export async function resolveLocationCoordinates(
  locationName: string,
  npcName?: string,
  ctx: ResolveContext = {},
  wiki: WikiLocator = locator(),
): Promise<ResolvedLocation> {
  const label = cleanWikiText(ctx.shopName || npcName || locationName) || locationName;
  // 0. Спавн предмета: клетка, где он лежит, точнее любой точки словаря («Port Sarim» — это весь город).
  //    Нет сети — сразу словарь; ответ кешируется, второй клик не ждёт вики.
  if (ctx.itemPage && ctx.itemName) {
    const spot = withoutMembersMark(locationName);
    try {
      const p = await wiki.spawn(ctx.itemPage, ctx.itemName, spot);
      if (p) return { ...p, label: spot, source: 'wiki', match: 'spawn', page: ctx.itemPage };
    } catch {
      // Вики не ответила — словарь.
    }
  }
  // 1. Словарь, точно: магазин и продавец точнее города.
  for (const name of [ctx.shopName, npcName, locationName]) {
    const hit = name ? matchStrict(name) : null;
    if (hit) return hit;
  }
  // 2. Вики: статьи магазина, NPC, места.
  const tries: (() => Promise<ResolvedPoint | null>)[] = [];
  for (const page of [ctx.shopName, npcName, locationName]) {
    const clean = page ? withoutMembersMark(page) : '';
    if (!clean || clean.length > 80) continue;
    tries.push(async () => {
      const p = await wiki.article(clean);
      return p ? { ...p, label: clean, source: 'wiki', match: 'article', page: clean } : null;
    });
  }
  for (const t of tries) {
    try {
      const hit = await t();
      if (hit) return hit;
    } catch {
      // Вики не ответила — дальше словарь «примерно» и поиск.
    }
  }
  // 3. Словарь примерно.
  for (const name of [ctx.shopName, npcName, locationName]) {
    const hit = name ? matchLoose(name) : null;
    if (hit) return hit;
  }
  // 4. Поиск на вики.
  return { source: 'search-fallback', label, searchUrl: searchUrl(cleanWikiText(npcName || ctx.shopName || locationName) || locationName) };
}

export function isPoint(r: ResolvedLocation): r is ResolvedPoint {
  return r.source !== 'search-fallback';
}
