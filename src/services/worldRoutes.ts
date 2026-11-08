// Shared asynchronous route service. Static topology work stays off the renderer thread.
import type { DecisionScope } from '../domain/planning/contracts';
import type { WorldPoint } from '../domain/player/playerState';
import type { WalkRoute } from '../domain/travel/worldRouting';

export interface RouteBatch { scope: DecisionScope; from: WorldPoint; targets: readonly WorldPoint[]; routes: readonly WalkRoute[] }
export interface RouteRequest { id: number; scope: DecisionScope; from: WorldPoint; targets: readonly WorldPoint[] }
type Reply = { id: number; result: RouteBatch | null };
const TIMEOUT_MS = 15_000;
export const WORLD_ROUTE_TARGET_LIMIT = 128;
let worker: Worker | null = null, sequence = 0;
/** Who asks: the planner's legs, or the live travel advice (2.82.7). Each keeps its own latest waiting request, so one
 * caller never cancels the other's; the planner goes first. */
export type RouteLane = 'planner' | 'travel';
let inFlight: number | null = null;
const queued = new Map<RouteLane, RouteRequest>();
const pending = new Map<number, { resolve: (value: RouteBatch | null) => void; timer: ReturnType<typeof setTimeout> }>();

function finish(id: number, result: RouteBatch | null) {
  const request = pending.get(id);
  if (!request) return;
  clearTimeout(request.timer);
  pending.delete(id);
  request.resolve(result);
}
function dispatch() {
  const lane: RouteLane | undefined = queued.has('planner') ? 'planner' : queued.has('travel') ? 'travel' : undefined;
  if (!worker || inFlight !== null || !lane) return;
  const request = queued.get(lane)!;
  queued.delete(lane);
  inFlight = request.id;
  try { worker.postMessage(request); }
  catch { releaseWorldRoutes(); }
}
export function releaseWorldRoutes(): void {
  worker?.terminate();
  worker = null;
  inFlight = null;
  queued.clear();
  for (const id of [...pending.keys()]) finish(id, null);
}

/** A timeout/unavailable worker is UNKNOWN. It never supplies straight-line distances as walking cost. */
export function requestWorldRoutes(scope: DecisionScope, from: WorldPoint, targets: readonly WorldPoint[], lane: RouteLane = 'planner'): Promise<RouteBatch | null> {
  if (!targets.length || targets.length > WORLD_ROUTE_TARGET_LIMIT) return Promise.resolve(null);
  try {
    if (!worker) {
      const instance = new Worker(new URL('./worldRoutesWorker.ts', import.meta.url), { type: 'module' });
      worker = instance;
      instance.onmessage = (event: MessageEvent<Reply>) => {
        if (worker !== instance || event.data.id !== inFlight) return;
        finish(event.data.id, event.data.result);
        inFlight = null;
        dispatch();
      };
      instance.onerror = () => { if (worker === instance) releaseWorldRoutes(); };
    }
    // Coalesce before posting: one running search and one latest request per lane, rather than a worker message backlog.
    const old = queued.get(lane);
    if (old) finish(old.id, null);
    const id = ++sequence;
    return new Promise(resolve => {
      const timer = setTimeout(() => { if (pending.has(id)) releaseWorldRoutes(); }, TIMEOUT_MS);
      pending.set(id, { resolve, timer });
      queued.set(lane, { id, scope: { ...scope }, from: { ...from }, targets: targets.map(target => ({ ...target })) });
      dispatch();
    });
  } catch { return Promise.resolve(null); }
}
