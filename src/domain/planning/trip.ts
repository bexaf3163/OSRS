import type { RouteBatch } from '../../services/worldRoutes';
import type { WorldPoint } from '../player/playerState';
import { TILES_PER_SECOND } from '../travel/travel';
import { acceptsDecision } from './scope';
import type { ActionCost, DecisionScope, Minutes } from './contracts';
import { noTime, sumMinutes } from './cost';

const pointKey = (p: WorldPoint) => `${p.x},${p.y},${p.plane}`;
const samePoint = (a: WorldPoint, b: WorldPoint) => pointKey(a) === pointKey(b);
const validPoint = (p: WorldPoint) => Number.isSafeInteger(p.x) && Number.isSafeInteger(p.y) && p.x >= 0 && p.y >= 0 && [0, 1, 2, 3].includes(p.plane);

/** Read worker evidence once. No path search, straight-line substitute, floor guess or transport invention occurs here. */
export function createWalkingCosts(scope: DecisionScope, batches: readonly RouteBatch[]) {
  const costs = new Map<string, Minutes | null>();
  for (const batch of batches) {
    if (!acceptsDecision(scope, batch.scope) || batch.targets.length !== batch.routes.length || !validPoint(batch.from)) continue;
    batch.targets.forEach((target, index) => {
      const key = `${pointKey(batch.from)}>${pointKey(target)}`, route = batch.routes[index];
      if (!validPoint(target) || route.status !== 'ESTIMATED' || route.tiles === null || !Number.isSafeInteger(route.tiles) || route.tiles < 0
        || route.path.length !== route.tiles + 1 || !route.source.trim() || !samePoint(route.path[0], batch.from)
        || !samePoint(route.path[route.path.length - 1], target) || batch.from.plane !== target.plane
        || route.path.some((point, i, path) => !validPoint(point) || point.plane !== batch.from.plane
          || (i > 0 && Math.max(Math.abs(point.x - path[i - 1].x), Math.abs(point.y - path[i - 1].y)) !== 1))) {
        costs.set(key, null);
        return;
      }
      const fast = route.tiles / TILES_PER_SECOND / 60, slow = fast * 2;
      costs.set(key, { fast, typical: (fast + slow) / 2, slow,
        source: `${route.source}; cached topology estimate, continuous running to walking; run energy is not predicted` });
    });
  }
  return (from: WorldPoint | null, to: WorldPoint): Minutes | null => {
    if (!from || !validPoint(from) || !validPoint(to)) return null;
    return samePoint(from, to) ? noTime() : costs.get(`${pointKey(from)}>${pointKey(to)}`) ?? null;
  };
}

export interface TripStop {
  at: WorldPoint;
  /** Omit only when this is an intermediate waypoint with no action. Unknown action duration is explicitly null. */
  service?: { component: Exclude<keyof ActionCost, 'travel'>; time: Minutes | null };
  /** Already priced by the shared acquisition engine, including the once-only planning margin and any fee. */
  payment?: number | null;
}

export interface TripItinerary { origin: WorldPoint | null; stops: readonly TripStop[] }

/** Distinct directed legs, grouped by origin for the existing worker. No geometric shortcut proves a connection. */
export function tripRouteRequests(trips: readonly TripItinerary[]): { from: WorldPoint; targets: WorldPoint[] }[] | null {
  const origins = new Map<string, { from: WorldPoint; targets: Map<string, WorldPoint> }>();
  let legs = 0;
  for (const trip of trips) {
    let from = trip.origin;
    if (from && !validPoint(from)) return null;
    for (const stop of trip.stops) {
      if (!validPoint(stop.at)) return null;
      if (from && !samePoint(from, stop.at)) {
        const key = pointKey(from), group = origins.get(key) ?? { from: { ...from }, targets: new Map<string, WorldPoint>() };
        const target = pointKey(stop.at);
        if (!group.targets.has(target)) {
          if (++legs > 512) return null; // Bound a whole planning transaction, not just one worker message.
          group.targets.set(target, { ...stop.at });
        }
        origins.set(key, group);
      }
      from = stop.at;
    }
  }
  return [...origins.values()].map(group => ({ from: group.from, targets: [...group.targets.values()] }));
}

/** One ordered itinerary for preparation, training, quests or funding. Every walk/service/payment occurs exactly once. */
export function costTrip(origin: WorldPoint | null, stops: readonly TripStop[], walk: ReturnType<typeof createWalkingCosts>): {
  cost: ActionCost; payment: number | null; destination: WorldPoint | null;
} {
  const parts: Record<keyof ActionCost, (Minutes | null)[]> = { prepare: [], travel: [], work: [], banking: [], exchange: [], switching: [] };
  let position = origin, payment: number | null = 0;
  for (const stop of stops) {
    parts.travel.push(walk(position, stop.at));
    if (stop.service) parts[stop.service.component].push(stop.service.time);
    if (stop.payment !== undefined) {
      payment = payment !== null && stop.payment !== null && Number.isSafeInteger(stop.payment) && stop.payment >= 0
        && Number.isSafeInteger(payment + stop.payment) ? payment + stop.payment : null;
    }
    position = stop.at;
  }
  return { cost: { prepare: sumMinutes(parts.prepare), travel: sumMinutes(parts.travel), work: sumMinutes(parts.work),
    banking: sumMinutes(parts.banking), exchange: sumMinutes(parts.exchange), switching: sumMinutes(parts.switching) }, payment, destination: position };
}
