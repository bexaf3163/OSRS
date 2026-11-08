import { acceptsCommit, acceptsDecision } from '../domain/planning/scope';
import type { DecisionStamp } from '../domain/planning/scope';
import { tripRouteRequests } from '../domain/planning/trip';
import type { TripItinerary } from '../domain/planning/trip';
import { requestWorldRoutes, WORLD_ROUTE_TARGET_LIMIT } from './worldRoutes';
import type { RouteBatch } from './worldRoutes';

/** One transaction through the existing coalesced worker; a new owner goal invalidates even same-snapshot replies. */
export async function requestTripRoutes(decision: DecisionStamp, trips: readonly TripItinerary[], current: () => DecisionStamp | null): Promise<RouteBatch[] | null> {
  const stamp = { ...decision }, requests = tripRouteRequests(trips);
  if (!requests || !acceptsCommit(current(), stamp)) return null;
  const batches: RouteBatch[] = [];
  for (const request of requests) {
    // Sequential origins preserve the worker's single-running/latest-queued bound instead of coalescing away our own legs.
    for (let at = 0; at < request.targets.length; at += WORLD_ROUTE_TARGET_LIMIT) {
      if (!acceptsCommit(current(), stamp)) return null;
      let batch: RouteBatch | null;
      const targets = request.targets.slice(at, at + WORLD_ROUTE_TARGET_LIMIT);
      try { batch = await requestWorldRoutes(stamp, request.from, targets); }
      catch { return null; }
      if (!acceptsCommit(current(), stamp) || !batch || !acceptsDecision(stamp, batch.scope)
        || !samePoint(batch.from, request.from) || batch.targets.length !== targets.length || batch.routes.length !== targets.length
        || batch.targets.some((target, index) => !samePoint(target, targets[index]))) return null;
      batches.push(batch);
    }
  }
  return acceptsCommit(current(), stamp) ? batches : null;
}

function samePoint(a: RouteBatch['from'], b: RouteBatch['from']): boolean {
  return a.x === b.x && a.y === b.y && a.plane === b.plane;
}
