// "How to get there": from the player's position (the plugin, /status → pos) to the step target — on foot, by teleport or by canoe.
// The distances are straight lines (the obstacles are unknown), so this is a comparison of options, not an exact time. What is available now
// is decided by the levels and things from the game; what we do not know (the bank was not opened) is marked, not invented.

import transportJson from '../data/transport.json';
import netJson from '../data/transportNet.json';
import locationsJson from '../data/majorLocations.json';
import { nameKey } from './checklist';
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

export interface FairyRing { code: string; x: number; y: number; place: string; note: string; underground: boolean }
export interface CharterPort { id: string; name: string; x: number; y: number; note: string }
export interface Tablet { id: string; item: string; spell: string }

/** Fairy rings, charter ports with the fare table and the teleport tablets: generated from the wiki by scripts/build-transport-net.ts. */
export const NET = netJson as unknown as {
  checked: string;
  fairyRings: FairyRing[];
  charter: { ports: CharterPort[]; fares: (number | null)[][] };
  tablets: Tablet[];
};

const LOCATIONS = (locationsJson as unknown as { locations: Record<string, { x: number; y: number; plane: number; label: string; kind: string }> }).locations;
/** Where tablets and runes are bought. */
export const EXCHANGE: Point & { label: string } = { x: LOCATIONS['Grand Exchange'].x, y: LOCATIONS['Grand Exchange'].y, plane: 0, label: 'Grand Exchange' };
const BANKS: (Point & { label: string })[] = Object.values(LOCATIONS).filter((l) => l.kind === 'bank' && l.plane === 0).map((l) => ({ x: l.x, y: l.y, plane: l.plane, label: l.label }));

/** Running is 2 tiles per tick (0.6 s): that is the lower bound of the walking time. */
export const TILES_PER_SECOND = 2 / 0.6;

/** A gain smaller than this number of tiles is not worth runes or charges: the option is not shown. */
export const MIN_SAVING_TILES = 20;

/**
 * Opportunistic routing: a teleport the player does not carry is offered only if going to get it first is clearly worth it: it saves at least this many
 * tiles after the detour, the detour itself is short, and the price is small (an unknown price is shown as unknown, never as zero).
 */
export const OPPORTUNISTIC_MIN_SAVING_TILES = 60;
export const OPPORTUNISTIC_MAX_DETOUR_TILES = 120;
export const OPPORTUNISTIC_MAX_COST = 3000;

export const dist = (a: Point, b: Point): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export type Availability = 'ready' | 'maybe' | 'locked';
export interface Need { text: string; ok: boolean | null }

export interface Leg { kind: 'walk' | 'teleport' | 'canoe' | 'boat' | 'fairy' | 'charter'; label: string; tiles: number }
/** Fetching a teleport item first: from the bank (free) or from the exchange (a price). The app only suggests it; it never buys. */
export interface Acquire { what: string; where: string; point: Point; tiles: number; cost: number | null; source: 'bank' | 'exchange' }
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
  /** The option starts with fetching an item (opportunistic routing). */
  acquire?: Acquire;
  /** The first place to go to: the fairy ring, the port, the bank or the exchange. The "lead here" button uses it. */
  go?: Point & { label: string };
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
  /** What the bank holds, by nameKey; null or absent means unknown. */
  bank?: ReadonlyMap<string, number> | null;
  /** The exchange price per piece by name; absent means no prices (an unknown price is never taken as zero). */
  priceOf?: (name: string) => number | undefined;
  /** A members account or world: false locks the members-only ways, null or absent means unknown. */
  members?: boolean | null;
  /** Seconds until the Home Teleport can be cast again (from the game); null or absent means it is ready or unknown. */
  homeCooldownSec?: number | null;
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
  if (t.kind === 'home') {
    // The game's cooldown: a locked way with the time left, not a promise the button will work.
    const left = inp.homeCooldownSec ?? 0;
    if (left > 0) return { needs: [{ text: `Home Teleport is on cooldown: ready in ${cooldownText(left)}`, ok: false }], availability: 'locked' };
    return { needs: [], availability: 'ready' };
  }
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

/** "12 min" or "45 s". */
export function cooldownText(seconds: number): string {
  return seconds < 90 ? `${Math.max(1, Math.round(seconds))} s` : `${Math.ceil(seconds / 60)} min`;
}

const needFrom = (have: boolean | null, bankSeen: boolean): boolean | null => (have === null ? null : have ? true : bankSeen ? false : null);

const membersNeed = (members: boolean | null | undefined): Need => ({ text: 'a members account', ok: members === undefined ? null : members });

