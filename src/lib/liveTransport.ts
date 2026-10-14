// The transport decision for the step shown in the game, in one place: where the player is, where the confirmed line of the step leads, what is in
// the bag and the bank, and from that the one recommendation the game card and the app both show. The planner is travel.ts; where a missing thing is
// bought comes from the source router; nothing here owns a list of its own.
//
// The decision is kept with the verdict on every candidate (why it was chosen or not, what it lacks, what the trip costs): the developer diagnostics.
// It is computed when something changes (a poll, a jump, the bag, the bank, the target), never per frame, and it is not part of the support report.

import type { Step } from '../types';
import type { QuestInstruction } from '../services/runeliteBridge';
import { items as itemData } from '../data';
import { nameKey } from './checklist';
import { isInstancedPoint, isOverworld } from './instances';
import type { PlayerState } from './playerState';
import { planSources } from './sourceRouter';
import { stepPlaces } from './stepPlaces';
import { instructionSubStep } from './subStep';
import { TIP_MIN_SAVING_TILES } from './tips';
import { judgeTransport, journeyTiles, recommendedTransport, type RecommendedTransport, type TransportVerdict } from './transport';
import { EXCHANGE, NET, TRANSPORT, dist, effectiveTiles, prepareFor, shortOf, travelOptions, type DetourDecision, type ItemSource, type Point, type TravelOption } from './travel';
import { travelInputOf, type TravelInputSources } from './travelInput';
import { SUPPLY_MIN_TOTAL_TILES, savedText, type SupplyItem, type TravelSupplies } from './travelSupplies';

/** Where the transport has to bring the player: the tile of the quest line the game confirms, otherwise the step's own place. */
export interface TransportTarget { point: Point & { label?: string }; source: 'instruction' | 'step' }

/**
 * The objective of the step right now. The quest line the plugin confirms (its own cursor, never a temporary arrow: a stop at a shop or a bank is not the
 * objective) wins when it has a tile; a line the player is only looking at ("peeking") is not the confirmed one.
 */
export function transportTarget(step: Step, instruction: QuestInstruction | null): TransportTarget | null {
  const sub = instruction && !instruction.peeking ? instructionSubStep(step, instruction) : null;
  if (sub?.target) return { point: { x: sub.target.x, y: sub.target.y, plane: sub.target.plane, label: sub.target.label }, source: 'instruction' };
  const place = stepPlaces(step)[0];
  return place ? { point: { x: place.x, y: place.y, plane: place.plane, label: place.label }, source: 'step' } : null;
}

const detailByName = new Map(itemData.map((i) => [nameKey(i.nameEn), i]));
/** The things of the ways that are traded at the exchange: runes, axes, tablets. The Chronicle is not traded: it has its shop. */
const TRADED = new Set<string>([
  ...TRANSPORT.teleports.flatMap((t) => Object.keys(t.runes ?? {}).map((r) => `${r[0].toUpperCase()}${r.slice(1)} rune`)),
  ...TRANSPORT.canoe.axes, ...NET.tablets.map((t) => t.item),
].map(nameKey));

/**
 * Where a thing a way lacks is bought, by the app's source router: the shop the item database lists for this game mode (its own tile), otherwise the
 * exchange for a thing that is traded there, with the price from the price book or unknown. Coins are not bought; a thing with no place gives null.
 */
export function transportSources(state: PlayerState, priceOf?: (name: string) => number | undefined): (name: string, need: number) => ItemSource | null {
  return (name, need) => {
    const key = nameKey(name);
    if (key === 'coins') return null;
    const plan = planSources({ name, need, detail: detailByName.get(key), gePrice: priceOf?.(name), kinds: ['shop', 'ge'] }, state);
    for (const o of [plan.primary, ...plan.alternatives]) {
      if (!o?.point) continue;
      if (o.kind === 'shop') return { kind: 'shop', where: o.label.replace(/\.(?= — )/, ''), point: { x: o.point.x, y: o.point.y, plane: o.point.plane }, price: o.price ?? null };
      if (o.kind === 'ge') return { kind: 'exchange', where: EXCHANGE.label, point: EXCHANGE, price: o.price ?? null };
    }
    return TRADED.has(key) ? { kind: 'exchange', where: EXCHANGE.label, point: EXCHANGE, price: priceOf?.(name) ?? null } : null;
  };
}

