// Supplies for the road ahead: before a long run, which teleports will clearly shorten the coming legs of the route, how many times, and what to get
// for them (Teleport cards for the Chronicle, runes for the spells, the book itself) and where. The guide's "stock up before you leave".
//
// The legs are the route's own: the canonical quest lines with a tile, otherwise the step's place, in route order. Each leg is judged by the planner
// (travel.ts) as if the player carried every teleport they can use (their levels, their spellbook, their worn staff), and a teleport is counted only
// where it beats walking and every other way (a canoe, a boat) by the tip threshold. The counts are then held against what the game reports in the
// bag, the bank and the book; what is not known stays unknown ("up to"), never zero. The app only suggests: it never buys.

import type { Step } from '../types';
import type { QuestInstruction } from '../services/runeliteBridge';
import { nameKey, type OwnedState } from './checklist';
import { isInstancedPoint, isOverworld } from './instances';
import { stepPlaces } from './stepPlaces';
import { instructionSubStep } from './subStep';
import { TIP_MIN_SAVING_TILES } from './tips';
import { journeyTiles } from './transport';
import { TILES_PER_SECOND, TRANSPORT, dist, runeName, staffCover, travelOptions, type ItemSource, type Point, type TravelInput } from './travel';
import type { GearItem, GearState } from '../services/runeliteBridge';

/** How many open steps ahead "the road" covers in the game: about one stage of the route. */
export const SUPPLY_HORIZON_STEPS = 8;
/** Targets closer than this to the one before are the same place (two lines with the same NPC). */
const SAME_PLACE_TILES = 10;
/** A supply run is worth suggesting only when the teleports it buys save at least this much in all (about two tip-sized savings). */
export const SUPPLY_MIN_TOTAL_TILES = 2 * TIP_MIN_SAVING_TILES;

export interface RouteTarget extends Point { label: string; stepId: string }

/**
 * The places a step leads to, in order: the canonical quest lines that have a tile (each stage by its quest value, lines in order), otherwise the step's
 * own place. A step in progress starts at the line the game confirms. Two lines at the same spot are one place.
 */
export function stepTargets(step: Step, instruction?: QuestInstruction | null): RouteTarget[] {
  const out: RouteTarget[] = [];
  const qs = step.questStages;
  if (qs) {
    const live = instruction && instruction.stepId === step.id && !instruction.peeking ? instruction : null;
    for (const stage of [...qs.stages].sort((a, b) => a.at - b.at)) {
      if (live && stage.at < live.stageAt) continue;
      stage.do.forEach((_, i) => {
        if (live && stage.at === live.stageAt && i < live.lineIndex) return;
        const t = instructionSubStep(step, { stepId: step.id, stageAt: stage.at, lineIndex: i, peeking: false })?.target;
        if (t) out.push({ x: t.x, y: t.y, plane: t.plane, label: t.label, stepId: step.id });
      });
    }
  }
  if (!out.length) {
    const place = stepPlaces(step)[0];
    if (place) out.push({ x: place.x, y: place.y, plane: place.plane, label: place.label, stepId: step.id });
  }
  return out.filter((t, i) => i === 0 || dist(out[i - 1], t) > SAME_PLACE_TILES || out[i - 1].plane !== t.plane);
}

/** A leg of the road where a teleport that needs supplies is the best way. */
export interface SupplyLeg { stepId: string; from: Point; to: RouteTarget; wayId: string; way: string; savedTiles: number }

export interface SupplyUse { wayId: string; way: string; count: number; savedTiles: number }

export interface SupplyItem {
  name: string;
  /** For all the uses on the road. */
  need: number;
  /** In the bag, worn and in the bank (for Teleport cards also the charges already in the book); null: not known. */
  have: number | null;
  /** need − have when have is known; when it is not, what may be missing at most ("up to"). */
  buy: number;
  /** false: have is unknown, so buy is an upper estimate, not a confirmed shortage. */
  certain: boolean;
  /** Where to get it (the source router), with the price per piece; null: no place is known. */
  source: ItemSource | null;
  /** buy × price; null when the price is not known. */
  cost: number | null;
  /** What it is for: "Chronicle ×9", "Varrock Teleport ×2". */
  for: string[];
  /** How to use it once bought ("use them on the Chronicle: one card, one charge"). */
  use?: string;
}

export interface TravelSupplies {
  legs: SupplyLeg[];
  uses: SupplyUse[];
  items: SupplyItem[];
  /** Tiles the counted teleports save over the road. */
  savedTiles: number;
  /** How many steps the road covers. */
  steps: number;
  /** Staves the player carries but does not wield that would save runes on the road: "wield your Staff of air: no Air runes needed". */
  staffHints: string[];
}