/** A fairy ring pair: the nearest ring to the player and the ring nearest to the target (surface rings only: a straight line says nothing underground). */
function fairyOption(inp: TravelInput): TravelOption | null {
  const rings = NET.fairyRings.filter((r) => !r.underground);
  let best: { a: FairyRing; b: FairyRing; tiles: number } | null = null;
  for (const a of rings) {
    for (const b of rings) {
      if (a.code === b.code) continue;
      const tiles = dist(inp.from, { ...a, plane: 0 }) + dist({ ...b, plane: 0 }, inp.to);
      if (!best || tiles < best.tiles) best = { a, b, tiles };
    }
  }
  if (!best) return null;
  const { a, b } = best;
  const staff = inp.carried ? count(inp.carried, ['Dramen staff', 'Lunar staff']) > 0 : null;
  const needs: Need[] = [
    membersNeed(inp.members),
    { text: 'Fairytale II - Cure a Queen started (the Fairy Godfather)', ok: null },
    { text: 'a dramen or lunar staff worn or in the bag (not needed after the elite Lumbridge diary)', ok: needFrom(staff, inp.bankSeen) },
  ];
  for (const r of [a, b]) if (r.note) needs.push({ text: `ring ${r.code}: ${r.note}`, ok: null });
  const locked = needs.some((n) => n.ok === false);
  const unsure = needs.some((n) => n.ok === null);
  return {
    id: 'fairy', title: `Fairy ring ${a.code} → ${b.code}`,
    legs: [
      { kind: 'walk', label: `to the fairy ring ${a.code} (${a.place})`, tiles: dist(inp.from, { ...a, plane: 0 }) },
      { kind: 'fairy', label: `code ${a.code} → ${b.code}: ${b.place}`, tiles: 0 },
      { kind: 'walk', label: 'then on foot', tiles: dist({ ...b, plane: 0 }, inp.to) },
    ],
    walkTiles: best.tiles, availability: locked ? 'locked' : unsure ? 'maybe' : 'ready', needs,
    go: { x: a.x, y: a.y, plane: 0, label: `Fairy ring ${a.code} — ${a.place}` },
  };
}

/** The cheapest charter pair by tiles on foot (a tie goes to the lower fare); a pair with no route (fare null) is skipped. */
function charterOption(inp: TravelInput): TravelOption | null {
  const { ports, fares } = NET.charter;
  let best: { i: number; j: number; tiles: number; fare: number } | null = null;
  for (let i = 0; i < ports.length; i++) {
    for (let j = 0; j < ports.length; j++) {
      const fare = fares[i]?.[j];
      if (i === j || fare === null || fare === undefined) continue;
      const tiles = dist(inp.from, { ...ports[i], plane: 0 }) + dist({ ...ports[j], plane: 0 }, inp.to);
      if (!best || tiles < best.tiles || (tiles === best.tiles && fare < best.fare)) best = { i, j, tiles, fare };
    }
  }
  if (!best) return null;
  const a = ports[best.i];
  const b = ports[best.j];
  const coins = inp.carried ? count(inp.carried, ['Coins']) : null;
  const needs: Need[] = [
    membersNeed(inp.members),
    { text: `${best.fare} gp in coins${coins !== null ? ` (in the bag: ${coins})` : ''}`, ok: needFrom(coins === null ? null : coins >= best.fare, inp.bankSeen) },
  ];
  for (const p of [a, b]) if (p.note) needs.push({ text: `${p.name}: ${p.note}`, ok: null });
  const locked = needs.some((n) => n.ok === false);
  const unsure = needs.some((n) => n.ok === null);
  return {
    id: 'charter', title: `Charter ship ${a.name} → ${b.name}`,
    legs: [
      { kind: 'walk', label: `to the dock ${a.name}`, tiles: dist(inp.from, { ...a, plane: 0 }) },
      { kind: 'charter', label: `charter ship for ${best.fare} gp`, tiles: 0 },
      { kind: 'walk', label: `from ${b.name} to the target`, tiles: dist({ ...b, plane: 0 }, inp.to) },
    ],
    walkTiles: best.tiles, availability: locked ? 'locked' : unsure ? 'maybe' : 'ready', needs,
    note: 'The fare is halved with Cabin Fever done or a Ring of Charos worn.',
    go: { x: a.x, y: a.y, plane: 0, label: `Charter dock — ${a.name}` },
  };
}

/** Where to fetch an item from: the nearest bank if the bank is known to hold it, otherwise the exchange. */
function acquireFor(item: string, inp: TravelInput): Acquire {
  if (inp.bank?.get(nameKey(item))) {
    const bank = BANKS.reduce<(Point & { label: string }) | null>((m, c) => (!m || dist(inp.from, c) < dist(inp.from, m) ? c : m), null);
    if (bank) return { what: item, where: bank.label, point: bank, tiles: dist(inp.from, bank), cost: 0, source: 'bank' };
  }
  return { what: item, where: EXCHANGE.label, point: EXCHANGE, tiles: dist(inp.from, EXCHANGE), cost: inp.priceOf?.(item) ?? null, source: 'exchange' };
}

