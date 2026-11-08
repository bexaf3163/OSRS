import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestTripRoutes } from './tripRoutes';
import { requestWorldRoutes } from './worldRoutes';
import type { RouteBatch } from './worldRoutes';
import { costTrip, createWalkingCosts } from '../domain/planning/trip';
import type { TripItinerary } from '../domain/planning/trip';
import type { DecisionStamp } from '../domain/planning/scope';
import { noTime, totalCost } from '../domain/planning/cost';

vi.mock('./worldRoutes', () => ({ requestWorldRoutes: vi.fn(), WORLD_ROUTE_TARGET_LIMIT: 128 }));
const request = vi.mocked(requestWorldRoutes);
const stamp: DecisionStamp = { characterId: 'fixture', mode: 'f2p', gameSessionId: 'login', snapshotRevision: 1, revision: 1 };
const point = (x: number) => ({ x, y: 3200, plane: 0 });
const minutes = (n: number) => ({ ...noTime(), fast: n, typical: n, slow: n });
function reply(scope: RouteBatch['scope'], from: RouteBatch['from'], targets: RouteBatch['targets']): RouteBatch {
  return { scope, from, targets, routes: targets.map(target => {
    const path = Array.from({ length: Math.abs(target.x - from.x) + 1 }, (_, index) => point(from.x + Math.sign(target.x - from.x) * index));
    return { status: 'ESTIMATED', tiles: path.length - 1, path, source: 'Synthetic sourced topology', reason: 'Not a live route' };
  }) };
}
beforeEach(() => { request.mockReset(); request.mockImplementation(async (...args) => reply(...args)); });

describe('complete itinerary through the existing route worker', () => {
  it('requests every directed initial, bank, exchange, work and return leg once and reuses actual trip costing', async () => {
    const trip: TripItinerary = { origin: point(3000), stops: [
      { at: point(3002), service: { component: 'banking', time: minutes(1) } },
      { at: point(3005), service: { component: 'exchange', time: minutes(2) }, payment: 1100 },
      { at: point(3009), service: { component: 'work', time: minutes(10) } },
      { at: point(3002), service: { component: 'banking', time: minutes(1) } },
    ] };
    const batches = await requestTripRoutes(stamp, [trip, trip], () => stamp);
    expect(request.mock.calls.map(([, from, targets]) => [from.x, targets.map(p => p.x)])).toEqual([
      [3000, [3002]], [3002, [3005]], [3005, [3009]], [3009, [3002]],
    ]);
    const costs = costTrip(trip.origin, trip.stops, createWalkingCosts(stamp, batches!));
    expect(totalCost(costs.cost)?.typical).toBeCloseTo(14 + costs.cost.travel!.typical);
    expect(costs.cost.travel!.typical).toBeGreaterThan(0);
    expect(costs.payment).toBe(1100); // Once-only quotes arrive already priced.
    expect(costs.destination).toEqual(point(3002));
  });

  it('groups common origins and splits them within the existing worker target limit', async () => {
    const trips = Array.from({ length: 130 }, (_, index) => ({ origin: point(3000), stops: [{ at: point(3001 + index) }] }));
    const batches = await requestTripRoutes(stamp, trips, () => stamp);
    expect(request.mock.calls.map(([, , targets]) => targets.length)).toEqual([128, 2]);
    expect(batches?.flatMap(batch => batch.targets).map(p => p.x)).toEqual(trips.map(trip => trip.stops[0].at.x));
  });

  it('drops stale success before requesting another origin, including an intent change without a game event', async () => {
    for (const change of [{ characterId: 'other' }, { mode: 'members' as const }, { gameSessionId: 'new' },
      { snapshotRevision: 2 }, { revision: 2 }, null]) {
      request.mockClear();
      let current: DecisionStamp | null = stamp;
      let finish!: (batch: RouteBatch) => void;
      request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
      const job = requestTripRoutes(stamp, [{ origin: point(3000), stops: [{ at: point(3002) }, { at: point(3005) }] }], () => current);
      expect(request).toHaveBeenCalledTimes(1);
      current = change === null ? null : { ...stamp, ...change };
      finish(reply(stamp, point(3000), [point(3002)]));
      expect(await job).toBeNull();
      expect(request).toHaveBeenCalledTimes(1);
    }
  });

  it('refuses stale starts, excessive transactions and invalid coordinates before dispatch', async () => {
    expect(await requestTripRoutes(stamp, [], () => ({ ...stamp, revision: 2 }))).toBeNull();
    const excessive = Array.from({ length: 513 }, (_, index) => ({ origin: point(3000), stops: [{ at: point(3001 + index) }] }));
    expect(await requestTripRoutes(stamp, excessive, () => stamp)).toBeNull();
    for (const at of [{ ...point(3002), x: 1.5 }, { ...point(3002), plane: 4 }]) {
      expect(await requestTripRoutes(stamp, [{ origin: point(3000), stops: [{ at }] }], () => stamp)).toBeNull();
    }
    expect(request).not.toHaveBeenCalled();
  });

  it('preserves unknown origins and unsupported routes rather than substituting geometric distance', async () => {
    const trip = { origin: null, stops: [{ at: point(3002) }, { at: point(3005) }] };
    request.mockImplementationOnce(async (scope, from, targets) => ({ scope, from, targets,
      routes: [{ status: 'UNKNOWN', tiles: null, path: [], source: 'Sourced boundary', reason: 'Door not modelled' }] }));
    const batches = await requestTripRoutes(stamp, [trip], () => stamp);
    expect(request.mock.calls[0][1]).toEqual(point(3002));
    expect(costTrip(trip.origin, trip.stops, createWalkingCosts(stamp, batches!)).cost.travel).toBeNull();
    expect(await requestTripRoutes(stamp, [{ origin: point(3000), stops: [{ at: point(3000) }] }], () => stamp)).toEqual([]);
  });

  it('rejects mismatched replies, failures and unavailable workers without returning a partially trusted itinerary', async () => {
    const trip = { origin: point(3000), stops: [{ at: point(3002) }, { at: point(3005) }] };
    const valid = reply(stamp, trip.origin, [point(3002)]);
    for (const response of [null, { ...valid, scope: { ...stamp, snapshotRevision: 2 } },
      { ...valid, from: point(2999) }, { ...valid, targets: [point(3003)] }, { ...valid, routes: [] }]) {
      request.mockResolvedValueOnce(response);
      expect(await requestTripRoutes(stamp, [trip], () => stamp)).toBeNull();
    }
    request.mockRejectedValueOnce(Error('Worker unavailable'));
    expect(await requestTripRoutes(stamp, [trip], () => stamp)).toBeNull();
  });

  it('copies the complete itinerary before awaiting a reply, without borrowing mutable later stops', async () => {
    const trips = [{ origin: point(3000), stops: [{ at: point(3002) }, { at: point(3005) }] }];
    let finish!: (batch: RouteBatch) => void;
    request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const job = requestTripRoutes(stamp, trips, () => stamp);
    trips[0].stops[1].at.x = 3100;
    trips[0].origin.x = 2999;
    finish(reply(stamp, point(3000), [point(3002)]));
    expect(await job).not.toBeNull();
    expect(request.mock.calls.at(-1)?.slice(1)).toEqual([point(3002), [point(3005)]]);
  });
});
