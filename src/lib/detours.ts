// Opportunistic procurement: while the player is near a place that sells or makes something the next steps need, say so ("Detour: get Red dye at Aggie").
// The teleport tablets have their own logic in travel.ts; this is the rest: dyes, raw materials, pots - anything the preparation plan has a known place for.
//
// Every candidate is judged and the verdict is logged with its reason, so a suggestion that never shows can be explained from the log: the place is too far
// out of the way, saves too little, has no price, or is a thing we do not fetch this way. The app only suggests: it never buys.

import type { PrepLine, PrepPlan } from './prepPlan';
import { TILES_PER_SECOND, dist, emitDecision, EXCHANGE, type DetourDecision, type Point } from './travel';

export type { DetourDecision, DetourRejection } from './travel';

export interface Detour {
  /** One line for the game and the app: "Detour: Buy Orange dye at the Grand Exchange (+12 tiles, saves ~3 min)". */
  text: string;
  stop: Point & { label: string };
  items: string[];
  /** Tiles added to the walk now. */
  extraTiles: number;
}

/** The place is worth a stop if it adds at most this many tiles to the walk now... */
export const DETOUR_MAX_EXTRA_TILES = 60;
/** ...or if the player is already this close to it (a stop next to you is cheap whatever the target). */
export const DETOUR_NEAR_TILES = 30;
/** A later separate trip must be at least this many tiles longer than the stop now, or it saves nothing worth a line. */
export const DETOUR_MIN_SAVING_TILES = 40;
/** The steps where buying in bulk at the exchange comes first: the Varrock shopping stages. */
export const GE_PRIORITY_STEPS: ReadonlySet<string> = new Set(['S2-01', 'S2-05']);
/** Within this many tiles of the exchange its stop gets the priority on those steps. */
export const GE_PRIORITY_TILES = 90;

const VERB: Record<string, string> = { BUY: 'Buy', GATHER: 'Get', TAKE: 'Take' };

const time = (tiles: number) => {
  const sec = Math.max(1, Math.round(tiles / TILES_PER_SECOND));
  return sec < 90 ? `${sec} s` : `${Math.round(sec / 60)} min`;
};
const round10 = (n: number) => Math.round(n / 10) * 10;

interface Candidate { line: PrepLine; stop: Point & { label: string }; kind: string }

function candidatesOf(plan: Pick<PrepPlan, 'now' | 'soon'>, log: (d: DetourDecision) => void): Candidate[] {
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
    out.push({ line: l, stop: { x: nav.x, y: nav.y, plane: nav.plane, label: nav.label.split(':')[0] }, kind: l.action.kind });
  }
  return out;
}

/**
 * The best stop on the way, or null. from/to: where the player is and where the step goes; coins: what the bag holds (null: unknown).
 * stepId: the Varrock shopping steps give the exchange priority.
 */
export function procurementDetour(i: { plan: Pick<PrepPlan, 'now' | 'soon'>; stepId: string; from: Point; to: Point; coins: number | null; onDecision?: (d: DetourDecision) => void }): Detour | null {
  const log = (d: DetourDecision) => emitDecision(d, i.onDecision);
  const direct = dist(i.from, i.to);
  const groups = new Map<string, { stop: Point & { label: string }; items: Candidate[] }>();
  for (const c of candidatesOf(i.plan, log)) {
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
    const toStop = dist(i.from, g.stop);
    const extra = Math.max(0, toStop + dist(g.stop, i.to) - direct);
    // Coming back for it later costs a round trip from the target; the stop now costs only the extra.
    const later = 2 * dist(i.to, g.stop);
    const names = g.items.map((c) => c.line.name);
    const subject = `${g.stop.label}: ${names.join(', ')}`;
    const priceSum = g.items.reduce((s, c) => s + (c.line.action?.price ?? 0) * Math.max(1, c.line.toGet ?? 1), 0);
    if (i.coins !== null && g.items.some((c) => c.kind === 'BUY') && priceSum > i.coins) {
      log({ subject, outcome: 'rejected', reason: 'missing_coins', detail: { price: priceSum, coins: i.coins } });
      continue;
    }
    // The bulk purchase of the Varrock shopping steps may be a longer walk: it is the point of the step.
    const bulk = GE_PRIORITY_STEPS.has(i.stepId) && g.stop.x === EXCHANGE.x && g.stop.y === EXCHANGE.y && toStop <= GE_PRIORITY_TILES;
    if (extra > DETOUR_MAX_EXTRA_TILES && toStop > DETOUR_NEAR_TILES && !bulk) {
      log({ subject, outcome: 'rejected', reason: 'exceeds_detour_limit', detail: { extra, toStop, limit: DETOUR_MAX_EXTRA_TILES } });
      continue;
    }
    if (later - extra < DETOUR_MIN_SAVING_TILES) {
      log({ subject, outcome: 'rejected', reason: 'insufficient_savings', detail: { extra, later, minSaving: DETOUR_MIN_SAVING_TILES } });
      continue;
    }
    log({ subject, outcome: 'offered', detail: { extra, toStop, later } });
    const verbs = [...new Set(g.items.map((c) => VERB[c.kind]))];
    const place = g.stop.x === EXCHANGE.x && g.stop.y === EXCHANGE.y ? 'the Grand Exchange' : g.stop.label;
    const text = `Detour: ${verbs.length === 1 ? verbs[0] : 'Get'} ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''} at ${place} (+${round10(extra)} tiles, saves ~${time(later - extra)})`;
    // The Varrock shopping steps put the exchange first when it is close; otherwise the cheapest extra walk, then the most items.
    const priority = bulk ? 1_000_000 : 0;
    const score = priority + g.items.length * 100 - extra;
    if (!best || score > best.score) best = { detour: { text, stop: g.stop, items: names, extraTiles: extra }, score };
  }
  return best?.detour ?? null;
}