export interface SupplyInput {
  /** The steps of the road, in route order (open ones). */
  steps: readonly Step[];
  /** Where the player is now: the first leg starts here. null: from the first step's first place. */
  from?: Point | null;
  /** The game's confirmed quest line of the first step, so a step in progress starts where the player is in it. */
  instruction?: QuestInstruction | null;
  levels: Readonly<Record<string, number | undefined>>;
  members?: boolean | null;
  /** Worn and carried things from the game; null: no game. */
  gear: GearState | null;
  owned: OwnedState | null | undefined;
  /** The spellbook from the game (0 standard); null or absent: assumed standard (the route's spells are on it). */
  spellbook?: number | null;
  chronicleCharges?: number | null;
  sourceOf?: (name: string, need: number) => ItemSource | null;
}

const CHRONICLE = TRANSPORT.teleports.find((t) => t.charges && t.items?.length);
/** Enough of everything for the planner's "if you had it" view of a leg. */
const PLENTY = 1000;

/** Every leg of the road: from the player (or the first place) through each step's places in order. Off-map and instanced points are skipped. */
export function roadLegs(inp: Pick<SupplyInput, 'steps' | 'from' | 'instruction'>): { stepId: string; from: Point; to: RouteTarget }[] {
  const legs: { stepId: string; from: Point; to: RouteTarget }[] = [];
  let at: Point | null = inp.from ?? null;
  inp.steps.forEach((step, n) => {
    for (const t of stepTargets(step, n === 0 ? inp.instruction : null)) {
      // A place underground or in an instance is not on the map: the player comes back up where they went down, so the road goes on from the last
      // place on the surface.
      if (!isOverworld(t) || isInstancedPoint(t)) continue;
      if (at && isOverworld(at) && !isInstancedPoint(at)) legs.push({ stepId: step.id, from: at, to: t });
      at = t;
    }
  });
  return legs;
}

const counted = (items: readonly GearItem[] | null | undefined, name: string) =>
  (items ?? []).filter((i) => i.name === name).reduce((s, i) => s + (i.count ?? 1), 0);

/** What the player has of a thing: bag and worn from the gear, the bank from the game's report; null when the bank is not known and the bag is short. */
function haveOf(name: string, need: number, gear: GearState | null, owned: OwnedState | null | undefined): number | null {
  if (!gear) return null;
  const onHand = counted(gear.inventory, name) + counted(gear.equipment, name);
  const bank = owned?.bankSeen ? owned.items.get(nameKey(name))?.bank : undefined;
  if (typeof bank === 'number') return onHand + bank;
  return onHand >= need ? onHand : null;
}

/**
 * The supplies for the road: the teleports that clearly pay off on its legs and what to get for them. Nothing is counted for a leg a free way
 * (walking, a canoe the player can use, a boat) does as well or better.
 */
