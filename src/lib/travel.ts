// "How to get there": from the player's position (the plugin, /status → pos) to the step target — on foot, by teleport or by canoe.
// The distances are straight lines (the obstacles are unknown), so this is a comparison of options, not an exact time. What is available now
// is decided by the levels and things from the game; what we do not know (the bank was not opened) is marked, not invented.

import transportJson from '../data/transport.json';
import type { GearItem } from '../services/runeliteBridge';

export interface Point { x: number; y: number; plane: number }
export interface Teleport {
  id: string;
  kind: 'home' | 'spell' | 'item';
  name: string;
  magic?: number;
  runes?: Record<string, number>;
  items?: string[];
  dest: Point & { label: string };
  cooldownMin?: number;
  note?: string;
}
export interface CanoeStation { id: string; name: string; x: number; y: number; plane: number; wakaOnly?: boolean }
export interface CanoeType { name: string; level: number; stops: number }

export interface Boat { id: string; name: string; from: Point & { label: string }; to: Point & { label: string }; cost: number; note?: string }

export const TRANSPORT = transportJson as unknown as {
  checked: string;
  teleports: Teleport[];
  boats: Boat[];
  canoe: { stations: CanoeStation[]; types: CanoeType[]; axes: string[] };
};

/** Running is 2 tiles per tick (0.6 s): that is the lower bound of the walking time. */
export const TILES_PER_SECOND = 2 / 0.6;

/** A gain smaller than this number of tiles is not worth runes or charges: the option is not shown. */
export const MIN_SAVING_TILES = 20;

export const dist = (a: Point, b: Point): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export type Availability = 'ready' | 'maybe' | 'locked';
export interface Need { text: string; ok: boolean | null }

export interface Leg { kind: 'walk' | 'teleport' | 'canoe' | 'boat'; label: string; tiles: number }
export interface TravelOption {
  id: string;
  title: string;
  legs: Leg[];
  /** Tiles on foot over all legs (a straight line). */
  walkTiles: number;
  availability: Availability;
  /** What is missing or what to check: a level, runes, a book. */
  needs: Need[];
  note?: string;
}

export interface TravelInput {
  from: Point;
  to: Point;
  /** Levels from the game or entered by hand. */
  levels: Readonly<Record<string, number | undefined>>;
  /** Equipped items and the bag from the game; null — no game. */
  carried: readonly GearItem[] | null;
  /** The bank was opened (an item missing from the bag may be in the bank). */
  bankSeen: boolean;
}

const count = (items: readonly GearItem[], names: readonly string[]): number =>
  items.filter((i) => names.includes(i.name)).reduce((s, i) => s + (i.count ?? 1), 0);

const STAFF_OF: Record<string, string[]> = {
  air: ['Staff of air', 'Air battlestaff', 'Mystic air staff'],
  fire: ['Staff of fire', 'Fire battlestaff', 'Mystic fire staff', 'Lava battlestaff', 'Mystic lava staff'],
  water: ['Staff of water', 'Water battlestaff', 'Mystic water staff'],
  earth: ['Staff of earth', 'Earth battlestaff', 'Mystic earth staff'],
};
const runeName = (rune: string): string => `${rune[0].toUpperCase()}${rune.slice(1)} rune`;

function teleportNeeds(t: Teleport, inp: TravelInput): { needs: Need[]; availability: Availability } {
  if (t.kind === 'home') return { needs: [], availability: 'ready' };
  if (t.kind === 'item') {
    const have = inp.carried ? count(inp.carried, t.items ?? []) > 0 : null;
    // Not on hand and the bank was opened: it is not anywhere nearby; the bank was not opened: it may be lying there.
    const ok = have === null ? null : have ? true : inp.bankSeen ? false : null;
    return {
      needs: [{ text: `${t.items![0]} on you (charges: Check charges)`, ok }],
      availability: ok === false ? 'locked' : 'maybe',
    };
  }
  const needs: Need[] = [];
  const lvl = inp.levels.magic;
  let locked = false;
  let unsure = false;
  if (t.magic) {
    const ok = lvl === undefined ? null : lvl >= t.magic;
    needs.push({ text: `Magic ${t.magic}${lvl !== undefined ? ` (you have ${lvl})` : ''}`, ok });
    if (ok === false) locked = true;
    if (ok === null) unsure = true;
  }
  for (const [rune, qty] of Object.entries(t.runes ?? {})) {
    if (inp.carried && STAFF_OF[rune] && count(inp.carried, STAFF_OF[rune]) > 0) {
      needs.push({ text: `${runeName(rune)} ×${qty} — replaces the staff`, ok: true });
      continue;
    }
    const have = inp.carried ? count(inp.carried, [runeName(rune)]) : null;
    const ok = have === null ? null : have >= qty ? true : inp.bankSeen ? false : null;
    needs.push({ text: `${runeName(rune)} ×${qty}${have !== null ? ` (in the bag: ${have})` : ''}`, ok });
    if (ok === false) locked = true;
    if (ok === null) unsure = true;
  }
  return { needs, availability: locked ? 'locked' : unsure ? 'maybe' : 'ready' };
}

