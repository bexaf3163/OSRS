// The ways between the surface, the separate areas and the dungeons: ladders, trapdoors, holes, cave entrances. A target in another layer
// than the player used to give only "Target is underground - find the way down" (The Corsair Curse, 2026-10-17: Chief Tess is in a cave whose
// entrance is a hole on the beach, nowhere near the cave's coordinates). The plugin now points at the way in or out.
//
// The data is the Shortest Path plugin's transport table (Skretzo/shortest-path, BSD 2-Clause, see THIRD_PARTY_NOTICES.md): only the rows that
// cross from one layer to another. Built by scripts/build-portals.ts into src/data/portals.json; the plugin reads that file (Portals.java).

/** 0 the surface, 1 a separate area (the Stronghold of Security, Zanaris, instances), 2 a dungeon. The same split as Navigation.java. */
export function layerOf(y: number): 0 | 1 | 2 {
  return y > 6400 ? 2 : y >= 4200 ? 1 : 0;
}

/** One way from a tile in one layer to a tile in another. */
export interface Portal {
  x: number;
  y: number;
  plane: number;
  toX: number;
  toY: number;
  toPlane: number;
  /** The object's id (the ladder, the hole); 0 when the row names none. */
  id: number;
  /** The game's menu words: "Climb-down Ladder", "Enter Hole". */
  action: string;
  /** What it needs, as the table says it (a skill level, an item, a quest, a variable); empty when nothing. */
  req: string;
}

const COORD = /^(\d{1,5}) (\d{1,5}) (\d)$/;

/**
 * The cross-layer rows of transports.tsv. Columns: origin "x y plane", destination "x y plane", "menuOption menuTarget objectID", skills, items,
 * quests, varbits, varplayers, duration, display info. A row that does not read is skipped, never guessed.
 */
export function parseTransports(tsv: string): { portals: Portal[]; floors: Portal[]; skipped: number } {
  const portals: Portal[] = [];
  const floors: Portal[] = [];
  let skipped = 0;
  for (const raw of tsv.split(/\r?\n/)) {
    if (!raw.trim() || raw.startsWith('#')) continue;
    const c = raw.split('\t');
    const o = COORD.exec((c[0] ?? '').trim());
    const d = COORD.exec((c[1] ?? '').trim());
    if (!o || !d) { skipped++; continue; }
    const [x, y, plane] = [Number(o[1]), Number(o[2]), Number(o[3])];
    const [toX, toY, toPlane] = [Number(d[1]), Number(d[2]), Number(d[3])];
    const sameLayer = layerOf(y) === layerOf(toY);
    if (sameLayer && plane === toPlane) continue;
    const menu = (c[2] ?? '').trim();
    const idMatch = /\s(\d+)$/.exec(menu);
    const id = idMatch ? Number(idMatch[1]) : 0;
    const action = (idMatch ? menu.slice(0, idMatch.index) : menu).trim();
    const req = [c[3], c[4], c[5], c[6], c[7]].map((s) => (s ?? '').trim()).filter(Boolean).join('; ');
    (sameLayer ? floors : portals).push({ x, y, plane, toX, toY, toPlane, id, action, req });
  }
  return { portals, floors, skipped };
}

/**
 * One row per way: the table lists the same ladder from each tile around it (four rows for one ladder). Rows with the same object, action
 * and destination become one, at the middle one of their tiles.
 */
