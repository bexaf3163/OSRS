// "How to get there": from the player's position (the plugin, /status → pos) to the step target — on foot, by teleport or by canoe.
// The distances are straight lines (the obstacles are unknown), so this is a comparison of options, not an exact time. What is available now
// is decided by the levels and things from the game; what we do not know (the bank was not opened) is marked, not invented.

import transportJson from '../data/transport.json';
import netJson from '../data/transportNet.json';
import locationsJson from '../data/majorLocations.json';
import { nameKey } from './checklist';
import type { GearItem } from '../services/runeliteBridge';
import { isInstancedPoint, isOverworld } from './instances';

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
  /** How long the cast itself takes, in seconds (the wiki's upper bound): counted against the saving. Absent means it is short or not known. */
  castSeconds?: number;
  /** A charged item (the Chronicle): what charges it, how many charges one gives, the most it holds. */
  charges?: { item: string; perItem: number; max: number; note?: string };
  note?: string;
}
/** A staff that, wielded, gives unlimited runes of its elements. */
export interface RuneStaff { item: string; runes: string[]; members: boolean }
export interface CanoeStation { id: string; name: string; x: number; y: number; plane: number; wakaOnly?: boolean; /** The station attendant (River Dougne). */ npc?: string }

/**
 * A node of a network that goes from node to node (spirit trees, gnome gliders). quest / departQuest / check are what must be true to arrive or to leave
 * from it; the game's completed-quest list answers the first two, a check is something the game does not tell (shown as "not checked").
 */
export interface NetNode {
  id: string; name: string; x: number; y: number; plane: number;
  /** The person to talk to (a glider captain). */
  npc?: string;
  /** Needed to use this node at all. */
  quest?: string;
  /** Needed only to leave from this node. */
  departQuest?: string;
  check?: string;
  /** A one-way destination: nothing leaves from it (the crashed glider at Lemanto Andra). */
  arriveOnly?: boolean;
  /** A walk the straight line does not see (the Gnome Maze), in tiles. */
  extraTiles?: number;
  note?: string;
}
export interface SpiritTreeNet { quest: string; overheadSeconds: number; trees: NetNode[]; note?: string }
/** Gliders fly from the hub to every station and from every station to the hub only: a trip between two outer stations is two flights. */
export interface GliderNet { quest: string; hub: string; overheadSeconds: number; stations: NetNode[]; note?: string }
/** The Cowbell amulet: one item name for two states, told apart by the item id the game reports (empty or charged). */
export interface CowbellWay {
  item: string; emptyId: number; chargedId: number; chargeWith: string; maxCharges: number; castSeconds: number; maxWilderness: number;
  dest: Point & { label: string }; note?: string;
}
export interface CanoeType { name: string; level: number; stops: number }

/** A ferry or a boat from pier to pier. needs: what the wiki says must be true first (a quest started), listed as "not checked" because the app cannot read it. */
export interface Boat { id: string; name: string; from: Point & { label: string }; to: Point & { label: string }; cost: number; note?: string; needs?: string[] }

/**
 * A teleport that exists once, from a person: walk to them, talk, arrive. Whether the player already used it is not in the game's data, so it is a
 * possible way ("maybe"), and it is dropped once the route step that uses it is closed (TravelInput.oneTimeUsed).
 */
export interface OneTimeWay {
  id: string;
  name: string;
  at: Point & { label: string };
  dest: Point & { label: string };
  /** The route step that is the use of it: closed means used. */
  usedAfter: string;
  /** What must be true, in a few words (it is "not checked": the app cannot read it). */
  needs: string;
  note?: string;
}

export const TRANSPORT = transportJson as unknown as {
  checked: string;
  teleports: Teleport[];
  oneTime?: OneTimeWay[];
  /** Networks a route step opens, by the step that opens them (done, not skipped): data, so a new network or a moved milestone needs no code. */
  unlocks?: Record<string, { afterStep: string; note?: string }>;
  boats: Boat[];
  staves: { list: RuneStaff[] };
  canoe: { stations: CanoeStation[]; types: CanoeType[]; axes: string[] };
  /** The River Dougne canoes (members): the same canoe types as the River Lum, stations in river order. */
  dougne?: { members: boolean; stations: CanoeStation[]; note?: string };
  spiritTrees?: SpiritTreeNet;
  gliders?: GliderNet;
  cowbell?: CowbellWay;
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
/** The banks: the nearest one is where a missing item is taken from. One upstairs (Lumbridge Castle's top floor) costs the climb as well. */
export const BANKS: (Point & { label: string })[] = Object.values(LOCATIONS).filter((l) => l.kind === 'bank').map((l) => ({ x: l.x, y: l.y, plane: l.plane, label: l.label }));
/** The stairs to a bank on an upper floor and back down, as tiles of running per floor: a straight line on the map does not see them. */
export const STAIRS_TILES_PER_FLOOR = 15;
/** The walk to a bank as a stop: the straight line, and the stairs between the player's floor and the bank's. */
export const bankTiles = (from: Point, bank: Point): number => dist(from, bank) + Math.abs(bank.plane - from.plane) * STAIRS_TILES_PER_FLOOR;

/** Running is 2 tiles per tick (0.6 s): that is the lower bound of the walking time. */
export const TILES_PER_SECOND = 2 / 0.6;

/** A gain smaller than this number of tiles is not worth runes or charges: the option is not shown. */
export const MIN_SAVING_TILES = 20;

/**
 * Opportunistic routing: a teleport the player does not carry is offered only if going to get it first is clearly worth it: it saves at least this many
 * tiles after the detour, the detour itself is short, and the price is small (an unknown price is shown as unknown, never as zero).
 */
// Relaxed in 2.39: 60 and 120 tiles starved the live routes. The detour is already counted in the saving (direct - (fetch + tail)), so a separate tight cap
// on the fetch only hid worthwhile shortcuts: it is now a sanity limit, and 40 tiles (about 12 s of running) is enough saving to say so.
export const OPPORTUNISTIC_MIN_SAVING_TILES = 40;
/** The fetch cap for local vendors, crafting NPCs and banks: a short walk, or it is not worth leaving the route. */
export const OPPORTUNISTIC_MAX_DETOUR_TILES = 300;
/** The Grand Exchange sells everything, so a longer walk to it is worth it (Al Kharid, Lumbridge and Port Sarim are 320 to 400 tiles away). */
export const OPPORTUNISTIC_MAX_EXCHANGE_TILES = 500;
export const OPPORTUNISTIC_MAX_COST = 3000;

/** Why a fetch-first suggestion was dropped (or kept with a caveat). The same reasons are used for the purchase detours in detours.ts. */
export type DetourRejection = 'exceeds_detour_limit' | 'insufficient_savings' | 'price_unknown' | 'missing_coins' | 'not_whitelisted' | 'price_too_high' | 'no_source';

export interface DetourDecision {
  /** What was judged: an item name, or the stop for a group of items. */
  subject: string;
  outcome: 'offered' | 'rejected';
  reason?: DetourRejection;
  /** An offered suggestion with a caveat: the price is unknown, or the coins in the bag do not cover it. */
  caveat?: 'price_unknown' | 'missing_coins';
  /** The numbers behind the verdict, in tiles unless said otherwise. */
  detail: Record<string, number | string | null>;
}

const decisionSink: { log: ((d: DetourDecision) => void) | null } = { log: null };
/** The debug sink: set it to see every verdict (tests, the developer console). */
export function setDetourLog(fn: ((d: DetourDecision) => void) | null): void {
  decisionSink.log = fn;
}
/** Record a verdict: to the caller's callback, to the debug sink, and to the console when localStorage "osrs-put:debug-fetch" is "1". */
export function emitDecision(d: DetourDecision, extra?: (d: DetourDecision) => void): void {
  extra?.(d);
  decisionSink.log?.(d);
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('osrs-put:debug-fetch') === '1') console.debug('[fetch-first]', JSON.stringify(d));
  } catch { /* no storage */ }
}

