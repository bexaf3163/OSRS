// Запросы к OSRS Wiki: карточка предмета, магазины, дроп, спавны, NPC.
// Общий код для приложения (живые запросы) и scripts/build-items.ts (сборка локальной базы).
// Без относительных импортов: файл запускается и в Vite, и прямо в Node.

import type { WikiItemDetail } from '../types/index.ts';

export const WIKI_ORIGIN = 'https://oldschool.runescape.wiki';
const API = `${WIKI_ORIGIN}/api.php`;

export type FetchFn = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Ссылка на статью вики. */
export function wikiPageUrl(page: string): string {
  return `${WIKI_ORIGIN}/w/${encodeURIComponent(page.replace(/ /g, '_')).replace(/%2F/g, '/')}`;
}

/** Ссылка на файл вики: «File:Shears.png» → https://oldschool.runescape.wiki/images/Shears.png */
export function wikiFileUrl(file: string): string {
  const name = file.replace(/^File:/, '').replace(/ /g, '_');
  return `${WIKI_ORIGIN}/images/${encodeURIComponent(name)}`;
}

const quote = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

async function getJson(fetchFn: FetchFn, params: Record<string, string>): Promise<Record<string, unknown>> {
  const url = `${API}?${new URLSearchParams({ format: 'json', origin: '*', ...params })}`;
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`OSRS Wiki ответила ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

async function bucket(fetchFn: FetchFn, query: string): Promise<Record<string, unknown>[]> {
  const data = await getJson(fetchFn, { action: 'bucket', query });
  if (data.error) throw new Error(`Bucket: ${String(data.error)}`);
  return (data.bucket as Record<string, unknown>[]) ?? [];
}

/** В Bucket логическое «да» приходит пустой строкой, «нет» — отсутствием поля. */
const flag = (row: Record<string, unknown>, key: string) => key in row && row[key] !== false && row[key] !== '0';
const first = (v: unknown): string => (Array.isArray(v) ? String(v[0] ?? '') : v == null ? '' : String(v));
const num = (v: unknown): number | undefined => {
  const n = Number(first(v).replace(/[,\s]/g, ''));
  return Number.isFinite(n) && first(v) !== '' ? n : undefined;
};

const UK_FLOOR: Record<string, string> = {
  '0': 'Ground floor (1-й этаж)', '1': '1st floor (2-й этаж)', '2': '2nd floor (3-й этаж)', '3': '3rd floor (4-й этаж)',
};

/** Вики-разметка в простой текст: [[A|B]] → B, {{FloorNumber|uk=1}} → «1st floor (2-й этаж)». */
export function cleanWikiText(s: string): string {
  return s
    .replace(/\{\{FloorNumber\|(?:[^}]*?\|)?uk=(\d)[^}]*\}\}/gi, (_m, n: string) => UK_FLOOR[n] ?? `${n} floor`)
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/'{2,}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ItemInfobox {
  pageName: string;
  name: string;
  id: number;
  examine: string;
  value: number;
  highAlch?: number;
  members: boolean;
  tradeable: boolean;
  iconUrl: string;
}

/** Карточка предмета по точному имени (item_name), например «Energy potion(4)». */
export async function fetchItemInfobox(fetchFn: FetchFn, name: string): Promise<ItemInfobox | null> {
  const rows = await bucket(fetchFn,
    `bucket('infobox_item').select('page_name','item_name','item_id','examine','value','high_alchemy_value','is_members_only','tradeable','image').where('item_name',${quote(name)}).run()`);
  const row = rows.find((r) => first(r.item_name) === name && num(r.item_id) !== undefined) ?? rows.find((r) => num(r.item_id) !== undefined);
  if (!row) return null;
  return {
    pageName: first(row.page_name),
    name: first(row.item_name) || name,
    id: num(row.item_id)!,
    examine: cleanWikiText(first(row.examine)),
    value: num(row.value) ?? 0,
    highAlch: num(row.high_alchemy_value),
    members: flag(row, 'is_members_only'),
    tradeable: flag(row, 'tradeable'),
    iconUrl: first(row.image) ? wikiFileUrl(first(row.image)) : wikiFileUrl(`${name}.png`),
  };
}

type Store = NonNullable<WikiItemDetail['buyLocations']>[number];

/** Магазины, где продаётся предмет: цена, запас, город и владелец. */
export async function fetchStores(fetchFn: FetchFn, name: string, limit = 10): Promise<Store[]> {
  const lines = await bucket(fetchFn,
    `bucket('storeline').select('sold_by','store_sell_price','store_stock','store_currency').where('sold_item',${quote(name)}).limit(40).run()`);
  const coins = lines.filter((l) => !first(l.store_currency) || /coins/i.test(first(l.store_currency)));
  const shops = [...new Set(coins.map((l) => first(l.sold_by)).filter(Boolean))];
  const info = new Map<string, Record<string, unknown>>();
  // Сведения о магазинах пачками: город, владелец, только для подписки или нет.
  for (let i = 0; i < shops.length; i += 15) {
    const chunk = shops.slice(i, i + 15);
    const where = chunk.map((s) => `{'page_name',${quote(s)}}`).join(',');
    const rows = await bucket(fetchFn,
      `bucket('infobox_shop').select('page_name','location','owner','is_members_only').where(bucket.Or(${where})).limit(50).run()`);
    for (const r of rows) if (!info.has(first(r.page_name))) info.set(first(r.page_name), r);
  }
  const out: Store[] = coins.map((l) => {
    const shop = first(l.sold_by);
    const i = info.get(shop) ?? {};
    const stock = first(l.store_stock);
    return {
      shopName: shop,
      location: cleanWikiText(first(i.location)),
      ...(first(i.owner) ? { owner: cleanWikiText(first(i.owner)) } : {}),
      price: num(l.store_sell_price) ?? 0,
      stock: /^\d+$/.test(stock) ? Number(stock) : stock || '—',
      members: flag(i, 'is_members_only'),
    };
  });
  // Сначала бесплатные магазины, потом дешёвые.
  out.sort((a, b) => Number(a.members) - Number(b.members) || a.price - b.price);
  const seen = new Set<string>();
  return out.filter((s) => (seen.has(s.shopName) ? false : (seen.add(s.shopName), true))).slice(0, limit);
}

type Drop = NonNullable<WikiItemDetail['dropSources']>[number] & { members?: boolean };

/** Монстры, с которых падает предмет (только бой), с боевым уровнем и шансом. */
export async function fetchDrops(fetchFn: FetchFn, name: string, limit = 8): Promise<Drop[]> {
  const rows = await bucket(fetchFn,
    `bucket('dropsline').select('page_name','drop_json').where('item_name',${quote(name)}).limit(60).run()`);
  const drops: { monster: string; rate: string }[] = [];
  for (const r of rows) {
    try {
      const d = JSON.parse(first(r.drop_json)) as Record<string, unknown>;
      if (d['Drop type'] && d['Drop type'] !== 'combat') continue;
      const monster = String(d['Dropped from'] ?? first(r.page_name));
      const rate = String(d.Rarity ?? '');
      if (monster && !drops.some((x) => x.monster === monster)) drops.push({ monster, rate });
    } catch {
      // Битая строка дропа — пропускаем.
    }
  }
  const names = drops.map((d) => d.monster);
  const levels = new Map<string, { level: number | null; members: boolean }>();
  for (let i = 0; i < names.length; i += 15) {
    const where = names.slice(i, i + 15).map((m) => `{'page_name',${quote(m)}}`).join(',');
    const ms = await bucket(fetchFn,
      `bucket('infobox_monster').select('page_name','combat_level','is_members_only').where(bucket.Or(${where})).limit(60).run()`);
    for (const m of ms) {
      const key = first(m.page_name);
      if (!levels.has(key)) levels.set(key, { level: num(m.combat_level) ?? null, members: flag(m, 'is_members_only') });
    }
  }
  const out: Drop[] = drops.map((d) => ({
    monster: d.monster,
    combatLevel: levels.get(d.monster)?.level ?? null,
    rate: d.rate,
    members: levels.get(d.monster)?.members ?? false,
  }));
  // Бесплатные монстры и частый дроп — выше.
  const chance = (r: string) => (/always/i.test(r) ? 1 : (([a, b]) => (b ? Number(a) / Number(b) : 0))(r.split('/')));
  out.sort((a, b) => Number(a.members) - Number(b.members) || chance(b.rate) - chance(a.rate));
  return out.slice(0, limit);
}

/** Точки спавна со страницы предмета ({{ItemSpawnLine}}). F2P — первыми. */
export async function fetchSpawns(fetchFn: FetchFn, pageName: string, itemName: string, limit = 8): Promise<string[]> {
  const data = await getJson(fetchFn, { action: 'parse', page: pageName, prop: 'wikitext', formatversion: '2' });
  const text = String((data.parse as { wikitext?: string } | undefined)?.wikitext ?? '');
  const out: { text: string; members: boolean }[] = [];
  for (const m of text.matchAll(/\{\{ItemSpawnLine\|((?:[^{}]|\{\{[^{}]*\}\})*)\}\}/g)) {
    const params = new Map<string, string>();
    for (const part of m[1].split(/\|(?![^{]*\}\})(?![^[]*\]\])/)) {
      const eq = part.indexOf('=');
      if (eq > 0) params.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
    }
    const name = params.get('name');
    if (name && name !== itemName) continue;
    const location = cleanWikiText(params.get('location') ?? '');
    if (!location) continue;
    const members = /^yes$/i.test(params.get('members') ?? '');
    if (!out.some((o) => o.text === location)) out.push({ text: location, members });
  }
  out.sort((a, b) => Number(a.members) - Number(b.members));
  return out.slice(0, limit).map((o) => (o.members ? `${o.text} (только для подписки)` : o.text));
}

export interface NpcInfo {
  name: string;
  examine: string;
  location: string;
  members: boolean;
  imageUrl?: string;
  wikiUrl: string;
}

export async function fetchNpc(fetchFn: FetchFn, name: string): Promise<NpcInfo | null> {
  const rows = await bucket(fetchFn,
    `bucket('infobox_npc').select('page_name','npc_name','examine','location','is_members_only','image').where('page_name',${quote(name)}).limit(3).run()`);
  const row = rows[0];
  if (!row) return null;
  return {
    name: first(row.npc_name) || first(row.page_name),
    examine: cleanWikiText(first(row.examine)),
    location: cleanWikiText(first(row.location)),
    members: flag(row, 'is_members_only'),
    ...(first(row.image) ? { imageUrl: wikiFileUrl(first(row.image)) } : {}),
    wikiUrl: wikiPageUrl(first(row.page_name)),
  };
}

/** Поиск статьи по названию (MediaWiki opensearch). */
export async function openSearch(fetchFn: FetchFn, query: string, limit = 5): Promise<{ title: string; url: string }[]> {
  const url = `${API}?action=opensearch&search=${encodeURIComponent(query)}&limit=${limit}&format=json&origin=*`;
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`OSRS Wiki ответила ${res.status}`);
  const [, titles, , urls] = (await res.json()) as [string, string[], string[], string[]];
  return titles.map((title, i) => ({ title, url: urls[i] }));
}

/** Строка из https://prices.runescape.wiki/api/v1/osrs/mapping — точные цены у торговцев и алхимии. */
export interface MappingEntry {
  id: number;
  name: string;
  examine?: string;
  members?: boolean;
  value?: number;
  highalch?: number;
  lowalch?: number;
  icon?: string;
}

/** Полное досье предмета с вики (без цен биржи — их добавляет pricesApi). */
export async function fetchItemDetail(
  fetchFn: FetchFn, name: string, nameRu?: string, mapping?: (id: number) => MappingEntry | undefined,
): Promise<WikiItemDetail | null> {
  const box = await fetchItemInfobox(fetchFn, name);
  if (!box) return null;
  const [buyLocations, dropSources, freeSpawns] = await Promise.all([
    fetchStores(fetchFn, box.name).catch(() => []),
    fetchDrops(fetchFn, box.name).catch(() => []),
    fetchSpawns(fetchFn, box.pageName, box.name).catch(() => []),
  ]);
  // У предметов биржи цены торговцев и алхимии берём из mapping: карточка вики иногда их не заполняет.
  const m = mapping?.(box.id);
  const highAlch = m?.highalch ?? (box.highAlch || undefined);
  return {
    id: box.id,
    nameEn: box.name,
    ...(nameRu ? { nameRu } : {}),
    examine: box.examine || m?.examine || '',
    members: m?.members ?? box.members,
    iconUrl: box.iconUrl,
    value: m?.value ?? box.value,
    ...(highAlch !== undefined ? { highAlch } : {}),
    ...(m?.lowalch !== undefined ? { lowAlch: m.lowalch } : {}),
    ...(buyLocations.length ? { buyLocations } : {}),
    ...(freeSpawns.length ? { freeSpawns } : {}),
    ...(dropSources.length ? { dropSources: dropSources.map(({ monster, combatLevel, rate }) => ({ monster, combatLevel, rate })) } : {}),
    wikiUrl: wikiPageUrl(box.pageName),
  };
}
