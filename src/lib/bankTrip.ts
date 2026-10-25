// The walk from a spot to its bank and back, banking included: one rule for every spot that banks, the combat training spots
// (combatRoute/spots.ts) and the gathering spots (skillingRates.ts), so a fix to the walk reaches both.

import locationsJson from '../data/majorLocations.json';
import { BANKS, bankTiles, dist, TILES_PER_SECOND, type Point } from './travel';

/** A spot as the bank trip needs it: where it is, the way in (ladders into a dungeon) and the named bank of majorLocations.json. */
export interface BankedSpot { place: Point; waypoints?: Point[]; bank?: string }

const LOCATIONS = (locationsJson as unknown as { locations: Record<string, Point & { label: string; kind: string }> }).locations;

/** Seconds at the bank (open it, deposit, take the food) and on each ladder or door between the bank and the spot: the fast and the slow end. */
const BANK_SECONDS: [number, number] = [20, 45];
const CLIMB_SECONDS: [number, number] = [5, 15];
/** A straight line on the map is the fast end of a walk; paths around rivers, fences and buildings make the slow end this much longer, at walking pace. */
const WINDING = 1.4;

/** Tiles between two stops of a way: on one map, straight; down a ladder into a dungeon under the same place (6400 tiles north), from the point above. */
function legTiles(a: Point, b: Point): number | null {
  if (a.plane === b.plane && Math.abs(a.y - b.y) < 1000) return dist(a, b);
  if (Math.abs(b.y - a.y - 6400) < 200) return dist(b, { x: a.x, y: a.y + 6400, plane: b.plane });
  return null;
}

/**
 * The spot's nearest bank and the minutes of one trip there and back, banking included: the straight line at running pace at the fast end, a winding path
 * at walking pace at the slow end, and the ladders on the way. A leg the map data cannot measure (a ladder into a separate area) counts only its climb.
 */
export function bankTrip(spot: BankedSpot, bankSeconds: readonly [number, number] = BANK_SECONDS): { bank: Point & { label: string }; tiles: number; minutes: [number, number] } | null {
  const way: Point[] = spot.waypoints?.length ? spot.waypoints : [spot.place];
  const entrance = way[0];
  const named = spot.bank ? LOCATIONS[spot.bank] : undefined;
  if (!named && !BANKS.length) return null;
  const bank = named ? { x: named.x, y: named.y, plane: named.plane, label: named.label } : BANKS.reduce((a, b) => (bankTiles(entrance, b) < bankTiles(entrance, a) ? b : a));
  let tiles = bankTiles(entrance, bank);
  let climbs = 0;
  for (let i = 1; i < way.length; i++) {
    const leg = legTiles(way[i - 1], way[i]);
    if (leg === null || leg !== dist(way[i - 1], way[i])) climbs++;
    tiles += leg ?? 0;
  }
  return { bank, tiles, minutes: tripMinutes(tiles, climbs, bankSeconds) };
}

/**
 * Minutes of one trip to a bank and back, banking included, for a walk of this many tiles each way (and ladders): the straight line at running pace
 * at the fast end, a winding path at walking pace at the slow end. 0 tiles: banking where one stands. bank: the seconds at the bank, fast and slow
 * (a fighter's visit by default; a processing visit is a preset deposit and withdrawal, processingRates.ts).
 */
export function tripMinutes(tiles: number, climbs = 0, bank: readonly [number, number] = BANK_SECONDS): [number, number] {
  const seconds = (pace: number, factor: number, i: 0 | 1) => (2 * tiles * factor) / pace + bank[i] + 2 * climbs * CLIMB_SECONDS[i];
  return [seconds(TILES_PER_SECOND, 1, 0) / 60, seconds(TILES_PER_SECOND / 2, WINDING, 1) / 60];
}

