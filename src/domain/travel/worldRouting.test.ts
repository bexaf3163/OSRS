import { describe, expect, it } from 'vitest';
import { appendFileSync } from 'node:fs';
import { collisionSubset, walkRoutes } from './worldRouting';
import { worldRoutingJson } from '../../data';

const point = (x: number, y: number) => ({ x, y, plane: 0 });
const synthetic = () => {
  const bytes = new Uint8Array(2048);
  return { set(x: number, y: number, flags: number) { const tile = y * 64 + x; bytes[tile >> 1] |= flags << ((tile & 1) * 4); },
    topology: () => collisionSubset({ source: { revision: 'fixture' }, regions: [{ x: 0, y: 0, bits: btoa(String.fromCharCode(...bytes)) }] }) };
};
describe('verified surface subset routing', () => {
  it('walks a real detour instead of passing through a wall or cutting its corner', () => {
    const grid = synthetic();
    // Route (1,1)->(1,2)->(2,2)->(3,2)->(3,1), with the direct edge walled.
    grid.set(1, 1, 1 | 2 | 8); grid.set(1, 2, 2); grid.set(2, 2, 2); grid.set(3, 1, 1);
    const topology = grid.topology();
    expect(topology.canStep(1, 1, 1, 0)).toBe(false);
    expect(topology.canStep(1, 1, 1, 1)).toBe(false);
    const route = walkRoutes(topology, point(1, 1), [point(3, 1)])[0];
    expect(route.status).toBe('ESTIMATED');
    expect(route.tiles).toBe(4);
    expect(route.path).toEqual([point(1, 1), point(1, 2), point(2, 2), point(3, 2), point(3, 1)]);
  });
  it('does not fabricate entrances, transports, paths across unknown regions or unreachable elapsed time', () => {
    const grid = synthetic(), topology = grid.topology();
    const routes = walkRoutes(topology, point(1, 1), [point(2, 1), point(70, 1), { ...point(1, 1), plane: 1 }]);
    expect(routes.every(route => route.status === 'UNKNOWN' && route.tiles === null && route.path.length === 0)).toBe(true);
    expect(walkRoutes(topology, point(70, 1), [point(1, 1)])[0].status).toBe('UNKNOWN');
  });
  it('keeps the source revision, limited coverage and work bound explicit', () => {
    const topology = collisionSubset(worldRoutingJson);
    expect(topology.covers(point(3208, 3214))).toBe(true);
    expect(topology.covers(point(3208, 3700))).toBe(false);
    expect(topology.covers({ ...point(3208, 3214), plane: 2 })).toBe(false);
    const result = walkRoutes(topology, point(3208, 3214), [point(3000, 3400)], 1)[0];
    expect(result.status).toBe('UNKNOWN');
    expect(result.source).toContain(worldRoutingJson.source.revision);
  });
});

describe('S52: worker route latency on the real surface', () => {
  it('a long-distance batch from Lumbridge stays bounded (p50 under 1.5 s, p95 under 3 s; the guard has load margin)', () => {
    const topology = collisionSubset(worldRoutingJson);
    // Varrock square, Falador park, Draynor bank, Al Kharid bank, Edgeville bank, Port Sarim docks.
    const targets = [point(3213, 3424), point(2994, 3376), point(3092, 3245), point(3269, 3167), point(3094, 3493), point(3029, 3217)];
    const times = Array.from({ length: 9 }, () => {
      const start = performance.now();
      const routes = walkRoutes(topology, point(3222, 3218), targets);
      expect(routes.filter(route => route.status === 'ESTIMATED').length).toBeGreaterThan(0);
      return performance.now() - start;
    }).sort((a, b) => a - b);
    if (process.env.PROBE) appendFileSync(process.env.PROBE, `routes p50=${times[4].toFixed(0)} p95=${times[8].toFixed(0)} ms\n`);
    expect(times[4]).toBeLessThan(1_500);
    expect(times[8]).toBeLessThan(3_000);
  }, 60_000);
});
