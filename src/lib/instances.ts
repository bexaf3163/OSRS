// Instanced areas: the game shows them at template coordinates that are not places on the overworld map.
// A point there is good for the arrow and the highlights inside the instance, and never for a route over the world map.

import type { Point } from './travel';

/** Template regions of the instances on the F2P route: the Misthalin Mystery manor. */
const INSTANCES: { x0: number; x1: number; y0: number; y1: number }[] = [
  { x0: 1600, x1: 1700, y0: 4800, y1: 4880 },
];

export function isInstancedPoint(p: Pick<Point, 'x' | 'y'> | null | undefined): boolean {
  return !!p && INSTANCES.some((r) => p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1);
}

/**
 * The surface of the world map. Dungeons and caves are drawn on a copy of the map far to the north (the same x, y + 6400), and the special areas lie
 * between the two: a straight line from the surface to any of them is not a distance, so nothing is routed over it.
 */
export const OVERWORLD_MAX_Y = 4200;
export function isOverworld(p: Pick<Point, 'y'> | null | undefined): boolean {
  return !!p && p.y < OVERWORLD_MAX_Y;
}