export const dist = (a: Point, b: Point): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export type Availability = 'ready' | 'maybe' | 'locked';
/** A thing a way needs on hand: how many, how many are in the bag or worn, and how many the bank holds. null is "not known", never zero. */
export interface NeedItem { name: string; need: number; have: number | null; bank: number | null }
export interface Need {
  text: string;
  ok: boolean | null;
  /** Set when the need is a countable thing to carry (runes, coins, an axe). */
  item?: NeedItem;
  /** Something to do on the spot before using the way, with what is already on hand: "wield your Staff of fire", "use a Teleport card on the Chronicle". */
  action?: string;
}

/** Where a missing thing can be got, as the app's source router says (sourceRouter.ts): a shop, the exchange or a free spawn, with a place to lead to. */
export interface ItemSource { kind: 'shop' | 'exchange' | 'free'; where: string; point: Point; /** gp per piece; null: not known. */ price: number | null }

/** One stop of a preparation: the bank to withdraw from or the place to buy at, and what to get there. */
export interface PrepStop {
  action: 'withdraw' | 'buy' | 'take';
  where: string;
  point: Point;
  items: { name: string; qty: number; price: number | null }[];
  /** Tiles from the stop before (the first one: from the player, by the best way usable now). */
  tiles: number;
  via?: string;
}

/** What has to be done before a way can be used: only the remaining quantity is asked for, and the app never buys. */
export interface Preparation {
  stops: PrepStop[];
  missing: NeedItem[];
  /** gp for what is bought; null when a price is not known. */
  cost: number | null;
}

export interface Leg { kind: 'walk' | 'teleport' | 'canoe' | 'boat' | 'fairy' | 'charter' | 'spirit' | 'glider'; label: string; tiles: number }
/** Fetching a teleport item first: from the bank (free) or from the exchange (a price). The app only suggests it; it never buys. */
export interface Acquire { what: string; where: string; point: Point; tiles: number; cost: number | null; source: 'bank' | 'shop' | 'exchange'; /** The teleport that shortens the way there. */ via?: string }
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
  /** The option starts with getting what it lacks (runes, coins, an axe): where, what and how many. The walk to the stops is in walkTiles. */
  prepare?: Preparation;
  /** Time the transport itself takes, as tiles of running: a long cast counts against the saving. Absent means none is known. */
  overheadTiles?: number;
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
  /** The equipped items alone: a staff gives its runes only while wielded. null: not known; absent: not told apart (a staff anywhere counts). */
  worn?: readonly GearItem[] | null;
  /** The Chronicle's charges from the game's messages; null or absent: unknown (a thing to check, never zero). */
  chronicleCharges?: number | null;
  /** The bank was opened (an item missing from the bag may be in the bank). */
  bankSeen: boolean;
  /** What the bank holds, by nameKey; null or absent means unknown. */
  bank?: ReadonlyMap<string, number> | null;
  /** The exchange price per piece by name; absent means no prices (an unknown price is never taken as zero). */
  priceOf?: (name: string) => number | undefined;
  /** A members account or world: false locks the members-only ways, null or absent means unknown. */
  members?: boolean | null;
  /** The fairy ring network is unlocked (Fairytale II started): false leaves the rings out, null or absent means unknown. */
  fairyRings?: boolean | null;
  /** Seconds until the Home Teleport can be cast again (from the game); null or absent means it is ready or unknown. */
  homeCooldownSec?: number | null;
  /** false: the game did not tell whether the Home Teleport is ready (the cooldown is unknown, not zero). Absent: as before, ready unless on cooldown. */
  homeCooldownKnown?: boolean;
  /** The standard spellbook is active: false locks its spells, null is unknown (shown as a thing to check). Absent: not asked. */
  standardSpellbook?: boolean | null;
  /** Where a missing thing can be got (the app's source router). Absent: the runes, coins and tools of a way are not fetched, only what the bank holds. */
  sourceOf?: (name: string, need: number) => ItemSource | null;
  /** Called with the verdict on every fetch-first candidate: offered, or rejected with the reason. */
  onDecision?: (d: DetourDecision) => void;
  /** The ids of one-time ways the route says were used (OneTimeWay.usedAfter closed): they are not offered again. */
  oneTimeUsed?: readonly string[];
  /** The quests the game reports completed; null or absent: not known (an unlock is then a thing to check, never "locked"). */
  questsDone?: readonly string[] | null;
}

const count = (items: readonly GearItem[], names: readonly string[]): number =>
  items.filter((i) => names.includes(i.name)).reduce((s, i) => s + (i.count ?? 1), 0);

/** Every staff that stands in for a rune of a teleport (the wiki's elemental, battle, mystic and combination staves). */
export const STAFF_NAMES: readonly string[] = TRANSPORT.staves.list.map((s) => s.item);
/** The staves that give a rune; a members staff is not wielded on a known free-to-play account. */
export function stavesFor(rune: string, members?: boolean | null): string[] {
  return TRANSPORT.staves.list.filter((s) => s.runes.includes(rune) && !(s.members && members === false)).map((s) => s.item);
}
export const runeName = (rune: string): string => `${rune[0].toUpperCase()}${rune.slice(1)} rune`;

/**
 * A rune a staff gives: worn, it costs nothing; in the bag, it does once the staff is wielded (an action on the spot). null: no staff on hand for it.
 * When the game does not tell worn from carried (no `worn`), a staff anywhere on the player counts as worn, as before.
 */
export function staffCover(rune: string, inp: Pick<TravelInput, 'carried' | 'worn' | 'members'>): { staff: string; worn: boolean } | null {
  const names = stavesFor(rune, inp.members);
  if (!names.length) return null;
  const pick = (items: readonly GearItem[] | null | undefined) => items?.find((i) => names.includes(i.name))?.name ?? null;
  const worn = inp.worn === undefined ? pick(inp.carried) : pick(inp.worn);
  if (worn) return { staff: worn, worn: true };
  const bag = inp.worn === undefined ? null : pick(inp.carried);
  return bag ? { staff: bag, worn: false } : null;
}

