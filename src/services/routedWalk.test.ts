import { describe, expect, it, vi } from 'vitest';
import type { RouteBatch } from './worldRoutes';

const request = vi.fn();
vi.mock('./worldRoutes', () => ({ WORLD_ROUTE_TARGET_LIMIT: 128, requestWorldRoutes: (...args: unknown[]) => request(...args) }));
const { routedWalk } = await import('./routedWalk');

const at = (x: number, y: number, plane = 0) => ({ x, y, plane });
const scope = { characterId: 'fixture', mode: 'f2p' as const, gameSessionId: 'login', snapshotRevision: 1 };

describe('real walks for the live travel advice', () => {
  it('asks the travel lane from the player and from the target, and keeps the straight line where no route is known', async () => {
    const from = at(3200, 3200), to = at(3300, 3300), landing = at(3290, 3290), island = at(3100, 3100);
    request.mockImplementation(async (_s: unknown, origin: typeof from, targets: (typeof from)[], lane: string): Promise<RouteBatch> => {
      expect(lane).toBe('travel');
      return {
        scope, from: origin, targets,
        routes: targets.map((t) => t === island
          ? { status: 'UNKNOWN', source: 'test', tiles: null, path: [], reason: 'water' }
          : t.x === landing.x ? { status: 'UNKNOWN', source: 'test', tiles: null, path: [], reason: 'door', nearest: { tiles: 30, gap: 4 } }
            : { status: 'ESTIMATED', source: 'test', tiles: 180, path: [], reason: 'route' }),
      };
    });
    const walk = await routedWalk(scope, from, to, (w) => { w(from, to); w(landing, to); w(island, to); });
    expect(request).toHaveBeenCalledTimes(2);
    expect(walk(from, to)).toBe(180);
    expect(walk(landing, to)).toBe(34);
    expect(walk(island, to)).toBeNull();
    expect(walk(at(1, 1), at(2, 2))).toBeNull();
  });
});
