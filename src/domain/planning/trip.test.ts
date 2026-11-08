import { describe, expect, it } from 'vitest';
import type { RouteBatch } from '../../services/worldRoutes';
import type { DecisionScope } from './contracts';
import { noTime, totalCost } from './cost';
import { costTrip, createWalkingCosts } from './trip';

const scope: DecisionScope = { characterId: 'fixture', mode: 'f2p', gameSessionId: 'login', snapshotRevision: 1 };
const point = (x: number, plane = 0) => ({ x, y: 3200, plane });
function batch(from: number, to: number): RouteBatch {
  const path = Array.from({ length: Math.abs(to - from) + 1 }, (_, index) => point(from + Math.sign(to - from) * index));
  return { scope, from: point(from), targets: [point(to)], routes: [{ status: 'ESTIMATED', source: 'Synthetic sourced topology',
    tiles: path.length - 1, path, reason: 'Fixture, not live topology' }] };
}
const time = (n: number) => ({ ...noTime(), fast: n, typical: n, slow: n });

describe('shared full-trip cost', () => {
  it('prices a door or stairs leg as a labelled allowance from the nearest reached tile, never a silent straight line', () => {
    const near = (to: ReturnType<typeof point>): RouteBatch => ({ scope, from: point(3000), targets: [to], routes: [{ status: 'UNKNOWN', source: 'Synthetic sourced topology', tiles: null, path: [], reason: 'door', nearest: { tiles: 20, gap: 4 } }] });
    const walk = createWalkingCosts(scope, [near(point(3024)), near(point(3024, 1))]);
    const ground = walk(point(3000), point(3024))!, upstairs = walk(point(3000), point(3024, 1))!;
    expect(ground.fast * 60).toBeCloseTo(24 / (2 / 0.6), 5);
    expect(ground.source).toContain('the last 4 tiles (door or stairs) are an allowance');
    expect(upstairs.fast).toBeGreaterThan(ground.fast);
    // A route the search could not get near stays unknown.
    expect(createWalkingCosts(scope, [batch(3000, 3002), { ...near(point(3050)), routes: [{ status: 'UNKNOWN', source: 'x', tiles: null, path: [], reason: 'far' }] }])(point(3000), point(3050))).toBeNull();
  });

  it('includes initial preparation, bank, exchange, work and return legs exactly once', () => {
    const walk = createWalkingCosts(scope, [batch(3000, 3002), batch(3002, 3005), batch(3005, 3009), batch(3009, 3002)]);
    const trip = costTrip(point(3000), [
      { at: point(3002), service: { component: 'banking', time: time(1) } },
      { at: point(3005), service: { component: 'exchange', time: time(2) }, payment: 1100 },
      { at: point(3009), service: { component: 'work', time: time(10) } },
      { at: point(3002), service: { component: 'banking', time: time(1) } },
    ], walk);
    const travel = [walk(point(3000), point(3002))!, walk(point(3002), point(3005))!, walk(point(3005), point(3009))!, walk(point(3009), point(3002))!];
    expect(trip.cost.travel?.typical).toBeCloseTo(travel.reduce((n, t) => n + t.typical, 0));
    expect(totalCost(trip.cost)?.typical).toBeCloseTo(14 + trip.cost.travel!.typical);
    expect(trip.payment).toBe(1100); // No second price buffer.
    expect(trip.destination).toEqual(point(3002));
  });
  it('never borrows geometry from another profile, mode, login or snapshot', () => {
    const evidence = batch(3000, 3002);
    for (const change of [{ characterId: 'other' }, { mode: 'members' as const }, { gameSessionId: 'another' }, { snapshotRevision: 2 }]) {
      expect(createWalkingCosts(scope, [{ ...evidence, scope: { ...scope, ...change } }])(point(3000), point(3002))).toBeNull();
    }
  });
  it('keeps unknown legs, unsupported floors, actions and prices unknown', () => {
    const walk = createWalkingCosts(scope, [batch(3000, 3002)]);
    expect(walk(null, point(3002))).toBeNull();
    expect(walk(point(3000), point(3002, 1))).toBeNull();
    expect(walk(point(3002), point(3000))).toBeNull(); // Direction/conditional access cannot be guessed.
    expect(walk(point(3000), point(3000))?.typical).toBe(0);
    const trip = costTrip(point(3000), [{ at: point(3002), service: { component: 'exchange', time: null }, payment: null },
      { at: point(3008) }], walk);
    expect(totalCost(trip.cost)).toBeNull();
    expect(trip.cost.travel).toBeNull();
    expect(trip.cost.exchange).toBeNull();
    expect(trip.payment).toBeNull();
  });
  it('refuses mismatched route evidence and invalid payments instead of treating them as free', () => {
    const evidence = batch(3000, 3002);
    for (const route of [{ ...evidence.routes[0], tiles: 1 }, { ...evidence.routes[0], source: '' },
      { ...evidence.routes[0], path: [point(2999), point(3000), point(3002)] },
      { ...evidence.routes[0], path: [point(3000), point(3100), point(3002)] },
      { ...evidence.routes[0], path: [point(3000), point(3001, 1), point(3002)] },
      { ...evidence.routes[0], path: [point(3000), { ...point(3001), y: 3200.5 }, point(3002)] }]) {
      expect(createWalkingCosts(scope, [{ ...evidence, routes: [route] }])(point(3000), point(3002))).toBeNull();
    }
    const walk = createWalkingCosts(scope, [evidence]);
    for (const payment of [-1, NaN, .5]) expect(costTrip(point(3000), [{ at: point(3002), payment }], walk).payment).toBeNull();
    expect(costTrip(point(3000), [], walk).cost.travel?.typical).toBe(0);
  });
});