export interface TransportDecision {
  stepId: string;
  /** When it was computed (ms). */
  at: number;
  from: Point | null;
  to: (Point & { label?: string }) | null;
  /** What the target is: the confirmed quest line, or the step's own place. */
  target: TransportTarget['source'] | null;
  /** Why nothing was judged: no position from the game, no place for the step, a point off the world map. */
  skipped?: 'no_position' | 'no_target' | 'off_map';
  /** The straight-line walk, in tiles. */
  walkTiles: number | null;
  recommended: RecommendedTransport | null;
  /** Every candidate with its verdict. */
  verdicts: TransportVerdict[];
  /** The verdicts on the stops that would fetch what a way lacks (too far, saves too little, no place to get it, ...). */
  fetch: DetourDecision[];
  /** The same for the next leg, when the recommendation prepares it ahead. */
  ahead?: { stepId: string; to: Point & { label?: string }; verdicts: TransportVerdict[] };
  /** The supplies of the road ahead, when the line is a stop to stock up for it. */
  supply?: { where: string; items: string[]; savedTiles: number; steps: number; tiles: number };
}

export interface TransportInput extends Omit<TravelInputSources, 'from' | 'to'> {
  step: Step;
  /** Where the player is; null: the game did not say. */
  pos: Point | null;
  instruction: QuestInstruction | null;
  /** The next open step of the route, for the "get it before you leave" look-ahead; null: none. */
  nextStep?: Step | null;
  /** What the road ahead needs (travelSupplies.ts): a shop on the way that sells it becomes a "stock up here" line. */
  supplies?: TravelSupplies | null;
  now?: number;
}

/** A stop on the way now is worth it for the next leg when it adds no more than this to the current walk... */
export const AHEAD_MAX_EXTRA_TILES = 60;
/** ...or when the player already stands this close to it. The same numbers the purchase detours use. */
export const AHEAD_NEAR_TILES = 30;

/**
 * Before leaving: a way that will clearly shorten the NEXT leg (from this step's place to the next step's) but lacks runes, coins or an axe that are
 * cheap to get right now, on the way. The stops are judged from where the player stands; the saving is the next leg's, less the extra walk and the time
 * at the stops. null when nothing qualifies; every candidate is logged with its numbers.
 */
