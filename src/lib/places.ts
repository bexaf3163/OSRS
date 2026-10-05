// Places from the wiki dossier to a point on the map and a temporary target for RuneLite. Pure functions without React and Leaflet:
// what to look for (a spawn line, a shop, a seller, a town), where the coordinates came from and what goes to the game.

import type { WikiItemDetail } from '../types';
import { resolveLocationCoordinates, type ResolvedPoint, type ResolveContext } from '../services/locationResolver';
import type { NavTargetPayload } from '../services/runeliteBridge';

/** What kind of place: a "where it lies for free" line, a shop (and its seller, town) or an NPC. */
export interface PlaceQuery {
  kind: 'spawn' | 'shop' | 'npc' | 'city';
  location: string;
  npc?: string;
  shop?: string;
  item?: Pick<WikiItemDetail, 'nameEn' | 'wikiUrl'>;
}

/** One place on the map and where it comes from: an item, a seller, a shop, a town. */
export interface MapTarget {
  x: number;
  y: number;
  plane: number;
  label: string;
  sourceItem?: string;
  sourceNpc?: string;
  sourceShop?: string;
  sourceLocation?: string;
  /** Where the coordinates come from: "the place dictionary", "the wiki article map"... */
  origin?: string;
}

/** The article name from a wiki link: .../w/Bronze_axe gives "Bronze axe". */
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
  // A click on a town is a town; on a shop or seller it is the shop itself, which is more exact.
  if (q.kind !== 'city' && q.shop) ctx.shopName = q.shop;
  return resolveLocationCoordinates(q.location, q.kind === 'city' ? undefined : q.npc, ctx);
}

const MATCH_TEXT: Record<ResolvedPoint['match'], string> = {
  exact: '', alias: '', normalized: '', substring: ' (approximate: by the place name in the line)', fuzzy: ' (approximate: a similar name)',
  spawn: '', article: '',
};

function origin(p: ResolvedPoint): string {
  if (p.source === 'wiki') return p.match === 'spawn' ? `a place on the OSRS Wiki page "${p.page}"` : `the map of the article "${p.page}" on the OSRS Wiki`;
  return `the place dictionary (article "${p.page}")${MATCH_TEXT[p.match]}`;
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

/** A temporary target into the game: only from a found point. The seller is so that the plugin highlights them. */
export function navPayload(q: PlaceQuery, p: ResolvedPoint): NavTargetPayload {
  return {
    label: p.label.slice(0, 200), x: p.x, y: p.y, plane: p.plane,
    ...(q.npc && q.kind !== 'city' && q.kind !== 'spawn' ? { npcNames: [q.npc] } : {}),
  };
}

/** "Item source: Shears • Fred the Farmer", "Source: Gerrant's Fishy Business • Port Sarim". */
export function sourceBadge(t: MapTarget): string | null {
  const where = [t.sourceShop, t.sourceNpc, t.sourceLocation].filter((s, i, all) => s && all.indexOf(s) === i);
  if (t.sourceItem) return `Item source: ${[t.sourceItem, ...where].join(' • ')}`;
  return where.length ? `Source: ${where.join(' • ')}` : null;
}