export function planTravelSupplies(inp: SupplyInput): TravelSupplies {
  const legs: SupplyLeg[] = [];
  const carried: GearItem[] = [
    ...(inp.gear?.equipment ?? []), ...(inp.gear?.inventory ?? []),
    // As if every supply were on hand: the book (charged) and the runes of every spell.
    ...(CHRONICLE ? [{ id: -1, name: CHRONICLE.items![0], count: 1 }] : []),
    ...[...new Set(TRANSPORT.teleports.flatMap((t) => Object.keys(t.runes ?? {})))].map((r, i) => ({ id: -2 - i, name: runeName(r), count: PLENTY })),
  ];
  const base: Omit<TravelInput, 'from' | 'to'> = {
    levels: inp.levels, carried, worn: inp.gear?.equipment ?? null, bankSeen: true, bank: null, members: inp.members,
    chronicleCharges: PLENTY,
    // The Home Teleport is free but once every 30 minutes: it is not a supply, and it is not counted on.
    homeCooldownSec: 30 * 60, standardSpellbook: inp.spellbook === undefined || inp.spellbook === null ? true : inp.spellbook === 0,
  };
  const supplied = new Set(TRANSPORT.teleports.filter((t) => t.kind === 'spell' || t.charges).map((t) => t.id));
  for (const leg of roadLegs(inp)) {
    const direct = dist(leg.from, leg.to);
    if (direct < TIP_MIN_SAVING_TILES) continue;
    const options = travelOptions({ ...base, from: leg.from, to: leg.to })
      .filter((o) => o.availability === 'ready' && !o.prepare && !o.acquire);
    const best = options.sort((a, b) => journeyTiles(a) - journeyTiles(b))[0];
    if (!best || !supplied.has(best.id)) continue;
    const saved = direct - journeyTiles(best);
    if (saved < TIP_MIN_SAVING_TILES) continue;
    legs.push({ stepId: leg.stepId, from: leg.from, to: leg.to, wayId: best.id, way: best.title, savedTiles: saved });
  }

  const uses: SupplyUse[] = [];
  for (const l of legs) {
    const u = uses.find((x) => x.wayId === l.wayId);
    if (u) { u.count++; u.savedTiles += l.savedTiles; } else uses.push({ wayId: l.wayId, way: l.way, count: 1, savedTiles: l.savedTiles });
  }

  // What the uses consume: a charge per teleport, the runes per cast (a rune the worn staff gives costs nothing).
  const needs = new Map<string, { need: number; for: string[]; use?: string }>();
  const add = (name: string, n: number, forWhat: string, use?: string) => {
    const e = needs.get(name) ?? { need: 0, for: [], ...(use ? { use } : {}) };
    e.need += n;
    if (!e.for.includes(forWhat)) e.for.push(forWhat);
    needs.set(name, e);
  };
  const staffHints: string[] = [];
  const wornOnly = { carried: inp.gear?.equipment ?? null, worn: inp.gear?.equipment ?? null, members: inp.members };
  const bagToo = { carried: [...(inp.gear?.equipment ?? []), ...(inp.gear?.inventory ?? [])], worn: inp.gear?.equipment ?? null, members: inp.members };
  for (const u of uses) {
    const t = TRANSPORT.teleports.find((x) => x.id === u.wayId);
    if (!t) continue;
    const label = `${t.name} ×${u.count}`;
    if (t.charges) {
      const book = t.items![0];
      add(t.charges.item, u.count * t.charges.perItem, label, `use them on the ${book}: one card, one charge`);
      add(book, 1, label);
      continue;
    }
    for (const [rune, qty] of Object.entries(t.runes ?? {})) {
      if (staffCover(rune, wornOnly)) continue;
      const inBag = staffCover(rune, bagToo);
      if (inBag && !inBag.worn) staffHints.push(`wield your ${inBag.staff}: no ${runeName(rune)}s needed for ${t.name}`);
      add(runeName(rune), qty * u.count, label);
    }
  }

  const items: SupplyItem[] = [];
  for (const [name, e] of needs) {
    let have: number | null;
    if (CHRONICLE && name === CHRONICLE.items![0]) {
      // The book: one is enough, wherever it is.
      have = haveOf(name, 1, inp.gear, inp.owned);
      if (have !== null) have = Math.min(have, 1);
      e.need = 1;
    } else if (CHRONICLE?.charges && name === CHRONICLE.charges.item) {
      // Teleport cards: the charges already in the book count, so do the cards on hand and in the bank.
      const cards = haveOf(name, e.need, inp.gear, inp.owned);
      const charges = inp.chronicleCharges ?? null;
      have = charges === null ? (cards !== null && cards >= e.need ? cards : null) : cards === null ? (charges >= e.need ? charges : null) : charges + cards;
    } else {
      have = haveOf(name, e.need, inp.gear, inp.owned);
    }
    const buy = Math.max(0, e.need - (have ?? 0));
    const source = buy > 0 ? inp.sourceOf?.(name, buy) ?? null : null;
    items.push({
      name, need: e.need, have, buy, certain: have !== null, source,
      cost: source && source.price !== null ? source.price * buy : buy === 0 ? 0 : null,
      for: e.for, ...(e.use ? { use: e.use } : {}),
    });
  }
  return { legs, uses, items, savedTiles: legs.reduce((s, l) => s + l.savedTiles, 0), steps: inp.steps.length, staffHints: [...new Set(staffHints)] };
}

/** "~6 min" for the tiles saved. */
export function savedText(tiles: number): string {
  const s = Math.max(1, Math.ceil(tiles / TILES_PER_SECOND));
  return s < 90 ? `~${s} s` : `~${Math.round(s / 60)} min`;
}

/** The open steps of the road from a step on: the step itself (when open) and the next ones in route order. */
export function roadSteps(steps: readonly Step[], isOpen: (id: string) => boolean, fromId: string, n = SUPPLY_HORIZON_STEPS): Step[] {
  const at = steps.findIndex((s) => s.id === fromId);
  if (at < 0) return [];
  return steps.slice(at).filter((s) => isOpen(s.id)).slice(0, n);
}