function prepareAhead(i: TransportInput, pos: Point, to: Point, sources: TravelInputSources, log: (d: DetourDecision) => void): { rec: RecommendedTransport; verdicts: TransportVerdict[]; next: Step; nextTo: Point & { label?: string } } | null {
  const next = i.nextStep;
  const nextTo = next ? stepPlaces(next)[0] : undefined;
  if (!next || !nextTo || !isOverworld(nextTo) || isInstancedPoint(nextTo)) return null;
  // The next leg as it will be walked: from this step's place, with what is in the bag now and nothing fetched on that leg.
  const { sourceOf: _none, ...plain } = sources;
  const future = travelOptions(travelInputOf({ ...plain, from: to, to: nextTo }));
  const walk = future.find((o) => o.id === 'walk');
  if (!walk) return null;
  // The stops are found from where the player is now, with the source router.
  const nowInput = travelInputOf({ ...sources, from: pos, to });
  let best: { prepared: TravelOption; saved: number } | null = null;
  for (const o of future) {
    const missing = shortOf(o.needs);
    if (o.id === 'walk' || o.prepare || o.acquire || !missing.length) continue;
    // Only a way that lacks countable things and nothing else: a level or a quest is not bought.
    if (o.needs.some((n) => n.ok !== true && !(n.item && n.item.have !== null))) continue;
    const futureSaving = walk.walkTiles - effectiveTiles(o);
    if (futureSaving < TIP_MIN_SAVING_TILES) continue;
    const subject = `${o.title} (next leg)`;
    const p = prepareFor(missing, nowInput);
    if ('reject' in p) { log({ subject, outcome: 'rejected', reason: p.reject, detail: { item: p.what, futureSaving } }); continue; }
    const extra = Math.max(0, p.tiles + dist(p.end, to) - dist(pos, to));
    const prepared: TravelOption = { ...o, id: `${o.id}-prepare`, availability: 'maybe', prepare: p.prep, walkTiles: o.walkTiles + extra, needs: o.needs.filter((n) => !n.item) };
    const saved = walk.walkTiles - journeyTiles(prepared);
    const detail = { futureSaving, extra, fetch: p.tiles, stops: p.prep.stops.length, saved, cost: p.prep.cost };
    if (extra > AHEAD_MAX_EXTRA_TILES && p.prep.stops[0].tiles > AHEAD_NEAR_TILES) { log({ subject, outcome: 'rejected', reason: 'exceeds_detour_limit', detail }); continue; }
    if (saved < TIP_MIN_SAVING_TILES) { log({ subject, outcome: 'rejected', reason: 'insufficient_savings', detail }); continue; }
    log({ subject, outcome: 'offered', detail });
    if (!best || saved > best.saved) best = { prepared, saved };
  }
  if (!best) return null;
  // The planner's own wording of a prepared way, said as something to do before leaving.
  const rec = recommendedTransport([walk, best.prepared]);
  if (!rec?.prepare) return null;
  return {
    rec: { ...rec, summary: `Next step: ${rec.summary}`, text: `For the way to the next step (${next.title}): ${rec.text}` },
    verdicts: judgeTransport(future).verdicts, next, nextTo: { x: nextTo.x, y: nextTo.y, plane: nextTo.plane, label: nextTo.label },
  };
}

/** A stop to stock up is suggested when the player stands this close to the shop... */
export const SUPPLY_NEAR_TILES = 40;

/**
 * Stock up for the road: the shop or the exchange where the road's teleport supplies are sold, when the player stands by it, or when it is on the way
 * and what is short there is confirmed. Near the shop an unconfirmed count is said as "up to N" with what to check (the book's charges, the bank).
 * The saving is the road's: the uses those supplies pay for. null when nothing qualifies.
 */