/** The possible ways to get there: the available ones first, within them by tiles on foot. The useless ones (not shorter on foot) are not shown. */
export function travelOptions(inp: TravelInput): TravelOption[] {
  const out: TravelOption[] = [];
  const direct = dist(inp.from, inp.to);
  out.push({ id: 'walk', title: 'On foot', legs: [{ kind: 'walk', label: 'running in a straight line', tiles: direct }], walkTiles: direct, availability: 'ready', needs: [] });

  for (const t of TRANSPORT.teleports) {
    const tail = dist(t.dest, inp.to);
    const { needs, availability } = teleportNeeds(t, inp);
    out.push({
      id: t.id, title: t.name,
      legs: [{ kind: 'teleport', label: `${t.name} → ${t.dest.label}`, tiles: 0 }, { kind: 'walk', label: 'then on foot', tiles: tail }],
      walkTiles: tail, availability, needs, ...(t.note ? { note: t.note } : {}),
    });
  }

  // A canoe: the best pair of stations — from the player to station A, down the river to B (no farther than the canoe type allows), from B to the target.
  const stations = TRANSPORT.canoe.stations;
  const types = TRANSPORT.canoe.types;
  let best: { a: number; b: number; tiles: number; type: CanoeType } | null = null;
  for (let a = 0; a < stations.length; a++) {
    for (let b = 0; b < stations.length; b++) {
      if (a === b) continue;
      const stops = Math.abs(a - b);
      const type = types.find((ty) => ty.stops >= stops && (!stations[b].wakaOnly || ty.name === 'Waka'));
      if (!type) continue;
      const tiles = dist(inp.from, stations[a]) + dist(stations[b], inp.to);
      if (!best || tiles < best.tiles) best = { a, b, tiles, type };
    }
  }
  if (best && best.tiles + MIN_SAVING_TILES <= direct) {
    const wc = inp.levels.woodcutting;
    const hasAxe = inp.carried ? count(inp.carried, TRANSPORT.canoe.axes) > 0 : null;
    const levelOk = wc === undefined ? null : wc >= best.type.level;
    const a = stations[best.a];
    const b = stations[best.b];
    out.push({
      id: 'canoe', title: `Canoe ${a.name} → ${b.name}`,
      legs: [
        { kind: 'walk', label: `to station ${a.name}`, tiles: dist(inp.from, a) },
        { kind: 'canoe', label: `${best.type.name}: ${Math.abs(best.a - best.b)} stops`, tiles: 0 },
        { kind: 'walk', label: `from station ${b.name} to the target`, tiles: dist(b, inp.to) },
      ],
      walkTiles: best.tiles,
      availability: levelOk === false ? 'locked' : levelOk === null || hasAxe === null ? 'maybe' : 'ready',
      needs: [
        { text: `Woodcutting ${best.type.level} for ${best.type.name}${wc !== undefined ? ` (you have ${wc})` : ''}`, ok: levelOk },
        { text: 'any axe (can be left at the station)', ok: hasAxe },
      ],
    });
  }

  // Boats: pier to pier for 30 coins.
  for (const b of TRANSPORT.boats) {
    const tiles = dist(inp.from, b.from) + dist(b.to, inp.to);
    const coins = inp.carried ? count(inp.carried, ['Coins']) : null;
    const ok = coins === null ? null : coins >= b.cost ? true : inp.bankSeen ? false : null;
    out.push({
      id: b.id, title: b.name,
      legs: [
        { kind: 'walk', label: `to ${b.from.label}`, tiles: dist(inp.from, b.from) },
        { kind: 'boat', label: `boat for ${b.cost} gp`, tiles: 0 },
        { kind: 'walk', label: `from ${b.to.label} to the target`, tiles: dist(b.to, inp.to) },
      ],
      walkTiles: tiles,
      availability: ok === false ? 'locked' : ok ? 'ready' : 'maybe',
      needs: [{ text: `${b.cost} gp in coins${coins !== null ? ` (in the bag: ${coins})` : ''}`, ok }],
      ...(b.note ? { note: b.note } : {}),
    });
  }

  const rank = (o: TravelOption) => (o.availability === 'ready' ? 0 : o.availability === 'maybe' ? 1 : 2);
  return out.filter((o) => o.id === 'walk' || o.walkTiles + MIN_SAVING_TILES <= direct).sort((x, y) => rank(x) - rank(y) || x.walkTiles - y.walkTiles);
}

/** "40 tiles · running at least 12 s": the lower bound — obstacles, combat and energy make it longer. */
export function walkText(tiles: number): string {
  if (tiles <= 0) return 'on the spot';
  const sec = Math.ceil(tiles / TILES_PER_SECOND);
  return `${tiles} tiles · running at least ${sec < 90 ? `${sec} s` : `${Math.round(sec / 60)} min`}`;
}
