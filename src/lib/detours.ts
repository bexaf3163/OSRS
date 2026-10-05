// Opportunistic procurement: while the player is near a place that sells or makes something the next steps need, say so ("Detour: Get Red dye at Aggie").
// The teleport tablets have their own logic in travel.ts; this is the rest: dyes, raw materials, pots - anything the preparation plan has a known place for.
// A thing that already lies in the bank is never bought: the stop is the nearest bank ("Bank: Withdraw Spade").
//
// Every candidate is judged and the verdict is logged with its reason, so a suggestion that never shows can be explained from the log: the place is too far
// out of the way, saves too little, has no price, or is a thing we do not fetch this way. The app only suggests: it never buys.

import recipesJson from '../data/recipes.json';
import type { PrepLine, PrepPlan } from './prepPlan';
import {
  OPPORTUNISTIC_MAX_DETOUR_TILES, OPPORTUNISTIC_MAX_EXCHANGE_TILES, TILES_PER_SECOND, bankOnRoute, dist, emitDecision, EXCHANGE, reachTiles,
  type DetourDecision, type Point, type TravelInput,
} from './travel';

export type { DetourDecision, DetourRejection } from './travel';

export type DetourAction = 'BUY' | 'GET' | 'WITHDRAW';

export interface Detour {
  /** One line for the game and the app: "Detour: Buy Orange dye at the Grand Exchange (+12 tiles, saves ~3 min)". */
  text: string;
  stop: Point & { label: string };
  items: string[];
  /** Tiles added to the walk now. */
  extraTiles: number;
  actionType: DetourAction;
  /** The teleport that shortens the way to the stop, if one does. */
  via?: string;
}

/** A stop that adds at most this many tiles to the walk now is cheap... */
export const DETOUR_MAX_EXTRA_TILES = 60;
/** ...and so is any stop the player is already this close to (a stop next to you is cheap whatever the target). */
export const DETOUR_NEAR_TILES = 30;
/** A later separate trip must be at least this many tiles longer than the stop now, or it saves nothing worth a line. */
export const DETOUR_MIN_SAVING_TILES = 40;
/** The steps where buying in bulk at the exchange comes first: the Varrock shopping stages. */
export const GE_PRIORITY_STEPS: ReadonlySet<string> = new Set(['S2-01', 'S2-05']);
/** Within this many tiles of the exchange its stop gets the priority on those steps. */
export const GE_PRIORITY_TILES = 90;
/** Time at the counter: the walk in, the trade, the walk out. Counted once per stop. */
export const STOP_SECONDS = 20;
/** A blocker's purchase must beat making it by hand by at least this many seconds. */
export const BLOCKER_MIN_SAVED_SECONDS = 30;

const VERB: Record<string, string> = { BUY: 'Buy', GATHER: 'Get', TAKE: 'Withdraw' };
const ACTION: Record<string, DetourAction> = { BUY: 'BUY', GATHER: 'GET', TAKE: 'WITHDRAW' };
const MANUAL = (recipesJson as { recipes: Record<string, { manualSeconds?: number }> }).recipes;

const seconds = (tiles: number) => Math.max(1, Math.round(tiles / TILES_PER_SECOND));
const timeText = (sec: number) => (sec < 90 ? `${Math.max(1, Math.round(sec))} s` : `${Math.round(sec / 60)} min`);
const round10 = (n: number) => Math.round(n / 10) * 10;
const isExchange = (p: Point & { label?: string }) => dist(p, EXCHANGE) <= 6 || /grand exchange/i.test(p.label ?? '');

interface Candidate { line: PrepLine; stop: Point & { label: string }; kind: string }

function candidatesOf(plan: Pick<PrepPlan, 'now' | 'soon'>, log: (d: DetourDecision) => void, from: Point, to: Point): Candidate[] {
  const out: Candidate[] = [];
  for (const l of [...plan.now, ...plan.soon]) {
    const nav = l.action?.nav;
    if (l.where !== 'MISSING' && l.where !== 'BANK') continue;
    if (!nav || !l.action || !VERB[l.action.kind]) {
      log({ subject: l.name, outcome: 'rejected', reason: 'not_whitelisted', detail: { action: l.action?.kind ?? null, hasPlace: nav ? 1 : 0 } });
      continue;
    }
    if (l.action.kind === 'BUY' && l.action.price === undefined) {
      log({ subject: l.name, outcome: 'rejected', reason: 'price_unknown', detail: { place: nav.label } });
      continue;
    }
    // An item in the bank is never bought: the stop is the bank that costs the least extra walk on the way, not the one nearest the step.
    const bank = l.action.kind === 'TAKE' ? bankOnRoute(from, to) : null;
    const stop = bank ?? { x: nav.x, y: nav.y, plane: nav.plane, label: nav.label.split(':')[0] };
    out.push({ line: l, stop, kind: l.action.kind });
  }
  return out;
}

/** The player's inventory side of the planner input: what the teleports need. Without it the way to a stop is on foot. */
export type DetourTravel = Pick<TravelInput, 'levels' | 'carried' | 'bankSeen' | 'homeCooldownSec'>;

/**
 * The best stop on the way, or null. from/to: where the player is and where the step goes; coins: what the bag holds (null: unknown).
 * stepId: the Varrock shopping steps give the exchange priority and an item of the current step is a blocker. travel: the bag, for the teleports.
 */