/**
 * Teleport tablets and the Chronicle: a tablet in the bag is simply a ready option; one the player does not carry is offered by way of the bank or the
 * exchange only when it is worth it (OPPORTUNISTIC_* limits). The runes of a spell are not fetched this way. The app only suggests: it never buys.
 */
function itemTeleportOptions(inp: TravelInput, direct: number): TravelOption[] {
  const out: TravelOption[] = [];
  const entries: { id: string; item: string; title: string; dest: Teleport['dest']; note?: string; plain: boolean }[] = [];
  for (const tb of NET.tablets) {
    const spell = TRANSPORT.teleports.find((t) => t.id === tb.spell);
    if (spell) entries.push({ id: tb.id, item: tb.item, title: `${tb.item} tablet`, dest: spell.dest, plain: true });
  }
  for (const t of TRANSPORT.teleports) {
    if (t.kind === 'item' && t.items?.length) entries.push({ id: t.id, item: t.items[0], title: t.name, dest: t.dest, plain: false, ...(t.note ? { note: t.note } : {}) });
  }
  for (const e of entries) {
    const tail = dist(e.dest, inp.to);
    const carried = inp.carried ? count(inp.carried, [e.item]) > 0 : null;
    if (carried === true) {
      // The Chronicle in the bag is already in the plain teleport list.
      if (e.plain) {
        out.push({ id: e.id, title: e.title, legs: [{ kind: 'teleport', label: `${e.item} → ${e.dest.label}`, tiles: 0 }, { kind: 'walk', label: 'then on foot', tiles: tail }],
          walkTiles: tail, availability: 'ready', needs: [{ text: `${e.item} in the bag`, ok: true }] });
      }
      continue;
    }
    const acq = acquireFor(e.item, inp);
    const total = acq.tiles + tail;
    const worth = direct - total >= OPPORTUNISTIC_MIN_SAVING_TILES && acq.tiles <= OPPORTUNISTIC_MAX_DETOUR_TILES && (acq.cost === null || acq.cost <= OPPORTUNISTIC_MAX_COST);
    if (!worth) continue;
    const coins = inp.carried ? count(inp.carried, ['Coins']) : null;
    const afford = acq.source === 'bank' || acq.cost === null || coins === null ? null : needFrom(coins >= acq.cost, inp.bankSeen);
    const verb = acq.source === 'bank' ? 'withdraw' : 'buy';
    const price = acq.source === 'bank' ? 'free' : acq.cost === null ? 'price unknown' : `~${acq.cost} gp`;
    out.push({
      id: `${e.id}-acquire`, title: `${e.item}: ${verb} first, then teleport`,
      legs: [
        { kind: 'walk', label: `to the ${acq.where}: ${verb} ${e.item} (${price})`, tiles: acq.tiles },
        { kind: 'teleport', label: `${e.item} → ${e.dest.label}`, tiles: 0 },
        { kind: 'walk', label: 'then on foot', tiles: tail },
      ],
      walkTiles: total, availability: afford === false ? 'locked' : 'maybe',
      needs: [{ text: acq.source === 'bank' ? `${e.item} in the bank (${acq.where})` : `${e.item} from the ${acq.where} (${price})`, ok: afford }],
      acquire: acq, go: { ...acq.point, label: acq.where },
      ...(e.note ? { note: e.note } : {}),
    });
  }
  return out;
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

  // Fairy rings and charter ships (members), and the tablets that may have to be fetched first.
  // On a known free-to-play account the members-only ways are left out: they are noise there, not "not yet".
  const fairy = inp.members === false ? null : fairyOption(inp);
  if (fairy) out.push(fairy);
  const charter = inp.members === false ? null : charterOption(inp);
  if (charter) out.push(charter);
  out.push(...itemTeleportOptions(inp, direct));

  const rank = (o: TravelOption) => (o.availability === 'ready' ? 0 : o.availability === 'maybe' ? 1 : 2);
  return out.filter((o) => o.id === 'walk' || o.walkTiles + MIN_SAVING_TILES <= direct).sort((x, y) => rank(x) - rank(y) || x.walkTiles - y.walkTiles);
}

/** "40 tiles · running at least 12 s": the lower bound — obstacles, combat and energy make it longer. */
export function walkText(tiles: number): string {
  if (tiles <= 0) return 'on the spot';
  const sec = Math.ceil(tiles / TILES_PER_SECOND);
  return `${tiles} tiles · running at least ${sec < 90 ? `${sec} s` : `${Math.round(sec / 60)} min`}`;
}
