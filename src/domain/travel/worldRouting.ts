import type { WorldPoint } from '../player/playerState';

export interface CollisionSubset {
  source: { revision: string };
  regions: readonly { x: number; y: number; bits: string }[];
}
export interface WalkRoute {
  status: 'ESTIMATED' | 'UNKNOWN';
  source: string;
  tiles: number | null;
  path: readonly WorldPoint[];
  reason: string;
  /** UNKNOWN only: the reached tile closest to the target, so a cost layer may add a labelled door/stairs allowance. */
  nearest?: { tiles: number; gap: number };
}
const DELTAS = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]] as const;

/** Static surface topology only. Structural doors/walls remain blocked even when the dump opens them. */
export function collisionSubset(data: CollisionSubset) {
  const regions = new Map<string, Uint8Array>();
  for (const region of data.regions) {
    const bytes = Uint8Array.from(atob(region.bits), char => char.charCodeAt(0));
    if (bytes.length !== 2048 || !Number.isInteger(region.x) || !Number.isInteger(region.y)) throw new Error('Invalid collision subset');
    const key = `${region.x},${region.y}`;
    if (regions.has(key)) throw new Error('Duplicate collision region');
    regions.set(key, bytes);
  }
  function flags(x: number, y: number): number | null {
    const bytes = regions.get(`${Math.floor(x / 64)},${Math.floor(y / 64)}`);
    if (!bytes) return null;
    const tile = (y & 63) * 64 + (x & 63);
    return (bytes[tile >> 1] >> ((tile & 1) * 4)) & 15;
  }
  const north = (x: number, y: number) => { const f = flags(x, y); return f !== null && (f & 1) !== 0 && (f & 4) === 0 && flags(x, y + 1) !== null; };
  const east = (x: number, y: number) => { const f = flags(x, y); return f !== null && (f & 2) !== 0 && (f & 8) === 0 && flags(x + 1, y) !== null; };
  const cardinal = (x: number, y: number, dx: number, dy: number) => dx === 1 ? east(x, y) : dx === -1 ? east(x - 1, y) : dy === 1 ? north(x, y) : north(x, y - 1);
  return {
    source: `Shortest Path collision subset ${data.source.revision}`,
    covers: (p: WorldPoint) => p.plane === 0 && Number.isInteger(p.x) && Number.isInteger(p.y) && flags(p.x, p.y) !== null,
    canStep(x: number, y: number, dx: number, dy: number): boolean {
      if (flags(x, y) === null || Math.abs(dx) > 1 || Math.abs(dy) > 1 || !(dx || dy)) return false;
      if (!dx || !dy) return cardinal(x, y, dx, dy);
      // All four flanking cardinal edges must be open; never cut a wall corner diagonally.
      return cardinal(x, y, dx, 0) && cardinal(x, y, 0, dy) && cardinal(x + dx, y, 0, dy) && cardinal(x, y + dy, dx, 0);
    },
  };
}
export type SurfaceTopology = ReturnType<typeof collisionSubset>;

const DOOR_REACH = 10;

/** One bounded flood for all requested targets. Run in a worker, never a React render or RuneLite tick. */
export function walkRoutes(topology: SurfaceTopology, from: WorldPoint, targets: readonly WorldPoint[], limit = 150_000): WalkRoute[] {
  const unknown = (reason: string): WalkRoute => ({ status: 'UNKNOWN', source: topology.source, tiles: null, path: [], reason });
  if (!topology.covers(from)) return targets.map(() => unknown('Origin is outside the sourced surface coverage'));
  const key = (x: number, y: number) => `${x},${y}`;
  // Uncovered targets (upstairs, behind a door) are searched on the ground floor too, for the nearest reached tile.
  const remaining = new Set(targets.map(p => key(p.x, p.y)));
  const visited = new Map<string, number>([[key(from.x, from.y), 0]]);
  const points: WorldPoint[] = [from], parents: number[] = [-1], depth: number[] = [0];
  // An origin inside furniture or a booth ring (the Grand Exchange centre) cannot step anywhere: the search starts from the
  // nearest tiles that can, and every leg from it is only an allowance (UNKNOWN with `nearest`), never a checked path.
  const enclosed = !DELTAS.some(([dx, dy]) => topology.canStep(from.x, from.y, dx, dy));
  for (let r = 1; enclosed && r <= DOOR_REACH && points.length === 1; r++) {
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      const x = from.x + dx, y = from.y + dy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !DELTAS.some(([sx, sy]) => topology.canStep(x, y, sx, sy))) continue;
      visited.set(key(x, y), points.length);
      points.push({ x, y, plane: 0 });
      parents.push(-1);
      depth.push(r);
    }
  }
  let at = 0;
  while (at < points.length && at < limit && remaining.size) {
    const p = points[at];
    remaining.delete(key(p.x, p.y));
    for (const [dx, dy] of DELTAS) {
      const id = key(p.x + dx, p.y + dy);
      if (visited.has(id) || !topology.canStep(p.x, p.y, dx, dy)) continue;
      visited.set(id, points.length);
      points.push({ x: p.x + dx, y: p.y + dy, plane: 0 });
      parents.push(at);
      depth.push(depth[at] + 1);
    }
    at++;
  }
  // A door or stairs ends most unreached legs within a few tiles of a reached one.
  const nearest = (target: WorldPoint) => {
    let best: { tiles: number; gap: number } | undefined;
    for (let i = 0; i < points.length; i++) {
      const gap = Math.max(Math.abs(points[i].x - target.x), Math.abs(points[i].y - target.y));
      const total = gap + depth[i], bestTotal = best ? best.gap + best.tiles : Infinity;
      // Shortest estimate first; on a tie, the fewest unchecked tiles.
      if (gap <= DOOR_REACH && (total < bestTotal || (total === bestTotal && gap < best!.gap))) best = { tiles: depth[i], gap };
    }
    return best;
  };
  const miss = (target: WorldPoint, reason: string): WalkRoute => {
    const near = nearest(target);
    return near ? { ...unknown(reason), nearest: near } : unknown(reason);
  };
  return targets.map(target => {
    if (!topology.covers(target)) return miss(target, 'Destination needs an entrance, floor change or another data source');
    const index = visited.get(key(target.x, target.y));
    if (index === undefined || enclosed) return miss(target, enclosed ? 'The origin tile is enclosed; the route starts from the nearest open tile' : at >= limit ? 'Bounded route search reached its work limit' : 'No sourced outdoor connection; doors and transports may be required');
    const path: WorldPoint[] = [];
    for (let i = index; i >= 0; i = parents[i]) path.push(points[i]);
    path.reverse();
    return { status: 'ESTIMATED', source: topology.source, tiles: path.length - 1, path,
      reason: 'Collision-checked cached outdoor topology; current game-cache match, dynamic obstacles and movement speed are not verified' };
  });
}
