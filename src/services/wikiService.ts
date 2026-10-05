// An item and NPC dossier for the built-in wiki inspector.
// First the local database (f2p-items.json), then a live wiki search. Exchange prices are always live.

import type { WikiItemDetail } from '../types';
import { itemById, items } from '../data';
import { fold } from '../lib/md';
import { getGePrice, getMapping } from './pricesApi';
import { fetchItemDetail, fetchNpc, openSearch, type FetchFn, type NpcInfo } from './wikiApi';

/** A hung wiki request must not leave a dossier "loading" forever. */
const WIKI_TIMEOUT_MS = 12_000;
const fetchFn: FetchFn = (url) => fetch(url, { signal: AbortSignal.timeout(WIKI_TIMEOUT_MS) });

export function findLocalItem(query: string | number): WikiItemDetail | undefined {
  if (typeof query === 'number') return itemById.get(query);
  const q = fold(query.trim());
  return items.find((i) => fold(i.nameEn) === q);
}

/** A dossier with the exchange price. No price because it is not traded and no price because there is no connection are different things. */
async function withPrice(d: WikiItemDetail): Promise<WikiItemDetail> {
  try {
    const p = await getGePrice(d.id);
    return p ? { ...d, gePrice: p } : d;
  } catch {
    return { ...d, priceUnavailable: true };
  }
}

const remote = new Map<string, Promise<WikiItemDetail | null>>();

/** An item dossier: the local database + a fresh price, otherwise a live wiki search. */
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
      return fetchItemDetail(fetchFn, hit.title, (id) => mapping.get(id));
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