/** How many of a thing the bank holds: null when the bank was not seen or the game did not report this thing (unknown is not zero). */
function bankOf(inp: Pick<TravelInput, 'bankSeen' | 'bank'>, name: string): number | null {
  if (!inp.bankSeen || !inp.bank) return null;
  return inp.bank.get(nameKey(name)) ?? null;
}

function teleportNeeds(t: Teleport, inp: TravelInput): { needs: Need[]; availability: Availability } {
  if (t.kind === 'home') {
    // The game's cooldown: a locked way with the time left, not a promise the button will work.
    const left = inp.homeCooldownSec ?? 0;
    if (left > 0) return { needs: [{ text: `Home Teleport is on cooldown: ready in ${cooldownText(left)}`, ok: false }], availability: 'locked' };
    // The game did not say whether it is ready: a thing to check, never "ready".
    if (inp.homeCooldownKnown === false) return { needs: [{ text: 'the Home Teleport cooldown (once every 30 minutes)', ok: null }], availability: 'maybe' };
    return { needs: [], availability: 'ready' };
  }
  if (t.kind === 'item') {
    const held = inp.carried ? count(inp.carried, t.items ?? []) : null;
    const have = held === null ? null : held > 0;
    // Not on hand and the bank was opened: it is not anywhere nearby; the bank was not opened: it may be lying there.
    const ok = have === null ? null : have ? true : inp.bankSeen ? false : null;
    const book: Need = { text: `${t.items![0]} on you`, ok, item: { name: t.items![0], need: 1, have: held, bank: bankOf(inp, t.items![0]) } };
    const charges = t.charges && have ? inp.chronicleCharges ?? null : null;
    if (!t.charges || !have || charges === null) {
      // Not on hand, or the charges were never told: they are a thing to check.
      return { needs: [{ ...book, text: `${book.text}${t.charges ? ' (charges: Check charges)' : ''}` }], availability: ok === false ? 'locked' : 'maybe' };
    }
    if (charges > 0) return { needs: [{ ...book, text: `${book.text} (${charges} ${charges === 1 ? 'charge' : 'charges'})` }], availability: 'ready' };
    // Out of charges: a card in the bag charges it on the spot; otherwise cards are what it lacks (bought or withdrawn first).
    const card = t.charges.item;
    const cards = inp.carried ? count(inp.carried, [card]) : null;
    if (cards !== null && cards > 0) {
      return { needs: [{ ...book, text: `${book.text} (no charges: use a ${card} on it)`, action: `use a ${card} on the ${t.items![0]}` }], availability: 'ready' };
    }
    return {
      needs: [book, { text: `${t.items![0]} charges: none left (a ${card} adds one)`, ok: false, item: { name: card, need: 1, have: cards, bank: bankOf(inp, card) } }],
      availability: 'locked',
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
  // Another spellbook has no such spell; an unknown one is a thing to check.
  if (inp.standardSpellbook === false) {
    needs.push({ text: 'the standard spellbook (another one is active)', ok: false });
    locked = true;
  } else if (inp.standardSpellbook === null) {
    needs.push({ text: 'the standard spellbook', ok: null });
    unsure = true;
  }
  for (const [rune, qty] of Object.entries(t.runes ?? {})) {
    // A staff gives the rune: wielded, nothing to carry; in the bag, wield it first.
    const staff = staffCover(rune, inp);
    if (staff) {
      needs.push(staff.worn
        ? { text: `${runeName(rune)} ×${qty}: your ${staff.staff} gives it`, ok: true }
        : { text: `${runeName(rune)} ×${qty}: wield your ${staff.staff}`, ok: true, action: `wield your ${staff.staff}` });
      continue;
    }
    const have = inp.carried ? count(inp.carried, [runeName(rune)]) : null;
    const ok = have === null ? null : have >= qty ? true : inp.bankSeen ? false : null;
    needs.push({ text: `${runeName(rune)} ×${qty}${have !== null ? ` (in the bag: ${have})` : ''}`, ok, item: { name: runeName(rune), need: qty, have, bank: bankOf(inp, runeName(rune)) } });
    if (ok === false) locked = true;
    if (ok === null) unsure = true;
  }
  return { needs, availability: locked ? 'locked' : unsure ? 'maybe' : 'ready' };
}

/** The countable things of a way that are known to be short on hand. An unknown bag gives nothing: unknown is not missing. */
export function shortOf(needs: readonly Need[]): NeedItem[] {
  return needs.flatMap((n) => (n.item && n.item.have !== null && n.item.have < n.item.need ? [n.item] : []));
}

/**
 * A way that is known to be unusable right now whatever the bank holds: a thing it needs is counted in the bag and is short. The planner's "maybe"
 * for it means "the bank may have it"; the game must not be told to cast a spell with no runes in the bag.
 */
export function shortOnHand(o: Pick<TravelOption, 'needs' | 'prepare' | 'acquire'>): boolean {
  return !o.prepare && !o.acquire && shortOf(o.needs).length > 0;
}

/** The tiles a way costs in all: the walk, and the time of the transport itself where it is known (a long cast). */
export const effectiveTiles = (o: Pick<TravelOption, 'walkTiles' | 'overheadTiles'>): number => o.walkTiles + (o.overheadTiles ?? 0);

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
    { text: 'Fairytale II - Cure a Queen started (the Fairy Godfather)', ok: inp.fairyRings === true ? true : null },
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

/** A quest the way needs, from the game's completed list: unknown when the game did not send it. */
const questNeed = (inp: Pick<TravelInput, 'questsDone'>, quest: string, what = `${quest} completed`): Need =>
  ({ text: what, ok: inp.questsDone === null || inp.questsDone === undefined ? null : inp.questsDone.includes(quest) });

/** The walk to or from a network node: the straight line, the stairs between floors and a walk the line does not see. */
const nodeTiles = (a: Point, n: NetNode): number => dist(a, n) + Math.abs(a.plane - n.plane) * STAIRS_TILES_PER_FLOOR + (n.extraTiles ?? 0);

const availabilityOf = (needs: readonly Need[]): Availability => (needs.some((n) => n.ok === false) ? 'locked' : needs.some((n) => n.ok === null) ? 'maybe' : 'ready');

/** Spirit trees (members, Tree Gnome Village): any tree to any other; the Stronghold tree is left from only after The Grand Tree. */
function spiritTreeOption(inp: TravelInput): TravelOption | null {
  const net = TRANSPORT.spiritTrees;
  if (!net || inp.members === false) return null;
  const overhead = Math.round(net.overheadSeconds * TILES_PER_SECOND);
  let best: { a: NetNode; b: NetNode; tiles: number } | null = null;
  for (const a of net.trees) {
    for (const b of net.trees) {
      if (a.id === b.id || a.arriveOnly) continue;
      const tiles = nodeTiles(inp.from, a) + nodeTiles(inp.to, b);
      if (!best || tiles < best.tiles) best = { a, b, tiles };
    }
  }
  if (!best) return null;
  const { a, b } = best;
  const needs: Need[] = [membersNeed(inp.members), questNeed(inp, net.quest)];
  if (a.departQuest) needs.push(questNeed(inp, a.departQuest, `${a.departQuest} completed, to leave from the ${a.name} tree`));
  for (const n of [a, b]) if (n.check) needs.push({ text: n.check, ok: null });
  return {
    id: 'spirit-tree', title: `Spirit tree ${a.name} → ${b.name}`,
    legs: [
      { kind: 'walk', label: `to the spirit tree at ${a.name}${a.note ? ` (${a.note})` : ''}`, tiles: nodeTiles(inp.from, a) },
      { kind: 'spirit', label: `spirit tree → ${b.name}`, tiles: 0 },
      { kind: 'walk', label: `from the ${b.name} tree to the target${b.note ? ` (${b.note})` : ''}`, tiles: nodeTiles(inp.to, b) },
    ],
    walkTiles: best.tiles, overheadTiles: overhead, availability: availabilityOf(needs), needs,
    ...(net.note ? { note: net.note } : {}),
    go: { x: a.x, y: a.y, plane: a.plane, label: `Spirit tree — ${a.name}` },
  };
}

/** Gnome gliders (members, The Grand Tree): the hub flies everywhere, every other station to the hub; two outer stations are two flights. */
function gliderOption(inp: TravelInput): TravelOption | null {
  const net = TRANSPORT.gliders;
  if (!net || inp.members === false) return null;
  const hub = net.stations.find((s) => s.id === net.hub);
  if (!hub) return null;
  const perFlight = Math.round(net.overheadSeconds * TILES_PER_SECOND);
  let best: { a: NetNode; b: NetNode; tiles: number; flights: number } | null = null;
  for (const a of net.stations) {
    if (a.arriveOnly) continue;
    for (const b of net.stations) {
      if (a.id === b.id) continue;
      const flights = a.id === hub.id || b.id === hub.id ? 1 : 2;
      const tiles = nodeTiles(inp.from, a) + nodeTiles(inp.to, b);
      if (!best || tiles + flights * perFlight < best.tiles + best.flights * perFlight) best = { a, b, tiles, flights };
    }
  }
  if (!best) return null;
  const { a, b, flights } = best;
  const needs: Need[] = [membersNeed(inp.members), questNeed(inp, net.quest)];
  for (const n of [a, b]) {
    if (n.quest) needs.push(questNeed(inp, n.quest, `${n.quest} completed, for the glider at ${n.name}`));
    if (n.check) needs.push({ text: n.check, ok: null });
  }
  const via = flights === 2 ? ` (two flights, through ${hub.name})` : '';
  return {
    id: 'glider', title: `Glider ${a.name} → ${b.name}`,
    legs: [
      { kind: 'walk', label: `to ${a.npc ?? 'the glider'} at ${a.name}`, tiles: nodeTiles(inp.from, a) },
      { kind: 'glider', label: `glider → ${b.name}${via}`, tiles: 0 },
      { kind: 'walk', label: `from ${b.name} to the target`, tiles: nodeTiles(inp.to, b) },
    ],
    walkTiles: best.tiles, overheadTiles: flights * perFlight, availability: availabilityOf(needs), needs,
    ...(net.note ? { note: net.note } : {}),
    go: { x: a.x, y: a.y, plane: a.plane, label: `${a.npc ?? 'Glider'} — ${a.name}` },
  };
}

/** The Wilderness level of a surface tile, 0 outside it (the main Wilderness: x 2944-3391, y 3520-3967; one level per eight tiles north). */
export function wildernessLevel(p: Point): number {
  if (p.plane !== 0 || p.x < 2944 || p.x > 3391 || p.y < 3520 || p.y > 3967) return 0;
  return Math.floor((p.y - 3520) / 8) + 1;
}

/**
 * The Cowbell amulet (free-to-play, from The Ides of Milk): only a carried or worn one is a way (it is untradeable, so it is never bought). The game
 * reports one name for the empty and the charged amulet; the item id tells them apart. Charged means at least one charge; an empty one needs an Air
 * rune used on it first (one rune, one teleport). A carried amulet whose id is not known is a thing to check.
 */
function cowbellOption(inp: TravelInput): TravelOption | null {
  const c = TRANSPORT.cowbell;
  if (!c || !inp.carried) return null;
  const held = inp.carried.filter((i) => i.name === c.item);
  if (!held.length) return null;
  const charged = held.some((i) => i.id === c.chargedId);
  const empty = !charged && held.some((i) => i.id === c.emptyId);
  const air = count(inp.carried, [c.chargeWith]);
  const wild = wildernessLevel(inp.from);
  const needs: Need[] = [];
  if (wild > c.maxWilderness) needs.push({ text: `not above level ${c.maxWilderness} Wilderness (you are at level ${wild})`, ok: false });
  if (charged) needs.push({ text: `${c.item}, charged (at least one charge; the count is not read)`, ok: true });
  else if (empty && air > 0) needs.push({ text: `${c.item} is empty: use an ${c.chargeWith} on it (one rune, one teleport)`, ok: true, action: `use an ${c.chargeWith} on the ${c.item}` });
  else if (empty) needs.push({ text: `${c.item} is empty: it needs an ${c.chargeWith} (one per teleport)`, ok: inp.bankSeen ? false : null, item: { name: c.chargeWith, need: 1, have: air, bank: bankOf(inp, c.chargeWith) } });
  else needs.push({ text: `${c.item}: charged or empty is not known (check it)`, ok: null });
  const tail = dist(c.dest, inp.to);
  return {
    id: 'cowbell', title: c.item,
    legs: [{ kind: 'teleport', label: `${c.item} → ${c.dest.label}`, tiles: 0 }, { kind: 'walk', label: 'then on foot', tiles: tail }],
    walkTiles: tail, overheadTiles: Math.round(c.castSeconds * TILES_PER_SECOND), availability: availabilityOf(needs), needs,
    ...(c.note ? { note: c.note } : {}),
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

/** How far a place is by the best way the player can use right now: on foot, or by a teleport that is surely ready. */
export interface Reach { tiles: number; /** The teleport that shortens it, if one does. */ via?: string; /** Where that teleport lands. */ landing?: Point }

/**
 * The tiles to a place, counting the teleports the player can cast or read now: the Chronicle or a tablet in the bag, a spell with the level and the runes in
 * the bag. A teleport that only may be available (unknown bag, unknown level) is not counted: the planner never assumes it. The walk after the landing is
 * counted from the landing tile, so a player standing in Al Kharid with a Varrock tablet is 60 tiles from the exchange, not 320.
 */
export function reachTiles(inp: Pick<TravelInput, 'from' | 'levels' | 'carried' | 'bankSeen' | 'homeCooldownSec'> & Pick<Partial<TravelInput>, 'members' | 'standardSpellbook' | 'worn' | 'chronicleCharges'>, to: Point): Reach {
  let best: Reach = { tiles: dist(inp.from, to) };
  const consider = (via: string, dest: Point) => {
    const tiles = dist(dest, to);
    if (tiles < best.tiles) best = { tiles, via, landing: dest };
  };
  const probe = { ...inp, to } as TravelInput;
  for (const t of TRANSPORT.teleports) {
    // The Home Teleport is a teleport like the others, but its cooldown and the long cast make it a poor shortcut: it is left out of the reach.
    if (t.kind === 'home') continue;
    // An item teleport (the Chronicle) is "maybe" for its unknown charges, but one in the bag is a way to use: it counts.
    const held = t.kind === 'item' && inp.carried ? count(inp.carried, t.items ?? []) > 0 && !(t.charges && inp.chronicleCharges === 0) : false;
    if (held || teleportNeeds(t, probe).availability === 'ready') consider(t.name, t.dest);
  }
  if (inp.carried && inp.members !== false) {
    for (const tb of NET.tablets) {
      const spell = TRANSPORT.teleports.find((t) => t.id === tb.spell);
      if (spell && count(inp.carried, [tb.item]) > 0) consider(`${tb.item} tablet`, spell.dest);
    }
  }
  return best;
}

/** The bank that costs the least extra walk on the way from one place to another (the straight line through it is the shortest). */
export function bankOnRoute(from: Point, to: Point): (Point & { label: string }) | null {
  let best: { bank: Point & { label: string }; extra: number } | null = null;
  for (const b of BANKS) {
    if (b.plane !== from.plane) continue;
    const extra = dist(from, b) + dist(b, to) - dist(from, to);
    if (!best || extra < best.extra) best = { bank: b, extra };
  }
  return best?.bank ?? null;
}

/** The bank nearest to a point, the stairs to an upper-floor bank counted. */
export const nearestBank = (from: Point): (Point & { label: string }) | null =>
  BANKS.reduce<(Point & { label: string }) | null>((m, c) => (!m || bankTiles(from, c) < bankTiles(from, m) ? c : m), null);
const isExchangePoint = (p: Point) => dist(p, EXCHANGE) <= 6;

/**
 * Where to fetch an item from: the nearest bank if the bank is known to hold it; otherwise where the source router says (a shop for a thing that is not
 * traded, such as the Chronicle); with no router, the exchange. null: the router knows no place. The way there counts the teleports in the bag.
 */
function acquireFor(item: string, inp: TravelInput): Acquire | null {
  if (inp.bank?.get(nameKey(item))) {
    const bank = nearestBank(inp.from);
    if (bank) {
      const r = reachTiles(inp, bank);
      return { what: item, where: bank.label, point: bank, tiles: r.tiles + bank.plane * STAIRS_TILES_PER_FLOOR, cost: 0, source: 'bank', ...(r.via ? { via: r.via } : {}) };
    }
  }
  if (inp.sourceOf) {
    const src = inp.sourceOf(item, 1);
    if (!src) return null;
    const r = reachTiles(inp, src.point);
    return { what: item, where: src.where, point: src.point, tiles: r.tiles, cost: src.price, source: src.kind === 'exchange' ? 'exchange' : 'shop', ...(r.via ? { via: r.via } : {}) };
  }
  const r = reachTiles(inp, EXCHANGE);
  return { what: item, where: EXCHANGE.label, point: EXCHANGE, tiles: r.tiles, cost: inp.priceOf?.(item) ?? null, source: 'exchange', ...(r.via ? { via: r.via } : {}) };
}

const qtyText = (i: { name: string; qty: number }) => (i.qty > 1 ? `${i.name} ×${i.qty}` : i.name);
const STOP_VERB: Record<PrepStop['action'], string> = { withdraw: 'withdraw', buy: 'buy', take: 'pick up' };
const placeText = (where: string) => (where === EXCHANGE.label ? `the ${where}` : where);
/** "withdraw Law rune, Air rune ×3" */
const stopWhat = (s: Pick<PrepStop, 'action' | 'items'>) => `${STOP_VERB[s.action]} ${s.items.map(qtyText).join(', ')}`;
/** " (~12 gp)" for a purchase; an unknown price is said, never shown as free. */
const stopPrice = (s: Pick<PrepStop, 'action' | 'items'>) =>
  (s.action !== 'buy' ? '' : s.items.some((i) => i.price === null) ? ' (price unknown)' : ` (~${s.items.reduce((sum, i) => sum + (i.price ?? 0) * i.qty, 0)} gp)`);

/** "withdraw Law rune, Air rune ×3 at Varrock West Bank": one stop of a preparation in words. */
export function stopText(s: Pick<PrepStop, 'action' | 'items' | 'where'>): string {
  return `${stopWhat(s)} at ${placeText(s.where)}${stopPrice(s)}`;
}

/**
 * The stops that get what is short: the bank for what it is known to hold in full, the source router's place for the rest. Only the remaining quantity
 * is asked for. The stops are walked nearest first; the first leg counts the teleports already in the bag.
 */
export function prepareFor(missing: readonly NeedItem[], inp: TravelInput): { prep: Preparation; tiles: number; end: Point } | { reject: DetourRejection; what: string } {
  const groups: Omit<PrepStop, 'tiles' | 'via'>[] = [];
  const add = (action: PrepStop['action'], where: string, point: Point, item: PrepStop['items'][number]) => {
    const g = groups.find((x) => x.action === action && dist(x.point, point) <= 6);
    if (g) g.items.push(item); else groups.push({ action, where, point, items: [item] });
  };
  for (const m of missing) {
    const qty = m.need - (m.have ?? 0);
    const bank = m.bank !== null && m.bank >= qty ? nearestBank(inp.from) : null;
    if (bank) { add('withdraw', bank.label, bank, { name: m.name, qty, price: 0 }); continue; }
    const src = inp.sourceOf?.(m.name, qty) ?? null;
    if (!src) return { reject: 'no_source', what: m.name };
    add(src.kind === 'free' ? 'take' : 'buy', src.where, src.point, { name: m.name, qty, price: src.kind === 'free' ? 0 : src.price });
  }
  const stops: PrepStop[] = [];
  let at: Point = inp.from;
  let total = 0;
  while (groups.length) {
    let best = 0;
    let reach: Reach = { tiles: Infinity };
    groups.forEach((g, i) => {
      const r = stops.length ? { tiles: dist(at, g.point) } : reachTiles(inp, g.point);
      const stairs = g.action === 'withdraw' ? g.point.plane * STAIRS_TILES_PER_FLOOR : 0;
      if (r.tiles + stairs < reach.tiles) { reach = { ...r, tiles: r.tiles + stairs }; best = i; }
    });
    const g = groups.splice(best, 1)[0];
    stops.push({ ...g, tiles: reach.tiles, ...(reach.via ? { via: reach.via } : {}) });
    total += reach.tiles;
    at = g.point;
  }
  const bought = stops.filter((s) => s.action === 'buy').flatMap((s) => s.items);
  const cost = bought.some((i) => i.price === null) ? null : bought.reduce((sum, i) => sum + (i.price ?? 0) * i.qty, 0);
  return { prep: { stops, missing: [...missing], cost }, tiles: total, end: at };
}

/**
 * The same way after getting what it is short of (runes, coins, an axe), when that is clearly worth it: the whole trip with the stops must still beat
 * walking by the fetch-first limits. null when nothing countable is short, when something else is wrong (a level, a quest, a spellbook: no stop fixes
 * that), or when the stops cost more than they save; every verdict is logged with its reason. The app only suggests: it never buys or withdraws.
 */
function withPreparation(o: TravelOption, inp: TravelInput, direct: number, rest: (from: Point) => { legs: Leg[]; tiles: number }): TravelOption | null {
  const missing = shortOf(o.needs);
  if (!missing.length) return null;
  // A thing that is not a count on hand must be known to be fine: a low level or an unknown quest is not prepared at a bank.
  if (o.needs.some((n) => n.ok !== true && !(n.item && n.item.have !== null))) return null;
  const subject = `${o.title}: ${missing.map((m) => m.name).join(', ')}`;
  const p = prepareFor(missing, inp);
  if ('reject' in p) {
    emitDecision({ subject, outcome: 'rejected', reason: p.reject, detail: { item: p.what } }, inp.onDecision);
    return null;
  }
  const after = rest(p.end);
  const total = p.tiles + after.tiles;
  const first = p.prep.stops[0];
  const detail = { fetch: p.tiles, rest: after.tiles, direct, saving: direct - total - (o.overheadTiles ?? 0), cost: p.prep.cost, stops: p.prep.stops.length, via: first.via ?? null };
  const reject = (reason: DetourRejection) => { emitDecision({ subject, outcome: 'rejected', reason, detail }, inp.onDecision); return null; };
  if (p.tiles > (p.prep.stops.some((s) => isExchangePoint(s.point)) ? OPPORTUNISTIC_MAX_EXCHANGE_TILES : OPPORTUNISTIC_MAX_DETOUR_TILES)) return reject('exceeds_detour_limit');
  if (detail.saving < OPPORTUNISTIC_MIN_SAVING_TILES) return reject('insufficient_savings');
  if (p.prep.cost !== null && p.prep.cost > OPPORTUNISTIC_MAX_COST) return reject('price_too_high');
  const coins = inp.carried ? count(inp.carried, ['Coins']) : null;
  const buys = p.prep.stops.some((s) => s.action === 'buy');
  const afford = !buys || p.prep.cost === null || coins === null ? null : needFrom(coins >= p.prep.cost, inp.bankSeen);
  emitDecision({
    subject, outcome: 'offered', detail,
    ...(buys && p.prep.cost === null ? { caveat: 'price_unknown' as const } : afford === false ? { caveat: 'missing_coins' as const } : {}),
  }, inp.onDecision);
  return {
    ...o, id: `${o.id}-prepare`, title: `${o.title}: get what it needs first`,
    legs: [
      ...p.prep.stops.map((s, i): Leg => ({ kind: 'walk', label: `to ${placeText(s.where)}${i === 0 && s.via ? ` (by ${s.via})` : ''}: ${stopWhat(s)}${stopPrice(s)}`, tiles: s.tiles })),
      ...after.legs,
    ],
    walkTiles: total, availability: afford === false ? 'locked' : 'maybe',
    needs: [
      ...p.prep.stops.map((s) => ({ text: stopText(s), ok: s.action === 'buy' ? afford : null })),
      ...o.needs.filter((n) => !n.item || n.item.have === null || n.item.have >= n.item.need),
    ],
    prepare: p.prep, go: { ...first.point, label: first.where },
  };
}

/**
 * Teleport tablets and the Chronicle: a tablet in the bag is simply a ready option; one the player does not carry is offered by way of the bank or the
 * exchange only when it is worth it (OPPORTUNISTIC_* limits). The runes of a spell are not fetched this way. The app only suggests: it never buys.
 */
function itemTeleportOptions(inp: TravelInput, direct: number): TravelOption[] {
  const out: TravelOption[] = [];
  const entries: { id: string; item: string; title: string; dest: Teleport['dest']; note?: string; plain: boolean; charges?: Teleport['charges'] }[] = [];
  // Teleport tablets are members' items (the wiki's item cards): on a known free-to-play account they are not offered, in the bag or to buy.
  for (const tb of inp.members === false ? [] : NET.tablets) {
    const spell = TRANSPORT.teleports.find((t) => t.id === tb.spell);
    if (spell) entries.push({ id: tb.id, item: tb.item, title: `${tb.item} tablet`, dest: spell.dest, plain: true });
  }
  for (const t of TRANSPORT.teleports) {
    if (t.kind === 'item' && t.items?.length) entries.push({ id: t.id, item: t.items[0], title: t.name, dest: t.dest, plain: false, ...(t.note ? { note: t.note } : {}), ...(t.charges ? { charges: t.charges } : {}) });
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
    const found = acquireFor(e.item, inp);
    if (!found) { emitDecision({ subject: e.item, outcome: 'rejected', reason: 'no_source', detail: { tail, direct } }, inp.onDecision); continue; }
    // A new book has no charges, and a banked one known to be empty has none either: one card is bought with it (the same shop sells both).
    const charge = e.charges && (found.source !== 'bank' || inp.chronicleCharges === 0) ? e.charges.item : null;
    const cardSource = charge ? inp.sourceOf?.(charge, 1) ?? null : null;
    const cardPrice = charge ? cardSource?.price ?? inp.priceOf?.(charge) ?? null : 0;
    // A card sold elsewhere than the book is fetched on the way: that walk is part of the fetch.
    const cardTiles = charge && cardSource && dist(found.point, cardSource.point) > 6 ? dist(found.point, cardSource.point) : 0;
    const acq: Acquire = charge ? { ...found, tiles: found.tiles + cardTiles, cost: found.cost === null || cardPrice === null ? null : found.cost + cardPrice } : found;
    const total = acq.tiles + tail;
    const detail = { fetch: acq.tiles, tail, direct, saving: direct - total, cost: acq.cost, source: acq.source, via: acq.via ?? null };
    const reject = (reason: DetourRejection) => { emitDecision({ subject: e.item, outcome: 'rejected', reason, detail }, inp.onDecision); };
    if (acq.tiles > (acq.source === 'exchange' ? OPPORTUNISTIC_MAX_EXCHANGE_TILES : OPPORTUNISTIC_MAX_DETOUR_TILES)) { reject('exceeds_detour_limit'); continue; }
    if (direct - total < OPPORTUNISTIC_MIN_SAVING_TILES) { reject('insufficient_savings'); continue; }
    if (acq.cost !== null && acq.cost > OPPORTUNISTIC_MAX_COST) { reject('price_too_high'); continue; }
    const coins = inp.carried ? count(inp.carried, ['Coins']) : null;
    const buying = acq.source !== 'bank' || charge !== null;
    const afford = !buying || acq.cost === null || coins === null ? null : needFrom(coins >= acq.cost, inp.bankSeen);
    emitDecision({
      subject: e.item, outcome: 'offered', detail,
      ...(buying && acq.cost === null ? { caveat: 'price_unknown' as const } : afford === false ? { caveat: 'missing_coins' as const } : {}),
    }, inp.onDecision);
    const verb = acq.source === 'bank' ? 'withdraw' : 'buy';
    const price = acq.source === 'bank' && !charge ? 'free' : acq.cost === null ? 'price unknown' : `~${acq.cost} gp`;
    // "the Grand Exchange", "the Draynor Bank", but "Diango's Toy Store".
    const place = acq.source === 'bank' || acq.where === EXCHANGE.label ? `the ${acq.where}` : acq.where;
    out.push({
      id: `${e.id}-acquire`, title: `${e.item}: ${verb} first, then teleport`,
      legs: [
        { kind: 'walk', label: `to ${place}${acq.via ? ` (by ${acq.via})` : ''}: ${verb} ${e.item}${charge ? ` and get a ${charge} to charge it` : ''} (${price})`, tiles: acq.tiles },
        { kind: 'teleport', label: `${e.item} → ${e.dest.label}`, tiles: 0 },
        { kind: 'walk', label: 'then on foot', tiles: tail },
      ],
      walkTiles: total, availability: afford === false ? 'locked' : 'maybe',
      needs: [
        { text: acq.source === 'bank' ? `${e.item} in the bank (${acq.where})` : `${e.item} from ${place} (${price})`, ok: afford },
        ...(charge ? [{ text: `a ${charge} to charge it (one card, one charge)`, ok: afford }] : []),
      ],
      acquire: acq, go: { ...acq.point, label: acq.where },
      prepare: {
        stops: ([
          { action: acq.source === 'bank' ? 'withdraw' : 'buy', where: acq.where, point: acq.point, items: [{ name: e.item, qty: 1, price: acq.source === 'bank' ? 0 : found.cost }], tiles: acq.tiles, ...(acq.via ? { via: acq.via } : {}) },
          // The card: at the same shop as the book, or where the router says for a book from the bank.
          ...(charge ? [{ action: 'buy', where: cardSource?.where ?? acq.where, point: cardSource?.point ?? acq.point, items: [{ name: charge, qty: 1, price: cardPrice }], tiles: cardTiles }] : []),
        ] as PrepStop[]).reduce<PrepStop[]>((all, stop) => {
          // The book and the card from one shop are one stop.
          const same = all.find((x) => x.action === stop.action && dist(x.point, stop.point) <= 6);
          if (same) same.items.push(...stop.items); else all.push({ ...stop, items: [...stop.items] });
          return all;
        }, []),
        missing: [
          { name: e.item, need: 1, have: carried === null ? null : 0, bank: bankOf(inp, e.item) },
          ...(charge ? [{ name: charge, need: 1, have: inp.carried ? count(inp.carried, [charge]) : null, bank: bankOf(inp, charge) }] : []),
        ],
        cost: acq.source === 'bank' ? (charge ? cardPrice : 0) : acq.cost,
      },
      ...(e.note ? { note: e.note } : {}),
    });
  }
  return out;
}

/** The possible ways to get there: the available ones first, within them by tiles on foot. The useless ones (not shorter on foot) are not shown. */
export function travelOptions(inp: TravelInput): TravelOption[] {
  // An instance is not on the world map: there is nothing to route over it, in either direction. Nor is a dungeon: its tiles are a copy far to the north,
  // and a straight line from the surface to it is not a distance.
  if (isInstancedPoint(inp.from) || isInstancedPoint(inp.to) || !isOverworld(inp.from) || !isOverworld(inp.to)) return [];
  const out: TravelOption[] = [];
  const direct = dist(inp.from, inp.to);
  out.push({ id: 'walk', title: 'On foot', legs: [{ kind: 'walk', label: 'running in a straight line', tiles: direct }], walkTiles: direct, availability: 'ready', needs: [] });

  for (const t of TRANSPORT.teleports) {
    const tail = dist(t.dest, inp.to);
    const { needs, availability } = teleportNeeds(t, inp);
    const legs: Leg[] = [{ kind: 'teleport', label: `${t.name} → ${t.dest.label}`, tiles: 0 }, { kind: 'walk', label: 'then on foot', tiles: tail }];
    const option: TravelOption = {
      id: t.id, title: t.name, legs, walkTiles: tail, availability, needs, ...(t.note ? { note: t.note } : {}),
      // A long cast (the Home Teleport) is time not spent running: it counts against the saving.
      ...(t.castSeconds ? { overheadTiles: Math.round(t.castSeconds * TILES_PER_SECOND) } : {}),
    };
    out.push(option);
    // A spell that is short of runes, or a book that is out of charges: the same way after a stop at the bank or the shop, when the whole trip is still
    // clearly shorter. A book that is not on hand is fetched by itemTeleportOptions instead.
    if (t.kind === 'spell' || (t.kind === 'item' && t.charges && needs.some((n) => n.item?.name === t.charges!.item))) {
      const prepared = withPreparation(option, inp, direct, () => ({ legs, tiles: tail }));
      if (prepared) out.push(prepared);
    }
  }

  // A canoe: the best pair of stations — from the player to station A, down the river to B (no farther than the canoe type allows), from B to the target.
  // When the best pair needs a canoe the player cannot chop yet (Woodcutting too low), the best pair they can chop now is offered as well: "canoe-now".
  const types = TRANSPORT.canoe.types;
  const wc = inp.levels.woodcutting;
  const pushRiver = (stations: readonly CanoeStation[], idBase: string, extra: Need[]) => {
    const bestCanoe = (usable: (ty: CanoeType) => boolean) => {
      let best: { a: number; b: number; tiles: number; type: CanoeType } | null = null;
      for (let a = 0; a < stations.length; a++) {
        for (let b = 0; b < stations.length; b++) {
          if (a === b) continue;
          const stops = Math.abs(a - b);
          const type = types.find((ty) => ty.stops >= stops && (!stations[b].wakaOnly || ty.name === 'Waka') && usable(ty));
          if (!type) continue;
          const tiles = dist(inp.from, stations[a]) + dist(stations[b], inp.to);
          if (!best || tiles < best.tiles) best = { a, b, tiles, type };
        }
      }
      return best && best.tiles + MIN_SAVING_TILES <= direct ? best : null;
    };
    const canoeOption = (id: string, best: NonNullable<ReturnType<typeof bestCanoe>>): TravelOption => {
      // An axe in the bag or worn makes the station usable. None in the bag is not "no axe": since 1 April 2026 an axe stored at any canoe station is
      // shared by all of them and is not read from the game, so "not carried" is unknown, never false (the fetch-first option below still offers one).
      const axes = inp.carried ? count(inp.carried, TRANSPORT.canoe.axes) : null;
      const axeOk: boolean | null = axes !== null && axes > 0 ? true : null;
      const levelOk = wc === undefined ? null : wc >= best.type.level;
      const a = stations[best.a];
      const b = stations[best.b];
      // The axe to fetch: one the bank is known to hold, otherwise the cheapest one a shop sells.
      const banked = TRANSPORT.canoe.axes.map((name) => ({ name, n: bankOf(inp, name) }));
      const inBank = banked.find((x) => (x.n ?? 0) > 0);
      const axeItem: NeedItem = { name: inBank?.name ?? TRANSPORT.canoe.axes[0], need: 1, have: axes, bank: inBank ? inBank.n : banked.every((x) => x.n === 0) ? 0 : null };
      return {
        id, title: `Canoe ${a.name} → ${b.name}`,
        legs: [
          { kind: 'walk', label: `to station ${a.name}`, tiles: dist(inp.from, a) },
          { kind: 'canoe', label: `${best.type.name}: ${Math.abs(best.a - best.b)} stops`, tiles: 0 },
          { kind: 'walk', label: `from station ${b.name} to the target`, tiles: dist(b, inp.to) },
        ],
        walkTiles: best.tiles,
        availability: levelOk === false || extra.some((n) => n.ok === false) ? 'locked' : levelOk === null || axeOk === null || extra.some((n) => n.ok === null) ? 'maybe' : 'ready',
        needs: [
          ...extra,
          { text: `Woodcutting ${best.type.level} for ${best.type.name}${wc !== undefined ? ` (you have ${wc})` : ''}`, ok: levelOk },
          { text: 'any axe in the bag or in your hands, or one you stored at a canoe station (stored axes are shared by all stations and cannot be read)', ok: axeOk, item: axeItem },
        ],
        go: { x: a.x, y: a.y, plane: a.plane, label: `Canoe station — ${a.name}` },
      };
    };
    const pushCanoe = (id: string, best: NonNullable<ReturnType<typeof bestCanoe>>) => {
      const option = canoeOption(id, best);
      out.push(option);
      // No axe on hand: the same canoe after fetching one, walking to the station from where the axe is.
      const a = stations[best.a];
      const b = stations[best.b];
      const prepared = withPreparation(option, inp, direct, (from) => ({
        legs: [{ kind: 'walk', label: `to station ${a.name}`, tiles: dist(from, a) }, option.legs[1], option.legs[2]],
        tiles: dist(from, a) + dist(b, inp.to),
      }));
      if (prepared) out.push(prepared);
    };
    const bestAny = bestCanoe(() => true);
    if (bestAny) {
      pushCanoe(idBase, bestAny);
      if (wc !== undefined && wc < bestAny.type.level) {
        const now = bestCanoe((ty) => wc >= ty.level);
        if (now) pushCanoe(`${idBase}-now`, now);
      }
    }
  };
  pushRiver(TRANSPORT.canoe.stations, 'canoe', []);
  // The River Dougne (members, added 1 April 2026): left out on a known free-to-play account.
  if (TRANSPORT.dougne && inp.members !== false) pushRiver(TRANSPORT.dougne.stations, 'canoe-dougne', [membersNeed(inp.members)]);

  // One-time NPC teleports (Count Check): walk to the person, talk, arrive. Never "ready": whether the player ever entered the Stronghold is not in the
  // game's data, so the way is possible, and it goes away when the route step that uses it is closed.
  for (const w of TRANSPORT.oneTime ?? []) {
    if (inp.oneTimeUsed?.includes(w.id)) continue;
    const toNpc = dist(inp.from, w.at);
    const tail = dist(w.dest, inp.to);
    if (toNpc + tail + MIN_SAVING_TILES > direct) continue;
    out.push({
      id: w.id, title: `${w.name}: one free teleport`,
      legs: [
        { kind: 'walk', label: `to ${w.name} (${w.at.label})`, tiles: toNpc },
        { kind: 'teleport', label: `${w.name} → ${w.dest.label}`, tiles: 0 },
        { kind: 'walk', label: 'then on foot', tiles: tail },
      ],
      walkTiles: toNpc + tail, availability: 'maybe', needs: [{ text: w.needs, ok: null }],
      ...(w.note ? { note: w.note } : {}), go: { x: w.at.x, y: w.at.y, plane: w.at.plane, label: w.name },
    });
  }

  // Boats: pier to pier for 30 coins.
  for (const b of TRANSPORT.boats) {
    const tiles = dist(inp.from, b.from) + dist(b.to, inp.to);
    const coins = inp.carried ? count(inp.carried, ['Coins']) : null;
    const ok = b.cost <= 0 ? true : coins === null ? null : coins >= b.cost ? true : inp.bankSeen ? false : null;
    const ride: Leg = { kind: 'boat', label: b.cost > 0 ? `boat for ${b.cost} gp` : 'free ferry', tiles: 0 };
    const landing: Leg = { kind: 'walk', label: `from ${b.to.label} to the target`, tiles: dist(b.to, inp.to) };
    const option: TravelOption = {
      id: b.id, title: b.name,
      legs: [{ kind: 'walk', label: `to ${b.from.label}`, tiles: dist(inp.from, b.from) }, ride, landing],
      walkTiles: tiles,
      availability: ok === false ? 'locked' : ok && !b.needs?.length ? 'ready' : 'maybe',
      needs: [
        ...(b.cost > 0 ? [{ text: `${b.cost} gp in coins${coins !== null ? ` (in the bag: ${coins})` : ''}`, ok, item: { name: 'Coins', need: b.cost, have: coins, bank: bankOf(inp, 'Coins') } }] : []),
        ...(b.needs ?? []).map((text) => ({ text, ok: null })),
      ],
      ...(b.note ? { note: b.note } : {}),
    };
    out.push(option);
    // The fare is in the bank: the same boat after a stop there.
    const prepared = withPreparation(option, inp, direct, (from) => ({
      legs: [{ kind: 'walk', label: `to ${b.from.label}`, tiles: dist(from, b.from) }, ride, landing],
      tiles: dist(from, b.from) + dist(b.to, inp.to),
    }));
    if (prepared) out.push(prepared);
  }

  // Fairy rings and charter ships (members), and the tablets that may have to be fetched first.
  // On a known free-to-play account the members-only ways are left out: they are noise there, not "not yet".
  const fairy = inp.members === false || inp.fairyRings === false ? null : fairyOption(inp);
  if (fairy) out.push(fairy);
  const charter = inp.members === false ? null : charterOption(inp);
  if (charter) out.push(charter);
  const spirit = spiritTreeOption(inp);
  if (spirit) out.push(spirit);
  const glider = gliderOption(inp);
  if (glider) out.push(glider);
  const cowbell = cowbellOption(inp);
  if (cowbell) {
    out.push(cowbell);
    // Empty, with Air runes in the bank: the same teleport after a stop there.
    const prepared = withPreparation(cowbell, inp, direct, () => ({ legs: cowbell.legs, tiles: cowbell.walkTiles }));
    if (prepared) out.push(prepared);
  }
  out.push(...itemTeleportOptions(inp, direct));

  const rank = (o: TravelOption) => (o.availability === 'ready' ? 0 : o.availability === 'maybe' ? 1 : 2);
  return out.filter((o) => o.id === 'walk' || effectiveTiles(o) + MIN_SAVING_TILES <= direct).sort((x, y) => rank(x) - rank(y) || effectiveTiles(x) - effectiveTiles(y));
}

/** "40 tiles · running at least 12 s": the lower bound — obstacles, combat and energy make it longer. */
export function walkText(tiles: number): string {
  if (tiles <= 0) return 'on the spot';
  const sec = Math.ceil(tiles / TILES_PER_SECOND);
  return `${tiles} tiles · running at least ${sec < 90 ? `${sec} s` : `${Math.round(sec / 60)} min`}`;
}
