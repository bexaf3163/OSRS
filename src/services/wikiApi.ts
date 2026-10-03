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

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#91': '[', '#93': ']', '#39': "'" };
const US_FLOOR: Record<string, string> = { Ground: '1', '1st': '2', '2nd': '3', '3rd': '4', '4th': '5' };

/**
 * Вики-разметка в простой текст: [[A|B]] → B, {{FloorNumber|uk=1}} → «1st floor (2-й этаж)».
 * Bucket отдаёт уже развёрнутые шаблоны с HTML-сущностями: «1st&nbsp;floor&#91;UK&#93;2nd&nbsp;floor&#91;US&#93;»
 * — это тоже приводится к «1st floor (2-й этаж)».
 */
export function cleanWikiText(s: string): string {
  return s
    .replace(/&(#\d+|[a-z]+);/gi, (m, e: string) => ENTITIES[e.toLowerCase()] ?? m)
    // Вики иногда отдаёт неразрывный пробел (U+00A0 или &#160;): без замены «floor[UK]» не узнавался.
    .replace(/&#160;|\u00a0/g, ' ')
    .replace(/\b(Ground|\d+(?:st|nd|rd|th)) floor\[UK\](?:Ground|\d+(?:st|nd|rd|th)) floor\[US\]/g,
      (_m, uk: string) => `${uk} floor (${US_FLOOR[uk] ?? '?'}-й этаж)`)
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

/** Бонусы снаряжения из карточки {{Infobox Bonuses}}: атака и защита по типам, сила, скорость, слот. */
export interface ItemBonuses {
  attack: { stab: number; slash: number; crush: number; magic: number; ranged: number };
  defence: { stab: number; slash: number; crush: number; magic: number; ranged: number };
  strength: number;
  prayer: number;
  /** Слот вики: weapon, 2h, head, body, legs, shield, neck… */
  slot: string;
  /** Тиков между ударами (у оружия). */
  speed?: number;
}

/** Бонусы пачкой по названиям статей: статья → бонусы (первая версия, если их несколько). */
export async function fetchBonuses(fetchFn: FetchFn, pages: string[]): Promise<Map<string, ItemBonuses>> {
  const out = new Map<string, ItemBonuses>();
  const n = (r: Record<string, unknown>, k: string) => num(r[k]) ?? 0;
  for (let i = 0; i < pages.length; i += 20) {
    const where = pages.slice(i, i + 20).map((p) => `{'page_name',${quote(p)}}`).join(',');
    const rows = await bucket(fetchFn,
      `bucket('infobox_bonuses').select('page_name','stab_attack_bonus','slash_attack_bonus','crush_attack_bonus','magic_attack_bonus','range_attack_bonus','stab_defence_bonus','slash_defence_bonus','crush_defence_bonus','magic_defence_bonus','range_defence_bonus','strength_bonus','prayer_bonus','equipment_slot','weapon_attack_speed').where(bucket.Or(${where})).limit(100).run()`);
    for (const r of rows) {
      const page = first(r.page_name);
      if (out.has(page)) continue;
      out.set(page, {
        attack: { stab: n(r, 'stab_attack_bonus'), slash: n(r, 'slash_attack_bonus'), crush: n(r, 'crush_attack_bonus'), magic: n(r, 'magic_attack_bonus'), ranged: n(r, 'range_attack_bonus') },
        defence: { stab: n(r, 'stab_defence_bonus'), slash: n(r, 'slash_defence_bonus'), crush: n(r, 'crush_defence_bonus'), magic: n(r, 'magic_defence_bonus'), ranged: n(r, 'range_defence_bonus') },
        strength: n(r, 'strength_bonus'),
        prayer: n(r, 'prayer_bonus'),
        slot: first(r.equipment_slot).toLowerCase(),
        ...(num(r.weapon_attack_speed) !== undefined ? { speed: num(r.weapon_attack_speed) } : {}),
      });
    }
  }
  return out;
}

/** Защита монстра из карточки {{Infobox Monster}}: у статьи бывает несколько версий (уровней). */
export interface MonsterStats {
  page: string;
  version?: string;
  combat: number;
  hitpoints: number;
  defenceLevel: number;
  defence: { stab: number; slash: number; crush: number };
  members: boolean;
}

/** Все версии монстров пачкой по названиям статей: статья → версии. */
export async function fetchMonsters(fetchFn: FetchFn, pages: string[]): Promise<Map<string, MonsterStats[]>> {
  const out = new Map<string, MonsterStats[]>();
  const n = (r: Record<string, unknown>, k: string) => num(r[k]) ?? 0;
  for (let i = 0; i < pages.length; i += 20) {
    const where = pages.slice(i, i + 20).map((p) => `{'page_name',${quote(p)}}`).join(',');
    const rows = await bucket(fetchFn,
      `bucket('infobox_monster').select('page_name','version_anchor','combat_level','hitpoints','defence_level','stab_defence_bonus','slash_defence_bonus','crush_defence_bonus','is_members_only').where(bucket.Or(${where})).limit(200).run()`);
    for (const r of rows) {
      const page = first(r.page_name);
      const version = first(r.version_anchor);
      const list = out.get(page) ?? [];
      list.push({
        page,
        ...(version ? { version } : {}),
        combat: n(r, 'combat_level'),
        hitpoints: n(r, 'hitpoints'),
        defenceLevel: n(r, 'defence_level'),
        defence: { stab: n(r, 'stab_defence_bonus'), slash: n(r, 'slash_defence_bonus'), crush: n(r, 'crush_defence_bonus') },
        members: flag(r, 'is_members_only'),
      });
      out.set(page, list);
    }
  }
  return out;
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

// ---------- Координаты из статей: шаблоны {{Map}} и {{ItemSpawnLine}} ----------

/** Клетка мира в координатах игры (как в RuneLite): x, y, этаж. */
export interface WikiPoint {
  x: number;
  y: number;
  plane: number;
}

/** Шаблоны с именем name и всё внутри них — с учётом вложенных {{…}}. */
export function templates(text: string, name: string): string[] {
  const out: string[] = [];
  const open = new RegExp(`\\{\\{\\s*${name}\\s*\\|`, 'gi');
  for (let m = open.exec(text); m; m = open.exec(text)) {
    let depth = 0;
    for (let i = m.index; i < text.length - 1; i++) {
      if (text[i] === '{' && text[i + 1] === '{') { depth++; i++; continue; }
      if (text[i] === '}' && text[i + 1] === '}') {
        depth--;
        i++;
        if (depth === 0) { out.push(text.slice(m.index + m[0].length, i - 1)); break; }
      }
    }
  }
  return out;
}

/** Параметры шаблона верхнего уровня: разделитель | вне вложенных шаблонов и ссылок. */
function templateParams(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < body.length; i++) {
    const two = body.slice(i, i + 2);
    if (two === '{{' || two === '[[') { depth++; cur += two; i++; continue; }
    if (two === '}}' || two === ']]') { depth--; cur += two; i++; continue; }
    if (body[i] === '|' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += body[i];
  }
  out.push(cur.trim());
  return out;
}

const PAIR = /^(\d{3,5})\s*,\s*(\d{3,5})(?:\s*,\s*(\d))?$/;
const COLON = /x:\s*(\d{3,5})\s*,\s*y:\s*(\d{3,5})(?:\s*,\s*plane:\s*(\d))?/gi;

/**
 * Точки одного шаблона карты: «3144,3178», «x:3190,y:3273,plane:1» или x=/y=/plane=.
 * Если заданы x= и y= — это и есть точка (остальное — контур). mapID у подземелий свой (Dwarven Mine — 6),
 * но координаты и там мировые — те же, что у RuneLite, поэтому они подходят.
 */
export function mapTemplatePoints(body: string): WikiPoint[] {
  const params = templateParams(body);
  const named = new Map<string, string>();
  for (const p of params) {
    const eq = p.indexOf('=');
    if (eq > 0 && /^[a-z_]+$/i.test(p.slice(0, eq).trim())) named.set(p.slice(0, eq).trim().toLowerCase(), p.slice(eq + 1).trim());
  }
  const plane = Number(named.get('plane') ?? 0) || 0;
  const nx = Number(named.get('x'));
  const ny = Number(named.get('y'));
  if (Number.isInteger(nx) && Number.isInteger(ny) && nx > 0 && ny > 0) return [{ x: nx, y: ny, plane }];
  return paramPoints(params, plane);
}

/**
 * Точки из параметров шаблона в обеих записях вики: «3244,3159» и «x:3190,y:3273,plane:1».
 * Строки спавнов пишут и так, и так (у Small fishing net — «3244,3159|3245,3156»).
 */
function paramPoints(params: string[], plane: number): WikiPoint[] {
  const pts: WikiPoint[] = [];
  for (const p of params) {
    const m = p.match(PAIR);
    if (m) { pts.push({ x: Number(m[1]), y: Number(m[2]), plane: m[3] ? Number(m[3]) : plane }); continue; }
    for (const c of p.matchAll(COLON)) pts.push({ x: Number(c[1]), y: Number(c[2]), plane: c[3] ? Number(c[3]) : plane });
  }
  return pts;
}

/**
 * Одна точка из нескольких: середина, если все рядом (контур дома, место спавна), иначе первая —
 * у NPC с точками по всему миру середина оказалась бы в чистом поле.
 */
export function representativePoint(points: WikiPoint[], spread = 40): WikiPoint | null {
  if (!points.length) return null;
  const cx = Math.round(points.reduce((s, p) => s + p.x, 0) / points.length);
  const cy = Math.round(points.reduce((s, p) => s + p.y, 0) / points.length);
  const compact = points.every((p) => Math.abs(p.x - cx) <= spread && Math.abs(p.y - cy) <= spread && p.plane === points[0].plane);
  return compact ? { x: cx, y: cy, plane: points[0].plane } : points[0];
}

/** Точка статьи: первый шаблон {{Map}} с точками — карта в карточке NPC, магазина или места. */
export function articleMapPoint(wikitext: string): WikiPoint | null {
  for (const body of templates(wikitext, 'Map')) {
    const p = representativePoint(mapTemplatePoints(body));
    if (p) return p;
  }
  return null;
}

/** Точка спавна предмета из {{ItemSpawnLine}} с тем же местом (сравнение — по очищенному тексту). */
export function spawnPoint(wikitext: string, itemName: string, location: string): WikiPoint | null {
  const want = cleanWikiText(location).toLowerCase();
  for (const body of templates(wikitext, 'ItemSpawnLine')) {
    const params = templateParams(body);
    const get = (k: string) => params.find((p) => p.toLowerCase().startsWith(`${k}=`))?.slice(k.length + 1).trim() ?? '';
    const name = get('name');
    if (name && name !== itemName) continue;
    if (cleanWikiText(get('location')).toLowerCase() !== want) continue;
    const point = representativePoint(paramPoints(params, Number(get('plane')) || 0));
    if (point) return point;
  }
  return null;
}

/**
 * Точка места из {{ObjectLocLine}}/{{LocLine}} с тем же местом: так на вики отмечены места ловли и руды
 * («Fishing spot (small net, bait)» → «Lumbridge Swamp»). Сравнение — по очищенному тексту без регистра.
 */
export function locLinePoint(wikitext: string, location: string): WikiPoint | null {
  const want = cleanWikiText(location).toLowerCase();
  for (const name of ['ObjectLocLine', 'LocLine']) {
    for (const body of templates(wikitext, name)) {
      const params = templateParams(body);
      const loc = params.find((p) => /^location\s*=/i.test(p))?.replace(/^location\s*=/i, '') ?? '';
      if (cleanWikiText(loc).toLowerCase() !== want) continue;
      const plane = Number(params.find((p) => /^plane\s*=/i.test(p))?.replace(/^plane\s*=/i, '')) || 0;
      const point = representativePoint(paramPoints(params, plane));
      if (point) return point;
    }
  }
  return null;
}

/** Вики-разметка статьи (с переходом по перенаправлению). null — статьи нет. */
export async function fetchWikitext(fetchFn: FetchFn, page: string): Promise<{ title: string; text: string } | null> {
  const data = await getJson(fetchFn, { action: 'parse', page, prop: 'wikitext', redirects: '1', formatversion: '2' });
  if (data.error) return null;
  const parse = data.parse as { title?: string; wikitext?: string } | undefined;
  if (!parse?.wikitext) return null;
  return { title: parse.title ?? page, text: parse.wikitext };
}