export function supplyStop(supplies: TravelSupplies, pos: Point, to: Point): { rec: RecommendedTransport; detail: NonNullable<TransportDecision['supply']> } | null {
  const groups: { where: string; point: Point; items: SupplyItem[] }[] = [];
  for (const it of supplies.items) {
    if (it.buy <= 0 || !it.source || it.source.kind === 'free') continue;
    const g = groups.find((x) => dist(x.point, it.source!.point) <= 6);
    if (g) g.items.push(it); else groups.push({ where: it.source.where, point: it.source.point, items: [it] });
  }
  let best: { g: (typeof groups)[number]; items: SupplyItem[]; saved: number; tiles: number } | null = null;
  for (const g of groups) {
    const tiles = dist(pos, g.point);
    const near = tiles <= SUPPLY_NEAR_TILES;
    const extra = tiles + dist(g.point, to) - dist(pos, to);
    // On the way but not at the shop: only what is confirmed to be short is worth the detour.
    const items = near ? g.items : extra <= AHEAD_MAX_EXTRA_TILES ? g.items.filter((x) => x.certain) : [];
    if (!items.length) continue;
    const ways = new Set(items.flatMap((x) => x.for.map((f) => f.replace(/ ×\d+$/, ''))));
    const saved = supplies.uses.filter((u) => ways.has(u.way)).reduce((sum, u) => sum + u.savedTiles, 0);
    if (saved < SUPPLY_MIN_TOTAL_TILES) continue;
    if (!best || saved > best.saved) best = { g, items, saved, tiles };
  }
  if (!best) return null;
  const { g, items, saved } = best;
  const what = items.map((x) => `${x.name} ×${x.buy}`);
  const unsure = items.some((x) => !x.certain);
  const price = items.some((x) => x.cost === null) ? '' : ` (~${items.reduce((sum, x) => sum + (x.cost ?? 0), 0)} gp)`;
  const ways = [...new Set(items.flatMap((x) => x.for))];
  const place = g.where === EXCHANGE.label ? `the ${g.where}` : g.where.replace(/ — .*$/, '');
  const uses = items.flatMap((x) => (x.use ? [x.use] : []));
  const check = unsure ? (items.some((x) => x.name === 'Teleport card' && !x.certain) ? 'check the book’s charges first' : 'check your bank first') : '';
  const summary = `Stock up for the road: buy ${unsure ? 'up to ' : ''}${what.join(', ')} at ${place}${price} · ${ways.join(', ')} save ${savedText(saved)}${check ? ` · ${check}` : ''}`;
  const chronicle = items.some((x) => x.name === 'Teleport card' || x.name === 'Chronicle');
  const stop = { action: 'buy' as const, where: g.where, point: g.point, items: items.map((x) => ({ name: x.name, qty: x.buy, price: x.source?.price ?? null })), tiles: best.tiles };
  const text = `For the next ${supplies.steps} steps: ${ways.join(', ')} save ${savedText(saved)}. Buy ${unsure ? 'up to ' : ''}${what.join(', ')} at ${place}${price}.${uses.length ? ` Then ${uses.join('; ')}.` : ''}${check ? ` ${check[0].toUpperCase()}${check.slice(1)}.` : ''}`;
  return {
    rec: {
      type: chronicle ? 'item_teleport' : 'spell_teleport', destination: place, interactionId: 0, tile: { x: g.point.x, y: g.point.y, plane: g.point.plane },
      text: text.length <= 200 ? text : `${text.slice(0, 199)}…`,
      chip: `⚡ Buy ${what.join(', ')}`.slice(0, 60),
      state: 'prepare', summary,
      prepare: {
        text: `Buy ${what.join(', ')} at ${place}${price}.${uses.length ? ` Then ${uses.join('; ')}.` : ''}`,
        withdraw: [], buy: items.map((x) => ({ name: x.name, quantity: x.buy, where: g.where })), stops: [stop], cost: items.some((x) => x.cost === null) ? null : items.reduce((sum, x) => sum + (x.cost ?? 0), 0),
      },
      savedTiles: saved,
    },
    detail: { where: g.where, items: what, savedTiles: saved, steps: supplies.steps, tiles: best.tiles },
  };
}

/**
 * The decision for the step shown in the game. Unknown stays unknown: no position gives no recommendation, an unreported bank is never "empty",
 * and a point off the world map (a dungeon, an instance) is not routed over.
 */
