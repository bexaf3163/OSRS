// The OSRS Wiki world map: tiles, floors and the step's points.
// The wiki's own map cannot be embedded: oldschool.runescape.wiki answers with X-Frame-Options: DENY and
// frame-ancestors 'none', so we draw the map ourselves from the same tiles (maps.runescape.wiki,
// Access-Control-Allow-Origin: *). A tile of scale z is 256x256 points, a game tile is 2^z points.

import type { MapLocation, Step } from '../types';

/** The map render version the wiki currently shows (checked 26 Sep 2026). */
export const MAP_VERSION = '2026-08-12_a';
const TILE_ROOT = `https://maps.runescape.wiki/osrs/versions/${MAP_VERSION}/tiles/rendered`;

export const MIN_ZOOM = -3;
export const MAX_ZOOM = 3;
export const DEFAULT_ZOOM = 2;
export const TILE = 256;

export const MAP_ATTRIBUTION = 'Map © OSRS Wiki (Weird Gloop), game © Jagex';

/** A world map tile (mapId 0 is the surface and the dungeons of the main world). */
export function tileUrl(zoom: number, plane: number, tx: number, ty: number): string {
  return `${TILE_ROOT}/0/${zoom}/${plane}_${tx}_${ty}.png`;
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
export function tilesAround(p: { x: number; y: number; plane: number }, zoom: number, width: number, height: number, anchorY = 0.5): PlacedTile[] {
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
        url: tileUrl(zoom, p.plane, tx, ty),
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
