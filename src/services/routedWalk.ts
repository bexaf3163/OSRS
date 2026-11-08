// Real walking tiles for the live "how to get there" advice (2.82.7): the legs from the player and to the target come from
// the shared route worker, so a teleport is not judged against a straight line through rivers and walls. The legs are
// listed by running the options once with a recording walk; one search from the player and one from the target answer
// them (walking is taken as the same both ways). A leg without a route keeps the straight line, which its option names.
import { requestWorldRoutes, WORLD_ROUTE_TARGET_LIMIT, type RouteBatch } from './worldRoutes';
import { STAIRS_TILES_PER_FLOOR, type Point, type TravelInput } from '../domain/travel/travel';
import type { DecisionScope } from '../domain/planning/contracts';

type Walk = NonNullable<TravelInput['walk']>;
const key = (p: Point) => `${p.x},${p.y},${p.plane}`;

/** Tiles per routed target: the route, or for an enclosed target the nearest reached tile plus its labelled allowance. */
function tilesOf(batch: RouteBatch | null, from: Point): Map<string, number> {
  const out = new Map<string, number>();
  batch?.targets.forEach((target, index) => {
    const route = batch.routes[index];
    const tiles = route?.status === 'ESTIMATED' ? route.tiles
      : route?.nearest ? route.nearest.tiles + route.nearest.gap + STAIRS_TILES_PER_FLOOR * Math.abs(target.plane - from.plane) : null;
    if (tiles !== null && tiles !== undefined) out.set(key(target), tiles);
  });
  return out;
}

/** The walk lookup for `run`'s legs between `from` and `to`; `run` is called once with a recorder to list them. */
export async function routedWalk(scope: DecisionScope, from: Point, to: Point, run: (walk: Walk) => unknown): Promise<Walk> {
  const ends = new Map<string, Point>(), starts = new Map<string, Point>();
  run((a, b) => {
    if (key(a) === key(from)) ends.set(key(b), b);
    else if (key(b) === key(to)) starts.set(key(a), a);
    return null;
  });
  const fromHere = await requestWorldRoutes(scope, from, [...ends.values()].slice(0, WORLD_ROUTE_TARGET_LIMIT), 'travel');
  const toTarget = await requestWorldRoutes(scope, to, [...starts.values()].slice(0, WORLD_ROUTE_TARGET_LIMIT), 'travel');
  const here = tilesOf(fromHere, from), there = tilesOf(toTarget, to);
  return (a, b) => (key(a) === key(from) ? here.get(key(b)) : key(b) === key(to) ? there.get(key(a)) : undefined) ?? null;
}
