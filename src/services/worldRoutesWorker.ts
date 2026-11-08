import { worldRoutingJson } from '../data';
import { collisionSubset, walkRoutes } from '../domain/travel/worldRouting';
import type { RouteBatch, RouteRequest } from './worldRoutes';

const topology = collisionSubset(worldRoutingJson);
// Bounded geometry cache has no player facts, balances or conditional transport access.
const cache = new Map<string, RouteBatch['routes']>();
self.addEventListener('message', (event: MessageEvent<RouteRequest>) => {
  const { id, scope, from, targets } = event.data;
  try {
    const key = JSON.stringify([from, targets]);
    let routes = cache.get(key);
    if (!routes) {
      routes = walkRoutes(topology, from, targets);
      if (cache.size >= 8) cache.delete(cache.keys().next().value!);
      cache.set(key, routes);
    }
    self.postMessage({ id, result: { scope, from, targets, routes } satisfies RouteBatch });
  } catch { self.postMessage({ id, result: null }); }
});
