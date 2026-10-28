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
import { EXCHANGE, NET, STAIRS_TILES_PER_FLOOR, TRANSPORT, dist, effectiveTiles, nearestBank, prepareFor, shortOf, travelOptions, type DetourDecision, type ItemSource, type Point, type TravelOption } from './travel';
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
    const plan = planSources({ name, need, shortage: true, detail: detailByName.get(key), gePrice: priceOf?.(name) ?? null, kinds: ['shop', 'ge'] }, state);
    for (const o of [plan.primary, ...plan.alternatives]) {
      if (!o?.point) continue;
      if (o.kind === 'shop') return { kind: 'shop', where: o.label.replace(/\.(?= — )/, ''), point: { x: o.point.x, y: o.point.y, plane: o.point.plane }, price: o.price ?? null, ...(o.fee ? { fee: o.fee } : {}) };
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
 * Stock up for the road: one trip that gets everything the paying teleports still lack. The road's supply list counts the bag, the worn items and
 * the bank together, so a thing the bank holds and the bag does not is a withdrawal on the same trip, and what nobody holds is bought where the source
 * router says. The rules (the owner's audit of 2.54.2):
 *  - a way counts only when every item it lacks can be had on this trip (a Fire rune alone is no Varrock Teleport without its Law rune);
 *  - a shop or a bank is on the trip when the player stands by it, or when it is on the way and what it gives is confirmed (an unread count is not
 *    worth a detour);
 *  - the whole trip must still pay: the road's saving minus the detour the stops add, at least SUPPLY_MIN_TOTAL_TILES;
 *  - coins: a known total too small for the purchases means no trip; coins short in the bag but in the bank are withdrawn on the way;
 *  - what is not confirmed (an unread bank, the book's charges) is said: "up to N", and what to check, including a lacking item off the trip.
 * null when nothing qualifies.
 */
export function supplyStop(supplies: TravelSupplies, pos: Point, to: Point): { rec: RecommendedTransport; detail: NonNullable<TransportDecision['supply']> } | null {
  type Fetch = { item: SupplyItem; qty: number; action: 'buy' | 'withdraw'; price: number | null };
  type Group = { action: 'buy' | 'withdraw'; where: string; point: Point; fetches: Fetch[] };
  const groups: Group[] = [];
  const add = (action: Group['action'], where: string, point: Point, f: Fetch) => {
    const g = groups.find((x) => x.action === action && dist(x.point, point) <= 6);
    if (g) g.fetches.push(f); else groups.push({ action, where, point, fetches: [f] });
  };
  const bank = nearestBank(pos);
  /** Items that must be fetched for their ways to work: bought (short after the bank) or taken from the bank (there, not carried). */
  const lacking = new Set<SupplyItem>();
  for (const it of supplies.items) {
    if (it.buy > 0) {
      lacking.add(it);
      if (it.source && it.source.kind !== 'free') add('buy', it.source.where, it.source.point, { item: it, qty: it.buy, action: 'buy', price: it.source.price });
    }
    if (it.inBag === undefined || it.inBag === null || it.inBank === undefined || it.inBank === null) continue;
    const fromBank = it.need - (it.covered ?? 0) - it.buy - it.inBag;
    if (fromBank <= 0) continue;
    lacking.add(it);
    if (bank && it.inBank >= fromBank) add('withdraw', bank.label, bank, { item: it, qty: fromBank, action: 'withdraw', price: 0 });
  }

  // What this trip can get: what the player stands by, and what is on the way and confirmed.
  const stairs = (g: Group) => (g.action === 'withdraw' ? Math.abs(g.point.plane - pos.plane) * STAIRS_TILES_PER_FLOOR : 0);
  const reach: (Group & { tiles: number })[] = [];
  for (const g of groups) {
    const tiles = dist(pos, g.point) + stairs(g);
    const near = tiles <= SUPPLY_NEAR_TILES;
    const extra = tiles + dist(g.point, to) - dist(pos, to);
    const fetches = near ? g.fetches : extra <= AHEAD_MAX_EXTRA_TILES ? g.fetches.filter((f) => f.item.certain) : [];
    if (fetches.length) reach.push({ ...g, fetches, tiles });
  }
  const onTrip = new Map<SupplyItem, Set<Group['action']>>();
  for (const r of reach) for (const f of r.fetches) onTrip.set(f.item, new Set([...(onTrip.get(f.item) ?? []), f.action]));
  const covers = (it: SupplyItem) => {
    const how = onTrip.get(it);
    if (!how) return false;
    // Both a purchase and a withdrawal needed: both must be on the trip.
    const needsBuy = it.buy > 0;
    const needsBank = it.inBag !== undefined && it.inBag !== null && it.need - (it.covered ?? 0) - it.buy - it.inBag > 0;
    return (!needsBuy || how.has('buy')) && (!needsBank || how.has('withdraw'));
  };
  const wayOf = (f: string) => f.replace(/ ×\d+$/, '');
  const offTrip = new Set<SupplyItem>();
  const paying = supplies.uses.filter((u) => {
    const lacks = [...lacking].filter((x) => x.for.some((f) => wayOf(f) === u.way));
    if (!lacks.some(covers)) return false;
    // A lacking item off the trip holds the way back when it is confirmed; when it is not (an unread bank), it may well be there: it is named, not hidden.
    if (!lacks.every((x) => covers(x) || !x.certain)) return false;
    for (const x of lacks) if (!covers(x)) offTrip.add(x);
    return true;
  });
  const wayNames = new Set(paying.map((u) => u.way));
  const trip = reach
    .map((r) => ({ ...r, fetches: r.fetches.filter((f) => f.item.for.some((w) => wayNames.has(wayOf(w)))) }))
    .filter((r) => r.fetches.length);
  if (!trip.length) return null;

  // Coins for the purchases: a known total that is too small means no trip; short in the bag but in the bank: withdrawn on the way.
  const buys = trip.flatMap((r) => (r.action === 'buy' ? r.fetches : []));
  const cost = buys.some((f) => f.price === null) ? null : buys.reduce((sum, f) => sum + (f.price ?? 0) * f.qty, 0);
  const coins = supplies.coins;
  let coinsUnsure = false;
  if (cost !== null && cost > 0 && coins) {
    const bag = coins.bag ?? 0;
    if (coins.bag !== null && coins.bank !== null && bag + coins.bank < cost) return null;
    if (bag < cost) {
      if (coins.bank !== null && bank) {
        const coinItem: SupplyItem = { name: 'Coins', need: cost, have: bag + coins.bank, buy: 0, certain: true, source: null, cost: 0, for: [], inBag: bag, inBank: coins.bank };
        const f: Fetch = { item: coinItem, qty: cost - bag, action: 'withdraw', price: 0 };
        const g = trip.find((r) => r.action === 'withdraw' && dist(r.point, bank) <= 6);
        if (g) g.fetches.push(f); else trip.push({ action: 'withdraw', where: bank.label, point: bank, fetches: [f], tiles: dist(pos, bank) + Math.abs(bank.plane - pos.plane) * STAIRS_TILES_PER_FLOOR });
      } else {
        coinsUnsure = true;
      }
    }
  }

  // The order: nearest first from where the player is; the whole walk against going straight there.
  const ordered: (typeof trip)[number][] = [];
  const left = [...trip];
  let at: Point = pos;
  let walk = 0;
  while (left.length) {
    let best = 0;
    left.forEach((g, i) => { if (dist(at, g.point) < dist(at, left[best].point)) best = i; });
    const g = left.splice(best, 1)[0];
    const leg = dist(at, g.point) + stairs(g);
    ordered.push({ ...g, tiles: leg });
    walk += leg;
    at = g.point;
  }
  walk += dist(at, to);
  const detour = Math.max(0, walk - dist(pos, to));
  const saved = paying.reduce((sum, u) => sum + u.savedTiles, 0) - detour;
  if (saved < SUPPLY_MIN_TOTAL_TILES) return null;

  const items = ordered.flatMap((r) => r.fetches.map((f) => f.item));
  const first = ordered[0];
  const placeOf = (where: string) => (where === EXCHANGE.label ? `the ${where}` : where.replace(/ — .*$/, ''));
  const what = ordered.flatMap((r) => r.fetches.map((f) => `${f.item.name} ×${f.qty}`));
  const unsure = buys.some((f) => !f.item.certain);
  const price = cost === null ? '' : cost > 0 ? ` (~${cost} gp)` : '';
  const ways = [...new Set(items.flatMap((x) => x.for))];
  // "take X from the bank; buy Y at the shop; Z at the exchange": the verb is said again only when it changes.
  const parts = (withUpTo: boolean) => {
    let verb = '';
    let saidUpTo = false;
    return ordered.map((r) => {
      const list = r.fetches.map((f) => `${f.item.name} ×${f.qty}`).join(', ');
      const v = r.action === 'withdraw' ? 'take' : 'buy';
      const head = v === verb ? '' : `${v} `;
      verb = v;
      const upTo = withUpTo && v === 'buy' && unsure && !saidUpTo ? 'up to ' : '';
      if (upTo) saidUpTo = true;
      return r.action === 'withdraw' ? `${head}${list} from ${placeOf(r.where)}` : `${head}${upTo}${list} at ${placeOf(r.where)}`;
    }).join('; ');
  };
  const doing = parts(true);
  const place = ordered.map((r) => placeOf(r.where)).join(' and ');
  const uses = items.flatMap((x) => (x.use ? [x.use] : []));
  const checks = [
    ...(unsure ? [items.some((x) => x.name === 'Teleport card' && !x.certain) ? 'check the book’s charges first' : 'check your bank first'] : []),
    ...(offTrip.size ? [`check your bank for ${[...offTrip].map((x) => x.name).join(', ')}`] : []),
    ...(coinsUnsure ? ['check you have the coins'] : []),
  ];
  const check = checks.join(' · ');
  const cap = (s: string) => `${s[0].toUpperCase()}${s.slice(1)}`;
  const summary = `Stock up for the road: ${doing}${price} · ${ways.join(', ')} save ${savedText(saved)}${check ? ` · ${check}` : ''}`;
  const chronicle = items.some((x) => x.name === 'Teleport card' || x.name === 'Chronicle');
  const stops = ordered.map((r) => ({
    action: r.action, where: r.where, point: r.point, items: r.fetches.map((f) => ({ name: f.item.name, qty: f.qty, price: r.action === 'buy' ? f.price : 0 })), tiles: r.tiles,
  }));
  const text = `For the next ${supplies.steps} steps: ${ways.join(', ')} save ${savedText(saved)}. ${cap(doing)}${price}.${uses.length ? ` Then ${uses.join('; ')}.` : ''}${check ? ` ${cap(check)}.` : ''}`;
  const verbFirst = first.action === 'withdraw' ? 'Take' : 'Buy';
  return {
    rec: {
      type: chronicle ? 'item_teleport' : 'spell_teleport', destination: place, interactionId: 0, tile: { x: first.point.x, y: first.point.y, plane: first.point.plane },
      text: text.length <= 200 ? text : `${text.slice(0, 199)}…`,
      chip: `⚡ ${verbFirst} ${what.join(', ')}`.slice(0, 60),
      state: 'prepare', summary,
      prepare: {
        text: `${cap(parts(false))}${price}.${uses.length ? ` Then ${uses.join('; ')}.` : ''}`,
        withdraw: ordered.flatMap((r) => (r.action === 'withdraw' ? r.fetches.map((f) => ({ name: f.item.name, quantity: f.qty })) : [])),
        buy: ordered.flatMap((r) => (r.action === 'buy' ? r.fetches.map((f) => ({ name: f.item.name, quantity: f.qty, where: r.where })) : [])),
        stops, cost,
      },
      savedTiles: saved,
    },
    detail: { where: ordered.map((r) => r.where).join(' and '), items: what, savedTiles: saved, steps: supplies.steps, tiles: first.tiles },
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