export function dedupePortals(list: Portal[]): Portal[] {
  const groups = new Map<string, Portal[]>();
  for (const p of list) {
    const key = `${p.id}|${p.action}|${p.toX},${p.toY},${p.toPlane}|${p.req}|${p.id === 0 ? `${p.x},${p.y}` : ''}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const out: Portal[] = [];
  for (const g of groups.values()) {
    // Same object, same way: tiles more than a few steps apart are two different doors of the same kind, kept apart.
    const clusters: Portal[][] = [];
    for (const p of g) {
      const c = clusters.find((k) => Math.max(Math.abs(k[0].x - p.x), Math.abs(k[0].y - p.y)) <= 3 && k[0].plane === p.plane);
      if (c) c.push(p);
      else clusters.push([p]);
    }
    for (const c of clusters) {
      const mx = c.reduce((s, p) => s + p.x, 0) / c.length;
      const my = c.reduce((s, p) => s + p.y, 0) / c.length;
      const mid = [...c].sort((a, b) => Math.hypot(a.x - mx, a.y - my) - Math.hypot(b.x - mx, b.y - my))[0];
      out.push(mid);
    }
  }
  out.sort((a, b) => a.x - b.x || a.y - b.y || a.plane - b.plane || a.toX - b.toX || a.toY - b.toY);
  return out;
}

/** How far from the target a staircase or ladder may come out and still be the way up to its floor: the same building. */
export const FLOOR_REACH = 20;
/** How far from the player a way down may be: the building the player is in. */
export const FLOOR_NEAR = 40;

/**
 * The staircase or ladder to take toward a target on another floor of the same layer (Arsen in the central hut, a floor up), or null. Only the first
 * flight. Up: the one that comes out nearest the target (the target's building). Down: the one nearest the player (out of the building the player is
 * in, wherever the target is). The same rules as Portals.pickFloor.
 */
export function pickFloor(floors: readonly Portal[], px: number, py: number, pplane: number, tx: number, ty: number, tplane: number): Portal | null {
  if (layerOf(py) !== layerOf(ty) || pplane === tplane) return null;
  const up = tplane > pplane;
  let best: Portal | null = null;
  let bestScore = Infinity;
  for (const pass of [false, true]) {
    for (const p of floors) {
      if (Boolean(p.req) !== pass || p.plane !== pplane || (p.toPlane > p.plane) !== up) continue;
      const toTarget = dist(p.toX, p.toY, tx, ty);
      const toPlayer = dist(p.x, p.y, px, py);
      if (up ? toTarget > FLOOR_REACH : toPlayer > FLOOR_NEAR) continue;
      const score = up ? toTarget + toPlayer / 10 : toPlayer + toTarget / 100;
      if (score < bestScore) { best = p; bestScore = score; }
    }
    if (best) return best;
  }
  return null;
}

/** The compact row the file holds: [x, y, plane, toX, toY, toPlane, id, action, req]. */
export type PortalRow = [number, number, number, number, number, number, number, string, string];

export const toRow = (p: Portal): PortalRow => [p.x, p.y, p.plane, p.toX, p.toY, p.toPlane, p.id, p.action, p.req];
export const fromRow = (r: PortalRow): Portal => ({ x: r[0], y: r[1], plane: r[2], toX: r[3], toY: r[4], toPlane: r[5], id: r[6], action: r[7], req: r[8] });

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** How far from a way's far end a target may be and still be "this way's area". Dungeons are big; two different ones are farther apart. */
export const AREA_REACH = 400;
/** How far a way out may be from a player inside: the same dungeon. */
export const EXIT_REACH = 250;

/**
 * The way to take from the player's tile toward a target in another layer, or null (same layer, or nothing fits). The same rules as Portals.java
 * (which the plugin runs): into an area, the way whose far end is nearest the target; out of one, a way near the player whose far end is nearest the
 * target. A way with a requirement is only taken when no free one fits.
 */
export function pickPortal(portals: readonly Portal[], px: number, py: number, tx: number, ty: number): Portal | null {
  const from = layerOf(py);
  const to = layerOf(ty);
  if (from === to) return null;
  const direct = portals.filter((p) => layerOf(p.y) === from && layerOf(p.toY) === to);
  const score = (p: Portal): number | null => {
    if (to !== 0) {
      const d = dist(p.toX, p.toY, tx, ty);
      return d <= AREA_REACH ? d + dist(p.x, p.y, px, py) / 1000 : null;
    }
    const near = dist(p.x, p.y, px, py);
    return near <= EXIT_REACH ? dist(p.toX, p.toY, tx, ty) + near / 10 : null;
  };
  let best: Portal | null = null;
  let bestScore = Infinity;
  for (const pass of [false, true]) {
    for (const p of direct) {
      if (Boolean(p.req) !== pass) continue;
      const s = score(p);
      if (s !== null && s < bestScore) { best = p; bestScore = s; }
    }
    if (best) return best;
  }
  return null;
}
