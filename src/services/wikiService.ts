// Досье предмета и NPC для встроенного инспектора вики.
// Сначала локальная база (f2p-items.json), потом живой поиск по вики. Цены биржи — всегда живые.

import type { WikiItemDetail } from '../types';
import { itemById, items } from '../data';
import { fold } from '../lib/md';
import { getGePrice, getMapping } from './pricesApi';
import { fetchItemDetail, fetchNpc, openSearch, type FetchFn, type NpcInfo } from './wikiApi';

const fetchFn: FetchFn = (url) => fetch(url);

export function findLocalItem(query: string | number): WikiItemDetail | undefined {
  if (typeof query === 'number') return itemById.get(query);
  const q = fold(query.trim());
  return items.find((i) => fold(i.nameEn) === q || (i.nameRu && fold(i.nameRu) === q));
}

/** Поиск по локальной базе: имя на английском или русском содержит все слова запроса. */
export function searchLocalItems(query: string, limit = 8): WikiItemDetail[] {
  const tokens = fold(query.trim()).split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const scored = items
    .map((i) => {
      const hay = fold(`${i.nameEn} ${i.nameRu ?? ''}`);
      if (!tokens.every((t) => hay.includes(t))) return null;
      const q = tokens.join(' ');
      const score = (fold(i.nameEn) === q || fold(i.nameRu ?? '') === q ? 100 : 0) + (fold(i.nameEn).startsWith(q) || fold(i.nameRu ?? '').startsWith(q) ? 20 : 0) - i.nameEn.length / 100;
      return { i, score };
    })
    .filter((x): x is { i: WikiItemDetail; score: number } => x !== null)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.i);
}

async function withPrice(d: WikiItemDetail): Promise<WikiItemDetail> {
  try {
    const p = await getGePrice(d.id);
    return p ? { ...d, gePrice: p } : d;
  } catch {
    return d;
  }
}

const remote = new Map<string, Promise<WikiItemDetail | null>>();

/** Досье предмета: локальная база + свежая цена, иначе — живой поиск по вики. */
export async function getItemDetail(query: string | number): Promise<WikiItemDetail | null> {
  const local = findLocalItem(query);
  if (local) return withPrice(local);
  if (typeof query === 'number') return null;
  const key = fold(query.trim());
  if (!remote.has(key)) {
    const p = (async () => {
      const [hit] = await openSearch(fetchFn, query, 1);
      if (!hit) return null;
      const mapping = await getMapping().catch(() => new Map());
      return fetchItemDetail(fetchFn, hit.title, undefined, (id) => mapping.get(id));
    })();
    p.catch(() => remote.delete(key));
    remote.set(key, p);
  }
  const d = await remote.get(key)!;
  return d ? withPrice(d) : null;
}

const npcs = new Map<string, Promise<NpcInfo | null>>();

export function getNpcDetail(name: string): Promise<NpcInfo | null> {
  if (!npcs.has(name)) {
    const p = fetchNpc(fetchFn, name);
    p.catch(() => npcs.delete(name));
    npcs.set(name, p);
  }
  return npcs.get(name)!;
}

/** Статьи вики по запросу — для поиска, когда в локальной базе ничего нет. */
export function searchWiki(query: string, limit = 5) {
  return openSearch(fetchFn, query, limit);
}
