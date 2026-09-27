// Места из досье вики → точка на карте и временная цель для RuneLite. Чистые функции без React и Leaflet:
// что искать (строка спавна, магазин, продавец, город), откуда взялись координаты и что уходит в игру.

import type { WikiItemDetail } from '../types';
import { resolveLocationCoordinates, type ResolvedPoint, type ResolveContext } from '../services/locationResolver';
import type { NavTargetPayload } from '../services/runeliteBridge';

/** Что за место: строка «где лежит бесплатно», магазин (и его продавец, город) или NPC. */
export interface PlaceQuery {
  kind: 'spawn' | 'shop' | 'npc' | 'city';
  location: string;
  npc?: string;
  shop?: string;
  item?: Pick<WikiItemDetail, 'nameEn' | 'wikiUrl'>;
}

/** Одно место на карте и откуда оно: предмет, продавец, магазин, город. */
export interface MapTarget {
  x: number;
  y: number;
  plane: number;
  label: string;
  sourceItem?: string;
  sourceNpc?: string;
  sourceShop?: string;
  sourceLocation?: string;
  /** Откуда координаты: «словарь мест», «карта статьи вики»… */
  origin?: string;
}

/** Название статьи из ссылки вики: …/w/Bronze_axe → «Bronze axe». */
export function pageFromUrl(url: string): string | undefined {
  const m = /\/w\/([^?#]+)/.exec(url);
  if (!m) return undefined;
  try {
    return decodeURIComponent(m[1]).replace(/_/g, ' ');
  } catch {
    return undefined;
  }
}

export function resolvePlace(q: PlaceQuery): ReturnType<typeof resolveLocationCoordinates> {
  const ctx: ResolveContext = {};
  if (q.kind === 'spawn' && q.item) {
    ctx.itemPage = pageFromUrl(q.item.wikiUrl);
    ctx.itemName = q.item.nameEn;
  }
  // Клик по городу — это город; по магазину и продавцу — сам магазин, он точнее.
  if (q.kind !== 'city' && q.shop) ctx.shopName = q.shop;
  return resolveLocationCoordinates(q.location, q.kind === 'city' ? undefined : q.npc, ctx);
}

const MATCH_TEXT: Record<ResolvedPoint['match'], string> = {
  exact: '', alias: '', normalized: '', substring: ' (примерно: по названию места в строке)', fuzzy: ' (примерно: похожее название)',
  spawn: '', article: '',
};

function origin(p: ResolvedPoint): string {
  if (p.source === 'wiki') return p.match === 'spawn' ? `место на странице «${p.page}» OSRS Wiki` : `карта статьи «${p.page}» OSRS Wiki`;
  return `словарь мест (статья «${p.page}»)${MATCH_TEXT[p.match]}`;
}

export function mapTarget(q: PlaceQuery, p: ResolvedPoint): MapTarget {
  return {
    x: p.x, y: p.y, plane: p.plane, label: p.label,
    ...(q.item ? { sourceItem: q.item.nameEn } : {}),
    ...(q.shop && q.kind !== 'city' ? { sourceShop: q.shop } : {}),
    ...(q.npc && q.kind !== 'city' ? { sourceNpc: q.npc } : {}),
    ...(q.location ? { sourceLocation: q.location } : {}),
    origin: origin(p),
  };
}

/** Временная цель в игру — только из найденной точки. Продавец — чтобы плагин подсветил его. */
export function navPayload(q: PlaceQuery, p: ResolvedPoint): NavTargetPayload {
  return {
    label: p.label.slice(0, 200), x: p.x, y: p.y, plane: p.plane,
    ...(q.npc && q.kind !== 'city' && q.kind !== 'spawn' ? { npcNames: [q.npc] } : {}),
  };
}

/** «Источник предмета: Shears • Fred the Farmer», «Источник: Gerrant's Fishy Business • Port Sarim». */
export function sourceBadge(t: MapTarget): string | null {
  const where = [t.sourceShop, t.sourceNpc, t.sourceLocation].filter((s, i, all) => s && all.indexOf(s) === i);
  if (t.sourceItem) return `Источник предмета: ${[t.sourceItem, ...where].join(' • ')}`;
  return where.length ? `Источник: ${where.join(' • ')}` : null;
}