export function procurementDetour(i: {
  plan: Pick<PrepPlan, 'now' | 'soon'>; stepId: string; from: Point; to: Point; coins: number | null; travel?: DetourTravel; onDecision?: (d: DetourDecision) => void;
}): Detour | null {
  const log = (d: DetourDecision) => emitDecision(d, i.onDecision);
  const direct = dist(i.from, i.to);
  const inv = { from: i.from, levels: i.travel?.levels ?? {}, carried: i.travel?.carried ?? null, bankSeen: i.travel?.bankSeen ?? false, homeCooldownSec: i.travel?.homeCooldownSec ?? null };
  const groups = new Map<string, { stop: Point & { label: string }; items: Candidate[] }>();
  for (const c of candidatesOf(i.plan, log, i.from, i.to)) {
    if (c.stop.plane !== i.from.plane) {
      log({ subject: c.line.name, outcome: 'rejected', reason: 'exceeds_detour_limit', detail: { reason: 'another floor' } });
      continue;
    }
    // Items at the same place (within a few tiles) are one stop.
    const key = `${Math.round(c.stop.x / 4)}:${Math.round(c.stop.y / 4)}`;
    const g = groups.get(key) ?? { stop: c.stop, items: [] };
    g.items.push(c);
    groups.set(key, g);
  }
  let best: { detour: Detour; score: number } | null = null;
  for (const g of groups.values()) {
    const reach = reachTiles(inv, g.stop);
    const toStop = reach.tiles;
    const extra = Math.max(0, toStop + dist(g.stop, i.to) - direct);
    // Coming back for it later costs a round trip from the target; the stop now costs only the extra.
    const later = 2 * dist(i.to, g.stop);
    const names = g.items.map((c) => c.line.name);
    const subject = `${g.stop.label}: ${names.join(', ')}`;
    const exchange = isExchange(g.stop);
    const priceSum = g.items.reduce((s, c) => s + (c.line.action?.price ?? 0) * Math.max(1, c.line.toGet ?? 1), 0);
    if (i.coins !== null && g.items.some((c) => c.kind === 'BUY') && priceSum > i.coins) {
      log({ subject, outcome: 'rejected', reason: 'missing_coins', detail: { price: priceSum, coins: i.coins } });
      continue;
    }
    // The walk to the stop has its own cap by kind of place: the exchange sells everything, a vendor or a bank is worth a shorter walk.
    const cap = exchange ? OPPORTUNISTIC_MAX_EXCHANGE_TILES : OPPORTUNISTIC_MAX_DETOUR_TILES;
    if (toStop > cap) {
      log({ subject, outcome: 'rejected', reason: 'exceeds_detour_limit', detail: { toStop, cap, via: reach.via ?? null } });
      continue;
    }
    // A blocker is an item of the current step that has to be in the bag before it can be done. For it the question is time: buying beats making it by hand.
    const blockers = g.items.filter((c) => c.line.priority === 'CRITICAL' && c.line.timing === 'NOW' && c.line.usedIn[0] === i.stepId);
    const manual = blockers.reduce((s, c) => s + (MANUAL[c.line.name]?.manualSeconds ?? 0), 0);
    const bulk = GE_PRIORITY_STEPS.has(i.stepId) && exchange && toStop <= GE_PRIORITY_TILES;
    const extraSec = seconds(extra) + STOP_SECONDS;
    let savedSec = seconds(later - extra);
    if (manual > 0) {
      savedSec = manual - extraSec;
      if (savedSec < BLOCKER_MIN_SAVED_SECONDS) {
        log({ subject, outcome: 'rejected', reason: 'insufficient_savings', detail: { manualSeconds: manual, extraSeconds: extraSec, minSaved: BLOCKER_MIN_SAVED_SECONDS } });
        continue;
      }
    } else {
      if (!blockers.length && !bulk && extra > DETOUR_MAX_EXTRA_TILES && toStop > DETOUR_NEAR_TILES) {
        log({ subject, outcome: 'rejected', reason: 'exceeds_detour_limit', detail: { extra, toStop, limit: DETOUR_MAX_EXTRA_TILES } });
        continue;
      }
      if (later - extra < DETOUR_MIN_SAVING_TILES) {
        log({ subject, outcome: 'rejected', reason: 'insufficient_savings', detail: { extra, later, minSaving: DETOUR_MIN_SAVING_TILES } });
        continue;
      }
    }
    log({ subject, outcome: 'offered', detail: { extra, toStop, later, blocker: blockers.length, via: reach.via ?? null } });
    const kinds = [...new Set(g.items.map((c) => c.kind))];
    const actionType: DetourAction = kinds.length === 1 ? ACTION[kinds[0]] : 'GET';
    const place = exchange ? 'the Grand Exchange' : g.stop.label;
    const list = `${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''}`;
    const tail = `(+${round10(extra)} tiles${reach.via ? `, by ${reach.via}` : ''}, saves ~${timeText(savedSec)})`;
    const text = actionType === 'WITHDRAW' ? `Bank: Withdraw ${list} at ${place} ${tail}` : `Detour: ${kinds.length === 1 ? VERB[kinds[0]] : 'Get'} ${list} at ${place} ${tail}`;
    // The Varrock shopping steps put the exchange first when it is close; a blocker next; otherwise the cheapest extra walk, then the most items.
    const score = (bulk ? 1_000_000 : 0) + (blockers.length ? 100_000 : 0) + g.items.length * 100 - extra;
    if (!best || score > best.score) best = { detour: { text, stop: g.stop, items: names, extraTiles: extra, actionType, ...(reach.via ? { via: reach.via } : {}) }, score };
  }
  return best?.detour ?? null;
}