export function decideTransport(i: TransportInput): TransportDecision {
  const at = i.now ?? Date.now();
  const target = transportTarget(i.step, i.instruction);
  const base: TransportDecision = { stepId: i.step.id, at, from: i.pos, to: target?.point ?? null, target: target?.source ?? null, walkTiles: null, recommended: null, verdicts: [], fetch: [] };
  if (!i.pos) return { ...base, skipped: 'no_position' };
  if (!target) return { ...base, skipped: 'no_target' };
  const to = target.point;
  if (!isOverworld(i.pos) || !isOverworld(to) || isInstancedPoint(i.pos) || isInstancedPoint(to)) return { ...base, skipped: 'off_map' };
  const fetch: DetourDecision[] = [];
  const { step: _s, pos: _p, instruction: _q, nextStep: _n, now: _t, supplies: _u, ...sources } = i;
  const src: TravelInputSources = { ...sources, from: i.pos, to };
  const options = travelOptions({ ...travelInputOf(src), onDecision: (d) => fetch.push(d) });
  const { verdicts } = judgeTransport(options);
  const here = recommendedTransport(options);
  const walkTiles = dist(i.pos, to);
  // A shop that sells what the road ahead needs (cards for the book, runes for the spells): standing by it, stocking up comes first (it takes a moment
  // and the way of this leg is still there afterwards); on the way to it, only when this leg has no way of its own.
  const stock = i.supplies ? supplyStop(i.supplies, i.pos, to) : null;
  if (stock && (!here || stock.detail.tiles <= SUPPLY_NEAR_TILES)) return { ...base, walkTiles, recommended: stock.rec, verdicts, fetch, supply: stock.detail };
  if (here) return { ...base, walkTiles, recommended: here, verdicts, fetch };
  const ahead = prepareAhead(i, i.pos, to, src, (d) => fetch.push(d));
  return {
    ...base, walkTiles, recommended: ahead?.rec ?? null, verdicts, fetch,
    ...(ahead ? { ahead: { stepId: ahead.next.id, to: ahead.nextTo, verdicts: ahead.verdicts } } : {}),
  };
}

// ---------- The last decision, for the app's own line and the developer ----------

let last: TransportDecision | null = null;
const listeners = new Set<() => void>();

/** What changes when the decision changes for a reader: not the clock. */
const keyOf = (d: TransportDecision | null) => (d ? JSON.stringify({ ...d, at: 0 }) : '');

/**
 * Publish the decision of the step shown in the game (null: no step is shown). With localStorage "osrs-put:debug-transport" = "1" the report is logged when
 * it changes and kept at window.__osrsPathTransport; without the flag nothing is logged and nothing is put on the window.
 */
export function publishTransport(d: TransportDecision | null): void {
  if (keyOf(d) === keyOf(last)) return;
  last = d;
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('osrs-put:debug-transport') === '1') {
      // For the developer only: the report in the console when it changes, and the latest one on the window for the DevTools.
      const report = d ? transportReport(d) : null;
      (globalThis as { __osrsPathTransport?: unknown }).__osrsPathTransport = report;
      if (report) console.debug('[transport]', JSON.stringify(report));
    }
  } catch { /* no storage */ }
  for (const l of listeners) l();
}

export function lastTransport(): TransportDecision | null {
  return last;
}

export function subscribeTransport(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** The decision as a developer reads it: the target, the walk, the choice, and one line per candidate with the reason. No bag or bank listing. */
export function transportReport(d: TransportDecision): Record<string, unknown> {
  const row = (v: TransportVerdict) => `${v.outcome === 'chosen' ? '✓' : '✗'} ${v.title} [${v.availability === 'locked' ? 'locked' : v.state}] walk ${v.walkTiles}, journey ${v.journeyTiles}, saves ${v.savedTiles}${v.reason ? ` — ${v.reason}` : ''}${v.needs.length ? ` — needs: ${v.needs.join('; ')}` : ''}`;
  return {
    step: d.stepId, target: d.target, from: d.from, to: d.to, walkTiles: d.walkTiles, ...(d.skipped ? { skipped: d.skipped } : {}),
    recommended: d.recommended ? { state: d.recommended.state, summary: d.recommended.summary, savedTiles: d.recommended.savedTiles } : null,
    candidates: d.verdicts.map(row),
    fetch: d.fetch.map((f) => `${f.outcome} ${f.subject}${f.reason ? ` — ${f.reason}` : ''}${f.caveat ? ` (${f.caveat})` : ''} ${JSON.stringify(f.detail)}`),
    ...(d.ahead ? { nextLeg: { step: d.ahead.stepId, to: d.ahead.to, candidates: d.ahead.verdicts.map(row) } } : {}),
    ...(d.supply ? { supply: d.supply } : {}),
  };
}

