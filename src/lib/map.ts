// The OSRS Wiki world map: tiles, floors and the step's points.
// The wiki's own map cannot be embedded: oldschool.runescape.wiki answers with X-Frame-Options: DENY and
// frame-ancestors 'none', so we draw the map ourselves from the same tiles (maps.runescape.wiki,
// Access-Control-Allow-Origin: *). A tile of scale z is 256x256 points, a game tile is 2^z points.

import type { MapLocation, Step } from '../types';

export interface MapTileSource {
  mapId: number;
  cacheVersion: string;
  bounds?: [[number, number], [number, number]];
}

// Verified archive fallback, not a claim of current game imagery. Published metadata is loaded by useMapSources.
export const FALLBACK_MAP_SOURCE: MapTileSource = { mapId: 0, cacheVersion: '2019-10-31_1' };
export const MAP_METADATA_URL = 'https://maps.runescape.wiki/osrs/data/dataloader.json';

export function parseMapSources(raw: unknown): MapTileSource[] {
  const maps = (raw as { baseMaps?: unknown } | null)?.baseMaps;
  if (!Array.isArray(maps)) return [];
  return maps.flatMap((value: unknown) => {
    if (!value || typeof value !== 'object') return [];
    const { mapId, cacheVersion, bounds } = value as Record<string, unknown>;
    if (!Number.isInteger(mapId) || (mapId as number) < 0 || (mapId as number) > 10000
      || typeof cacheVersion !== 'string' || !/^\d{4}-\d{2}-\d{2}_[\w-]+$/.test(cacheVersion)
      || !Array.isArray(bounds) || bounds.length !== 2
      || !bounds.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))
      || bounds[0][0] >= bounds[1][0] || bounds[0][1] >= bounds[1][1]) return [];
    return [{ mapId: mapId as number, cacheVersion, bounds: bounds as MapTileSource['bounds'] }];
  });
}

/** All tiles in a viewport use the same atlas, including tiles crossing its boundary. */
export function mapSourceAt(sources: readonly MapTileSource[], point: { x: number; y: number }): MapTileSource {
  return sources.filter(({ bounds: b }) => b && point.x >= b[0][0] && point.x <= b[1][0]
    && point.y >= b[0][1] && point.y <= b[1][1])
    .sort((a, b) => area(a) - area(b))[0] ?? FALLBACK_MAP_SOURCE;
}
function area({ bounds: b }: MapTileSource): number {
  return b ? (b[1][0] - b[0][0]) * (b[1][1] - b[0][1]) : Infinity;
}

export const MIN_ZOOM = -3;
export const MAX_ZOOM = 3;
export const DEFAULT_ZOOM = 2;
export const TILE = 256;

export const MAP_ATTRIBUTION = 'Archived base imagery © OSRS Wiki (Weird Gloop), game © Jagex';

/** Documented Wiki tile schema; separate dungeon atlases come from the published manifest. */
export function tileUrl(zoom: number, plane: number, tx: number, ty: number, source = FALLBACK_MAP_SOURCE): string {
  return `https://maps.runescape.wiki/osrs/tiles/${source.mapId}_${source.cacheVersion}/${zoom}/${plane}_${tx}_${ty}.png`;
}

/** How many screen points are in one game tile at this scale. */
export const pxPerSquare = (zoom: number) => 2 ** zoom;

export interface PlacedTile {
  url: string;
  left: number;
  top: number;
}

/**
 * The tiles that cover a width x height window; tile p is centred horizontally and at height anchorY
 * (a fraction of the top: in the preview the marker is a little above the centre so the caption below does not cover it).
 * Coordinates are from the window's top-left corner. The tile's centre (x + 0.5) puts the marker in the middle of the tile, not on its corner.
 */
export function tilesAround(p: { x: number; y: number; plane: number }, zoom: number, width: number, height: number, anchorY = 0.5, source = FALLBACK_MAP_SOURCE): PlacedTile[] {
  const ppt = pxPerSquare(zoom);
  const span = TILE / ppt;
  const cx = p.x + 0.5;
  const cy = p.y + 0.5;
  const ay = height * anchorY;
  const tx0 = Math.floor((cx - width / 2 / ppt) / span);
  const tx1 = Math.floor((cx + width / 2 / ppt) / span);
  const ty0 = Math.floor((cy - (height - ay) / ppt) / span);
  const ty1 = Math.floor((cy + ay / ppt) / span);
  const out: PlacedTile[] = [];
  for (let ty = ty1; ty >= ty0; ty--) {
    for (let tx = tx0; tx <= tx1; tx++) {
      out.push({
        url: tileUrl(zoom, p.plane, tx, ty, source),
        left: Math.round(width / 2 + (tx * span - cx) * ppt),
        // North is at the top: for tile ty the top edge is tile (ty + 1) * span.
        top: Math.round(ay - ((ty + 1) * span - cy) * ppt),
      });
    }
  }
  return out;
}

const FLOORS = ['Ground floor', '1st floor', '2nd floor', '3rd floor'];

/** The floor in the British numbering, as in the game and in the step cards. */
export function floorLabel(plane: number): string {
  return FLOORS[plane] ?? `Floor ${plane}`;
}

/** Dungeons lie far to the north on the world map (y > 6400): that is not a floor but a separate area. */
export const isUnderground = (p: { y: number }) => p.y > 6400;

const same = (a: MapLocation, b: MapLocation) => a.x === b.x && a.y === b.y && a.plane === b.plane;

/**
 * All the step's points for the switcher: the start and the gathering places. If the start coincides with one of the places
 * (for training steps the start is the first place), it is not duplicated.
 */
export function stepPoints(step: Pick<Step, 'mapLocation' | 'resourceSpots'>): MapLocation[] {
  const spots = step.resourceSpots ?? [];
  const start = step.mapLocation;
  if (!start) return spots;
  return spots.some((s) => same(s, start)) ? spots : [start, ...spots];
}

/** Which point to open the map at: the step's start (it is in the list of points). */
export function initialPoint(step: Pick<Step, 'mapLocation' | 'resourceSpots'>): number {
  const points = stepPoints(step);
  const start = step.mapLocation;
  const i = start ? points.findIndex((p) => same(p, start)) : 0;
  return Math.max(0, i);
}
