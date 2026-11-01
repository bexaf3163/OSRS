// The coordinates of a place by its name — for the "📍" in the item inspector, the world map and the RuneLite arrow.
//
// The order:
// 0. The "where it lies for free" line: the spawn point from {{ItemSpawnLine}} on the item page — this is a tile,
//    not the centre of a town. Without a network — on down the list.
// 1. The dictionary src/data/majorLocations.json (collected from OSRS Wiki article maps): the exact name, a synonym,
//    the name without case and service words.
// 2. OSRS Wiki: the {{Map}} map in the article of a shop, NPC or place. The wiki has no Cargo API
//    (action=cargoquery answers "Unrecognized value") — so the article markup is parsed,
//    the same one the dictionary was built from.
// 3. The "approximate" dictionary: a place mentioned in the line ("Varrock - east of the Grand Exchange" → Grand Exchange),
//    or a similar spelling. It goes after the wiki: a wiki spawn point is more exact than a town centre.
// 4. Nothing found — a search on the OSRS Wiki (the place article with its map).
//
// Wiki answers are cached (in memory and in localStorage for a week): one place is not requested twice,
// and what was found before works without the internet too.

import { cleanWikiText } from '../domain/text/md';
import { pageFromUrl, type PlaceQuery } from '../domain/travel/places';
import { matchLoose, matchStrict, type ResolveContext, type ResolvedLocation, type ResolvedPoint } from '../domain/travel/locations';
import { articleMapPoint, fetchWikitext, spawnPoint, WIKI_ORIGIN, type FetchFn, type WikiPoint } from './wikiApi';

export function searchUrl(query: string): string {
  return `${WIKI_ORIGIN}/w/Special:Search?search=${encodeURIComponent(query)}`;
}

// ---------- The wiki with a cache ----------

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
  /** An article point ({{Map}}); null — there is no article or map. */
  article(page: string): Promise<WikiPoint | null>;
  /** An item spawn point on its page. */
  spawn(itemPage: string, itemName: string, location: string): Promise<WikiPoint | null>;
  clear(): void;
}

/** The cache holds no more places than this: old ones are evicted, localStorage does not grow forever. */
const MAX_ENTRIES = 300;

function loadStore(now: number): Record<string, Cached> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? (JSON.parse(raw) as Record<string, Cached>) : {};
    if (!data || typeof data !== 'object') return {};
    // Outdated ones and errors of earlier runs are not needed: errors are not written, and the outdated we will ask again anyway.
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
    // Storage is unavailable — the cache is in memory only.
  }
}

const validPoint = (p: unknown): p is WikiPoint => {
  const q = p as WikiPoint | null;
  return !!q && Number.isInteger(q.x) && Number.isInteger(q.y) && Number.isInteger(q.plane) && q.x > 0 && q.y > 0 && q.plane >= 0 && q.plane <= 3;
};

/**
 * Wiki requests for coordinates: one request per article, answers — in memory and localStorage.
 * A network error is remembered for a minute — a repeated click does not hammer the wiki, but does not block for long either.
 */
export function createWikiLocator(fetchFn: FetchFn, now: () => number = Date.now, persistent = true): WikiLocator {
  const store: Record<string, Cached> = persistent ? loadStore(now()) : {};
  // An article's markup is kept for a few minutes: an item has spawns in different places — the page is one.
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
      if (hit.failed) throw new Error('OSRS Wiki did not respond recently');
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

/** A spawn line in the dossier is marked "(members only)" — the wiki has no such mark. */
const withoutMembersMark = (s: string) => cleanWikiText(s).replace(/\s*\(members only\)$/, '');

const defaultFetch: FetchFn =(url) => fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
let defaultLocator: WikiLocator | null = null;
const locator = () => (defaultLocator ??= createWikiLocator(defaultFetch));

/**
 * The coordinates of a place. locationName — a line from the data ("Lumbridge - outside Fred the Farmer's house", "Port Sarim"),
 * npcName — the seller or NPC. It never throws: without a point — a wiki search.
 */
export async function resolveLocationCoordinates(
  locationName: string,
  npcName?: string,
  ctx: ResolveContext = {},
  wiki: WikiLocator = locator(),
): Promise<ResolvedLocation> {
  const label = cleanWikiText(ctx.shopName || npcName || locationName) || locationName;
  // 0. An item spawn: the tile where it lies is more exact than any dictionary point ("Port Sarim" is a whole town).
  //    No network — straight to the dictionary; the answer is cached, the second click does not wait for the wiki.
  if (ctx.itemPage && ctx.itemName) {
    const spot = withoutMembersMark(locationName);
    try {
      const p = await wiki.spawn(ctx.itemPage, ctx.itemName, spot);
      if (p) return { ...p, label: spot, source: 'wiki', match: 'spawn', page: ctx.itemPage };
    } catch {
      // The wiki did not answer — the dictionary.
    }
  }
  // 1. The dictionary, exact: a shop and seller are more exact than a town.
  for (const name of [ctx.shopName, npcName, locationName]) {
    const hit = name ? matchStrict(name) : null;
    if (hit) return hit;
  }
  // 2. The wiki: the articles of the shop, NPC, place.
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
      // The wiki did not answer — on to the approximate dictionary and search.
    }
  }
  // 3. The approximate dictionary.
  for (const name of [ctx.shopName, npcName, locationName]) {
    const hit = name ? matchLoose(name) : null;
    if (hit) return hit;
  }
  // 4. A wiki search.
  return { source: 'search-fallback', label, searchUrl: searchUrl(cleanWikiText(npcName || ctx.shopName || locationName) || locationName) };
}

export function resolvePlace(q: PlaceQuery): ReturnType<typeof resolveLocationCoordinates> {
  const ctx: ResolveContext = {};
  if (q.kind === 'spawn' && q.item) {
    ctx.itemPage = pageFromUrl(q.item.wikiUrl);
    ctx.itemName = q.item.nameEn;
  }
  // A click on a town is a town; on a shop or seller it is the shop itself, which is more exact.
  if (q.kind !== 'city' && q.shop) ctx.shopName = q.shop;
  return resolveLocationCoordinates(q.location, q.kind === 'city' ? undefined : q.npc, ctx);
}
