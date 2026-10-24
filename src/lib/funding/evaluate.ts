// One method judged for one player: can they do it, what does it really pay after tax, travel and supplies, how much money must be at risk first, and how long
// until the money they are short of is in their hands.
//
// Two questions are kept apart on purpose:
//   1. Eligibility - can this account do it now, and is its first batch affordable? (blockers, never a score)
//   2. Economics - what it pays per hour in steady state, and how long a small target takes once start-up, trips and sales are counted.
// A high hourly profit is never proof of feasibility: a method whose first batch costs more than the player has, whose product cannot be sold under the account's
// restrictions, or whose price is unknown is ineligible however well it pays.
//
// What is counted:
//   - dependable income only: drops at or above DEPENDABLE_CHANCE (1/16) per unit. Rarer drops are reported as upside and never used for a time estimate;
//   - the exchange tax per item (ge.ts), the instant sell side of the quote, never more than the hour's average;
//   - owned inputs reduce the cash needed but are not free: the plan states them, the economics still values them;
//   - protected items are filled first: the first Big bones a step needs are not income;
//   - the bag: a trip yields only as many units as the slots allow (inputs go out, outputs come back);
//   - the market: a product cannot be sold faster than a quarter of an hour's trades (quotes.ts), nor an input bought faster than its exchange limit;
//   - the way: the walk to the work, to the bank and to the exchange (tiles from the travel model).
// Ranges, not points: fast / typical / slow, and the slow case also takes a haircut off low-confidence sale prices.

import { PICKAXES, AXES, usableAt } from '../toolTiers';
import { nameKey } from '../checklist';
import { isRestrictedItem } from '../tradeRestriction';
import { TILES_PER_SECOND, type Point } from '../travel';
import { geTax } from './ge';
import { expectedQty, isDependable } from './methods';
import { absorbs, ABSORB_SHARE, CONFIDENCE_RANK, type Confidence, type PriceView, type UnitPrice } from './quotes';
import { protectedQty, reserveGap, type FundingSnapshot } from './snapshot';
import type { Flow, FundingMethod, Requirement } from './types';

export interface Range3 { fast: number; typical: number; slow: number }

/** What the combat model (or any personal model) says about one unit of a method for this player, replacing the published figures. */
export interface Personalised {
  secondsPerUnit: Range3;
  /** Consumables per unit that the model adds (food per kill). */
  extraInputs: Flow[];
  /** A cap on units per trip beyond the bag (food that fits is already in extraInputs; this is for model limits). */
  unitsPerTrip?: number;
  confidence: Confidence;
  basis: string;
  notes: string[];
  /** A short warning the model wants shown ("food-intensive"). */
  caution?: string;
}

export interface ObservedRate {
  unitsPerHour: number;
  /** Units seen and seconds of actual work: the rate is trusted only past the thresholds below. */
  units: number;
  activeSeconds: number;
}
export const OBSERVED_MIN_UNITS = 20;
export const OBSERVED_MIN_SECONDS = 600;

export interface EvalContext {
  now: number;
  prices: PriceView;
  snap: FundingSnapshot;
  /** Coins that may be spent on this method's inputs; null — the player's coins are not known. */
  cash: number | null;
  /** earn: coins to bring in. supply: the items to gather instead of buying (name -> quantity). */
  mode: 'earn' | 'supply';
  target: number;
  needItems?: ReadonlyMap<string, number>;
  /** Tiles between two points, with the player's teleports; null — no way is known. */
  reach(from: Point | null, to: Point): number | null;
  exchange: Point;
  personalise?(m: FundingMethod): Personalised | null;
  observed?: ReadonlyMap<string, ObservedRate>;
  /** The foes and skills of the step being prepared: a method that trains the same thing gets credit for it. */
  active?: { foes?: readonly string[]; skills?: readonly string[] };
}

export type BlockerKind = 'membership' | 'ironman' | 'level' | 'quest' | 'qp' | 'tool' | 'sale' | 'price' | 'capital' | 'combat' | 'market';
export interface Blocker { kind: BlockerKind; text: string; /** true — the player can fix it (train, buy, finish a quest). */ fixable: boolean }

/**
 * One requirement as this player meets it, for the details of the Money section (2.71): the same checks that make the blockers and the cautions, one line
 * each. ok - met; missing - not met (a blocker); buy - met by buying (a tool); unknown - could not be checked; info - a fact the game cannot tell.
 */
export interface RequirementCheck { text: string; status: 'ok' | 'missing' | 'buy' | 'unknown' | 'info' }

export interface MethodEvaluation {
  method: FundingMethod;
  eligible: boolean;
  blockers: Blocker[];
  cautions: string[];
  /** Every requirement and how this player meets it, in the catalogue's order, then the coins to start. */
  checks: RequirementCheck[];
  confidence: Confidence;
  confidenceReasons: string[];
  unitsPerHour: Range3;
  /** Coins an hour of steady work leaves after the tax and the supplies; dependable income only. */
  netPerHour: Range3;
  perUnit: { sale: number; coins: number; tax: number; inputs: number; net: number; upside: number };
  upfront: {
    /** Reusable tool bought for the work (not charged again). */
    setup: number;
    /** The smallest start worth making: a few units. */
    minimum: number;
    /** A full first trip. */
    firstTrip: number;
    /** Owned items the first trip uses: they reduce the cash, they are still counted as spent. */
    owned: { name: string; qty: number }[];
  };
  /** The most money the method has out before it pays for itself; null when it needs none or cannot be judged. */
  workingCapital: number | null;
  unitsPerTrip: number;
  /** Executable first batch at the available cash, distinct from bag capacity and four-hour market throughput. */
  preparation?: {
    units: number;
    tools: { name: string | null; owned: boolean; unknown: boolean; cost: number }[];
    inputs: { name: string; qty: number; owned: number; missing: number }[];
  };
  /** Minutes until the target is met, fast / typical / slow; null — it cannot be reached (see reason). */
  minutes: Range3 | null;
  minutesReason?: string;
  /** In supply mode: coins the gathered items replace buying. */
  saves: number | null;
  synergy: string | null;
  notes: string[];
}

const MIN_BATCH_UNITS = 3;
const MAX_TRIPS = 400;
/** Sell once per this many trips in steady state. */
const TRIPS_PER_SALE = 4;
/** The slow case takes this off sale prices that are not HIGH confidence. */
const HAIRCUT: Record<Confidence, number> = { HIGH: 0, MEDIUM: 0.1, LOW: 0.25 };
const gp = (n: number) => Math.round(n).toLocaleString('en-US');

// ---------------------------------------------------------------------------
// Rate scaling for published figures

function levelFactor(m: FundingMethod, snap: FundingSnapshot): { factor: number; unknown: boolean } {
  const s = m.rate.levelScale;
  if (!s) return { factor: 1, unknown: false };
  const lv = snap.level(s.skill);
  if (lv === undefined) return { factor: s.minFactor, unknown: true };
  const t = Math.min(1, Math.max(0, (lv - s.fromLevel) / (s.atLevel - s.fromLevel)));
  return { factor: s.minFactor + (1 - s.minFactor) * t, unknown: false };
}

interface ToolPlan {
  /** The tool the work will use. */
  name: string | null;
  owned: boolean;
  /** Coins to buy it when it is missing. */
  cost: number;
  /** The tool's presence could not be told (the bank was not opened). */
  unknown: boolean;
  blocker?: Blocker;
}

function planTool(req: Extract<Requirement, { kind: 'item' }>, ctx: EvalContext): ToolPlan {
  const { snap, prices } = ctx;
  const tiers = req.family === 'pickaxe' ? [...PICKAXES] : req.family === 'axe' ? [...AXES] : req.any.map((a) => a.name);
  const skillOf = req.family === 'pickaxe' ? 'mining' : req.family === 'axe' ? 'woodcutting' : null;
  const usable = tiers.filter((n) => usableAt(n, (sk) => snap.level(sk) ?? null, snap.members));
  const heldTiers = usable.filter((n) => snap.held(n).presence === 'PRESENT');
  if (heldTiers.length) return { name: heldTiers[heldTiers.length - 1], owned: true, cost: 0, unknown: false };
  const allUnknown = usable.length > 0 && usable.every((n) => snap.held(n).presence === 'UNKNOWN');
  // The cheapest usable tier that has a price is the one to buy.
  let best: { name: string; price: number } | null = null;
  for (const n of usable) {
    const p = prices.buy(n)?.price;
    if (p !== undefined && (best === null || p < best.price)) best = { name: n, price: p };
  }
  if (allUnknown) return { name: best?.name ?? null, owned: false, cost: 0, unknown: true };
  if (!best) {
    const lvl = skillOf ? snap.level(skillOf) : undefined;
    return {
      name: null, owned: false, cost: 0, unknown: false,
      blocker: { kind: 'tool', text: usable.length ? 'No price for a suitable tool' : `No tool you can use yet${lvl !== undefined ? ` at ${skillOf} ${lvl}` : ''}`, fixable: usable.length > 0 },
    };
  }
  return { name: best.name, owned: false, cost: best.price, unknown: false };
}

// ---------------------------------------------------------------------------
// The simulation: trips, sales, a small target

interface SimInput {
  /** Work/sale pace without input replenishment caps; owned inputs do not need a new GE allowance. */
  workSecPerUnit: number;
  unitsPerTrip: number;
  tripSeconds: number;
  firstLegSeconds: number;
  saleSeconds: number;
  faresPerTrip: number;
  /** Cash to start with; Infinity for the working-capital dry run. */
  cash: number;
  target: number;
  inputs: { price: number; perUnit: number; owned: number; buySecPerUnit?: number }[];
  coinsPerUnit: number;
  outputs: { netEach: number; perUnit: number; reserve: number }[];
  minUnits: number;
  /** The working-capital dry run sells after every trip, at no cost in time, to see the deepest the money goes. */
  sellEveryTrip?: boolean;
}

interface SimResult { ok: boolean; seconds: number; trips: number; units: number; peakOut: number; reason?: string }

/** Why a run with the player's own coins stops: the badge and the working-capital caution say the same sentence. */
const MONEY_RUNS_OUT = 'The money runs out before the method pays for itself';

function simulate(p: SimInput): SimResult {
  let cash = p.cash;
  const start = p.cash;
  let pending = 0;
  let seconds = p.firstLegSeconds;
  let units = 0;
  let trips = 0;
  let peakOut = 0;
  const owned = p.inputs.map((i) => i.owned);
  const reserve = p.outputs.map((o) => o.reserve);

  const cashFor = (u: number): number => p.inputs.reduce((s, i, k) => s + i.price * Math.max(0, i.perUnit * u - owned[k]), 0) + p.faresPerTrip;
  const sell = () => { seconds += p.saleSeconds; cash += pending; pending = 0; };

  while (trips < MAX_TRIPS) {
    // The largest batch the cash allows.
    let lo = 0;
    let hi = p.unitsPerTrip;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (cashFor(mid) <= cash) lo = mid; else hi = mid - 1;
    }
    const u = lo;
    if (u < Math.min(p.minUnits, p.unitsPerTrip)) {
      if (pending > 0) { sell(); continue; }
      return { ok: false, seconds, trips, units, peakOut, reason: MONEY_RUNS_OUT };
    }
    const spend = cashFor(u);
    const secPerUnit = p.inputs.reduce((pace, i, k) => Math.max(pace,
      i.perUnit * u > owned[k] ? i.buySecPerUnit ?? 0 : 0), p.workSecPerUnit);
    cash -= spend;
    peakOut = Math.max(peakOut, start - cash);
    p.inputs.forEach((i, k) => { owned[k] = Math.max(0, owned[k] - i.perUnit * u); });
    seconds += p.tripSeconds + u * secPerUnit;
    cash += p.coinsPerUnit * u;
    p.outputs.forEach((o, k) => {
      const made = o.perUnit * u;
      const toReserve = Math.min(made, reserve[k]);
      reserve[k] -= toReserve;
      pending += (made - toReserve) * o.netEach;
    });
    units += u;
    trips += 1;
    if (p.sellEveryTrip && pending > 0) { cash += pending; pending = 0; }
    if (cash - start + pending >= p.target) {
      if (pending > 0) sell();
      if (cash - start >= p.target) return { ok: true, seconds, trips, units, peakOut };
    } else if (pending > 0 && (cash < cashFor(Math.min(p.minUnits, p.unitsPerTrip)) || trips % TRIPS_PER_SALE === 0)) {
      sell();
    }
  }
  return { ok: false, seconds, trips, units, peakOut, reason: 'It would take more than a day of work' };
}

// ---------------------------------------------------------------------------

function sellView(f: Flow, ctx: EvalContext): UnitPrice | null {
  return ctx.prices.sell(f.item.name, f.item.id);
}

export function evaluate(m: FundingMethod, ctx: EvalContext): MethodEvaluation {
  const { snap, prices } = ctx;
  const blockers: Blocker[] = [];
  const cautions: string[] = [];
  const checks: RequirementCheck[] = [];
  const notes: string[] = [];
  const reasons: string[] = [];
  let confidence: Confidence = m.confidence;
  const cap = (c: Confidence, why: string) => {
    if (CONFIDENCE_RANK[c] < CONFIDENCE_RANK[confidence]) { confidence = c; reasons.push(why); }
  };

  // --- Access
  if (m.access === 'members' && !snap.members) blockers.push({ kind: 'membership', text: 'Needs membership', fixable: false });
  checks.push(m.access === 'members' ? { text: snap.members ? 'Membership' : 'Needs membership', status: snap.members ? 'ok' : 'missing' } : { text: 'Free-to-play', status: 'ok' });
  const usesExchange = ctx.mode === 'earn';
  if (usesExchange && snap.ironman === true) {
    blockers.push({ kind: 'ironman', text: 'An ironman account cannot use the Grand Exchange', fixable: false });
    checks.push({ text: 'An ironman account cannot use the Grand Exchange', status: 'missing' });
  }

  let faresPerTrip = 0;
  let tool: ToolPlan | null = null;
  const tools: ToolPlan[] = [];
  for (const r of m.requirements) {
    if (r.kind === 'level') {
      const lv = snap.level(r.skill);
      if (lv === undefined) { cautions.push(`Your ${r.skill} level is not known`); cap('MEDIUM', `${r.skill} level unknown`); checks.push({ text: `${r.skill} ${r.level}: your level is not known`, status: 'unknown' }); }
      else if (lv < r.level) { blockers.push({ kind: 'level', text: `Needs ${r.skill} ${r.level} (you have ${lv})`, fixable: true }); checks.push({ text: `Needs ${r.skill} ${r.level} (you have ${lv})`, status: 'missing' }); }
      else checks.push({ text: `${r.skill} ${r.level} (you have ${lv})`, status: 'ok' });
    } else if (r.kind === 'quest') {
      const q = snap.quest(r.quest);
      const what = `${r.quest}${r.state === 'started' ? ' started' : ''}`;
      if (q === 'NOT_DONE') { blockers.push({ kind: 'quest', text: `Needs ${what}`, fixable: true }); checks.push({ text: `Needs ${what}`, status: 'missing' }); }
      else if (q === 'UNKNOWN') { cautions.push(`${r.quest} could not be checked`); cap('MEDIUM', `${r.quest} unknown`); checks.push({ text: `${what}: could not be checked`, status: 'unknown' }); }
      else checks.push({ text: what, status: 'ok' });
    } else if (r.kind === 'qp') {
      if (snap.questPoints === null) { cautions.push('Quest points are not known'); cap('MEDIUM', 'quest points unknown'); checks.push({ text: `${r.points} quest points: not known`, status: 'unknown' }); }
      else if (snap.questPoints < r.points) { blockers.push({ kind: 'qp', text: `Needs ${r.points} quest points (you have ${snap.questPoints})`, fixable: true }); checks.push({ text: `Needs ${r.points} quest points (you have ${snap.questPoints})`, status: 'missing' }); }
      else checks.push({ text: `${r.points} quest points (you have ${snap.questPoints})`, status: 'ok' });
    } else if (r.kind === 'item' && r.role === 'tool') {
      tool = planTool(r, ctx);
      tools.push(tool);
      if (tool.blocker) { blockers.push(tool.blocker); checks.push({ text: tool.blocker.text, status: 'missing' }); }
      if (tool.unknown) { cautions.push('Whether you own a suitable tool is not known: open the bank'); cap('MEDIUM', 'tool unknown'); checks.push({ text: 'A suitable tool: not known, open the bank', status: 'unknown' }); }
      else if (tool.owned) checks.push({ text: `${tool.name} (you have one)`, status: 'ok' });
      else if (tool.name && !tool.blocker) checks.push({ text: `${tool.name}: buy one, about ${gp(tool.cost)} gp`, status: 'buy' });
    } else if (r.kind === 'fare') {
      const waived = r.unlessQuest ? snap.quest(r.unlessQuest) === 'DONE' : false;
      if (!waived) faresPerTrip += r.coins;
      checks.push(waived ? { text: `${r.reason}: free after ${r.unlessQuest}`, status: 'ok' } : { text: `${r.reason}: ${gp(r.coins)} gp a trip`, status: 'info' });
    } else if (r.kind === 'check') {
      cautions.push(r.text);
      checks.push({ text: r.text, status: 'info' });
    }
  }

  // --- Personal model (combat) and rate
  const pers = ctx.personalise?.(m) ?? null;
  if (m.combat && !pers) {
    cautions.push('Not personalised: connect RuneLite so your gear and levels can be checked');
    cap('LOW', 'combat model unavailable');
  }
  if (pers) {
    if (CONFIDENCE_RANK[pers.confidence] < CONFIDENCE_RANK[confidence]) cap(pers.confidence, pers.basis);
    notes.push(...pers.notes);
    if (pers.caution) cautions.push(pers.caution);
  }

  let sec: Range3;
  let rateNote = '';
  const obs = ctx.observed?.get(m.id);
  if (obs && obs.units >= OBSERVED_MIN_UNITS && obs.activeSeconds >= OBSERVED_MIN_SECONDS && obs.unitsPerHour > 0) {
    sec = { fast: 3600 / (obs.unitsPerHour * 1.15), typical: 3600 / obs.unitsPerHour, slow: 3600 / (obs.unitsPerHour * 0.85) };
    rateNote = 'your own pace from earlier sessions';
    if (CONFIDENCE_RANK[confidence] < CONFIDENCE_RANK.MEDIUM) confidence = 'MEDIUM';
  } else if (pers) {
    sec = pers.secondsPerUnit;
    rateNote = pers.basis;
  } else {
    const lf = levelFactor(m, snap);
    let toolFactor = 1;
    if (m.rate.toolScale && tool && tool.name && !m.rate.toolScale.better.some((b) => nameKey(b) === nameKey(tool!.name!))) toolFactor = m.rate.toolScale.below;
    const f = lf.factor * toolFactor;
    if (f < 1) notes.push(`The published pace is scaled to ${Math.round(f * 100)}% for your ${lf.factor < 1 ? 'level' : ''}${lf.factor < 1 && toolFactor < 1 ? ' and ' : ''}${toolFactor < 1 ? 'tool' : ''}`);
    sec = { fast: 3600 / (m.rate.perHour.fast * f), typical: 3600 / (m.rate.perHour.typical * f), slow: 3600 / (m.rate.perHour.slow * f) };
    rateNote = m.rate.basis === 'wiki-guide' ? 'the wiki guide, scaled' : 'the published pace';
    if (m.rate.basis === 'wiki-guide' && f < 1) cap('LOW', 'the pace is a published figure scaled by a rule, not measured');
    if (lf.unknown) cautions.push('Your level for this is not known: the slowest pace is assumed');
  }
  if (m.marketDependence) { cautions.push(m.marketDependence); cap('LOW', 'depends on other players or the market'); }

  // --- Flows
  const workSec = { ...sec };
  const inputs: { flow: Flow; price: number; per: number; owned: number; opp: number; buySecPerUnit?: number }[] = [];
  let inputCashPerUnit = 0;
  let coinsPerUnit = 0;
  let coinsUpsidePerUnit = 0;
  const ownedUsed: { name: string; qty: number }[] = [];
  for (const f of [...m.inputs, ...(pers?.extraInputs ?? [])]) {
    const per = expectedQty(f);
    if (f.item.id === 995) { inputCashPerUnit += per; inputs.push({ flow: f, price: 1, per, owned: 0, opp: 0 }); continue; }
    const price = prices.buy(f.item.name, f.item.id);
    if (!price) { blockers.push({ kind: 'price', text: `No price for ${f.item.name}`, fixable: false }); continue; }
    if (CONFIDENCE_RANK[price.confidence] < CONFIDENCE_RANK[confidence]) cap(price.confidence, `${f.item.name} price: ${price.notes[0] ?? 'low confidence'}`);
    const h = snap.held(f.item.name);
    const spare = h.total === null ? 0 : Math.max(0, h.total - protectedQty(snap, f.item.name));
    const lim = prices.limitOf(f.item.name, f.item.id);
    inputs.push({ flow: f, price: price.price, per, owned: spare, opp: (prices.sell(f.item.name, f.item.id)?.price ?? price.price),
      ...(lim !== undefined ? { buySecPerUnit: 14400 * per / lim } : {}) });
    inputCashPerUnit += price.price * per;
    if (lim !== undefined) {
      const capUnitsPerHour = (lim / 4) / per;
      const floor = 3600 / capUnitsPerHour;
      if (floor > sec.typical) notes.push(`The exchange buy limit on ${f.item.name} caps this at about ${gp(capUnitsPerHour)} an hour`);
      sec = { fast: Math.max(sec.fast, floor), typical: Math.max(sec.typical, floor), slow: Math.max(sec.slow, floor) };
    }
  }

  const outs: { flow: Flow; per: number; netEach: number; reserve: number; sellable: boolean; dependable: boolean }[] = [];
  let saleGrossPerUnit = 0;
  let taxPerUnit = 0;
  let upsidePerUnit = 0;
  let restrictedUnknown = false;
  let anySellable = false;
  let marketCapPerHour = Infinity;
  const sellConfidences: Confidence[] = [];
  for (const f of m.outputs) {
    const per = expectedQty(f);
    const dep = isDependable(f);
    if (f.item.id === 995) {
      if (dep) coinsPerUnit += per; else coinsUpsidePerUnit += per;
      anySellable = true;
      continue;
    }
    // Under a restriction the exchange refuses the sale; an unknown restriction lets the plan go ahead but says so.
    const restricted = isRestrictedItem(f.item.name);
    let sellable = true;
    if (restricted && snap.restriction.state === 'RESTRICTED') sellable = false;
    if (restricted && snap.restriction.state === 'UNKNOWN') restrictedUnknown = true;
    const price = sellView(f, ctx);
    if (sellable && !price) { if (dep) blockers.push({ kind: 'price', text: `No price for ${f.item.name}`, fixable: false }); sellable = false; }
    const sellEach = price?.price ?? 0;
    const taxEach = sellable ? geTax(sellEach, f.item.name) : 0;
    const netEach = sellable ? sellEach - taxEach : 0;
    const reserve = reserveGap(snap, f.item.name);
    if (dep && sellable && price) {
      anySellable = true;
      sellConfidences.push(price.confidence);
      saleGrossPerUnit += sellEach * per;
      taxPerUnit += taxEach * per;
      if (CONFIDENCE_RANK[price.confidence] < CONFIDENCE_RANK[confidence]) cap(price.confidence, `${f.item.name} price: ${price.notes[0] ?? 'low confidence'}`);
      // Owned inputs can remove a purchase bottleneck; their faster production must still respect sale liquidity.
      const a = absorbs(price, per * (3600 / workSec.typical));
      if (a.plausible === false && price.volumePerHour !== null) {
        const capUnits = (ABSORB_SHARE * price.volumePerHour) / per;
        marketCapPerHour = Math.min(marketCapPerHour, capUnits);
        notes.push(`The market takes about ${gp(capUnits * per)} ${f.item.name} an hour, which limits the pace`);
        if (price.volumePerHour < 30) cap('LOW', `${f.item.name} trades only ${price.volumePerHour} an hour`);
      } else if (a.plausible === null) {
        cap('MEDIUM', `${f.item.name}: trading volume unknown`);
      }
    } else if (!dep && sellable && price) {
      upsidePerUnit += (sellEach - taxEach) * per;
    }
    outs.push({ flow: f, per, netEach, reserve, sellable, dependable: dep });
  }
  if (restrictedUnknown) {
    cautions.push('Selling needs your account to be past the new-account limits (20 hours of play cannot be read from the game)');
    cap('MEDIUM', 'trade restrictions unknown');
  }
  if (ctx.mode === 'earn' && !anySellable && !blockers.some((b) => b.kind === 'price')) {
    blockers.push({ kind: 'sale', text: snap.restriction.state === 'RESTRICTED' ? 'What it makes cannot be sold yet (new-account limits)' : 'Nothing it makes can be sold', fixable: snap.restriction.state === 'RESTRICTED' });
  }
  // The pace cannot beat the market.
  if (Number.isFinite(marketCapPerHour) && marketCapPerHour > 0) {
    const floor = 3600 / marketCapPerHour;
    sec = { fast: Math.max(sec.fast, floor), typical: Math.max(sec.typical, floor), slow: Math.max(sec.slow, floor) };
    workSec.fast = Math.max(workSec.fast, floor);
    workSec.typical = Math.max(workSec.typical, floor);
    workSec.slow = Math.max(workSec.slow, floor);
  }

  // --- The bag and the way
  const slotsIn = m.inputs.concat(pers?.extraInputs ?? []).filter((f) => !f.stack && f.item.id !== 995).reduce((s, f) => s + expectedQty(f), 0);
  const slotsOut = m.outputs.filter((f) => !f.stack && f.item.id !== 995).reduce((s, f) => s + expectedQty(f), 0);
  const slotsPer = Math.max(slotsIn, slotsOut);
  let unitsPerTrip = slotsPer > 0 ? Math.max(1, Math.floor(m.trip.bagSlots / slotsPer)) : 1000;
  if (pers?.unitsPerTrip) unitsPerTrip = Math.max(1, Math.min(unitsPerTrip, pers.unitsPerTrip));

  for (const i of inputs) {
    if (i.flow.item.id !== 995 && i.owned > 0) ownedUsed.push({ name: i.flow.item.name, qty: Math.floor(Math.min(i.owned, i.per * unitsPerTrip)) });
  }

  const tiles = (a: Point | null, b: Point) => ctx.reach(a, b);
  const tilesFirst = tiles(snap.position, m.spot);
  if (tilesFirst === null) cautions.push(snap.position === null ? 'Where you are is not known, so the walk is not counted' : 'No known way to the place');
  const firstLegSeconds = (tilesFirst ?? 400) / TILES_PER_SECOND + (snap.position ? 0 : 60);
  if (!snap.position) notes.push('Your location is not known: a minute is added for getting there');
  const toGe = tiles(m.bank, ctx.exchange) ?? 150;
  const fromGe = tiles(ctx.exchange, m.spot) ?? 150;
  const saleSeconds = (toGe + fromGe) / TILES_PER_SECOND + m.saleSeconds;

  // --- Setup (a reusable tool) and the cash
  const setup = tools.reduce((sum, t) => sum + (!t.owned && !t.unknown ? t.cost : 0), 0);
  if (setup > 0) notes.push(`Needs ${tools.filter(t => !t.owned && !t.unknown && t.cost > 0).map(t => t.name).join(', ')} first (${gp(setup)} gp, bought once)`);
  const cashEach = (u: number) => inputs.reduce((s, i) => s + i.price * Math.max(0, i.per * u - i.owned), 0) + faresPerTrip;
  const firstTrip = cashEach(unitsPerTrip);
  const minimumBatch = cashEach(Math.min(MIN_BATCH_UNITS, unitsPerTrip));
  const minimum = setup + minimumBatch;
  const spendable = ctx.cash;
  if (spendable === null) {
    cautions.push('Your coins are not known');
    cap('MEDIUM', 'coins unknown');
    checks.push({ text: minimum > 0 ? `Coins to start, about ${gp(Math.ceil(minimum))} gp: yours are not known` : 'No coins needed to start', status: minimum > 0 ? 'unknown' : 'ok' });
  } else if (spendable < minimum) {
    const text = setup > 0 && spendable < setup ? tools.length === 1 ? `The ${tool!.name} alone costs ${gp(setup)} gp` : `The tools alone cost ${gp(setup)} gp` : `A first batch costs about ${gp(Math.ceil(minimum))} gp`;
    blockers.push({ kind: 'capital', text, fixable: true });
    checks.push({ text: `${text} (you have ${gp(spendable)} gp)`, status: 'missing' });
  } else {
    checks.push({ text: minimum > 0 ? `Coins to start, about ${gp(Math.ceil(minimum))} gp (you have ${gp(spendable)} gp)` : 'No coins needed to start', status: 'ok' });
  }

  let firstUnits = spendable === null ? Math.min(MIN_BATCH_UNITS, unitsPerTrip) : unitsPerTrip;
  while (firstUnits > 1 && spendable !== null && setup + cashEach(firstUnits) > spendable) firstUnits--;
  const preparation: NonNullable<MethodEvaluation['preparation']> = {
    units: firstUnits,
    tools: tools.map(({ name, owned, unknown, cost }) => ({ name, owned, unknown, cost })),
    inputs: inputs.filter(i => i.flow.item.id !== 995).map(i => {
      const qty = Math.ceil(i.per * firstUnits);
      const owned = Math.min(qty, Math.floor(i.owned));
      return { name: i.flow.item.name, qty, owned, missing: qty - owned };
    }),
  };

  // --- Economics per unit
  const netPerUnit = coinsPerUnit + saleGrossPerUnit - taxPerUnit - inputCashPerUnit;
  const sellHaircut = sellConfidences.length ? HAIRCUT[sellConfidences.reduce((a, b) => (CONFIDENCE_RANK[b] < CONFIDENCE_RANK[a] ? b : a))] : 0;
  const slowNet = coinsPerUnit + (saleGrossPerUnit - taxPerUnit) * (1 - sellHaircut) - inputCashPerUnit;
  const eff = (secPerUnit: number) => {
    const perSaleUnits = unitsPerTrip * TRIPS_PER_SALE;
    return 3600 / (secPerUnit + m.trip.overheadSeconds / unitsPerTrip + saleSeconds / perSaleUnits);
  };
  const unitsPerHour: Range3 = { fast: eff(sec.fast), typical: eff(sec.typical), slow: eff(sec.slow) };
  const netPerHour: Range3 = { fast: netPerUnit * unitsPerHour.fast, typical: netPerUnit * unitsPerHour.typical, slow: slowNet * unitsPerHour.slow };
  if (ctx.mode === 'earn' && netPerUnit <= 0 && !blockers.some((b) => b.kind === 'price')) {
    blockers.push({ kind: 'market', text: `At today's prices it loses about ${gp(-netPerUnit)} gp per ${m.rate.unit}`, fixable: false });
  }

  // --- Time to the target
  const target = Math.max(0, ctx.target);
  const baseSim = (pace: keyof Range3, haircut: number, cash: number): SimInput => ({
    unitsPerTrip, tripSeconds: m.trip.overheadSeconds, firstLegSeconds: firstLegSeconds + (setup > 0 ? saleSeconds : 0),
    workSecPerUnit: workSec[pace],
    saleSeconds, faresPerTrip, cash: cash - setup, target,
    inputs: inputs.map((i) => ({ price: i.price, perUnit: i.per, owned: i.owned, buySecPerUnit: i.buySecPerUnit })),
    coinsPerUnit,
    outputs: outs.filter((o) => o.dependable && o.sellable).map((o) => ({ netEach: o.netEach * (1 - haircut), perUnit: o.per, reserve: o.reserve })),
    minUnits: MIN_BATCH_UNITS,
  });
  let minutes: Range3 | null = null;
  let minutesReason: string | undefined;
  let saves: number | null = null;
  if (ctx.mode === 'earn') {
    if (blockers.length === 0 && spendable !== null) {
      const runs = [
        simulate(baseSim('fast', 0, spendable)),
        simulate(baseSim('typical', 0, spendable)),
        simulate(baseSim('slow', sellHaircut, spendable)),
      ];
      if (runs.every((r) => r.ok)) minutes = { fast: runs[0].seconds / 60, typical: runs[1].seconds / 60, slow: runs[2].seconds / 60 };
      else minutesReason = runs.find((r) => !r.ok)?.reason;
    }
  } else if (ctx.needItems) {
    // Gathering instead of buying: the units that cover the first matching item to run short, and the coins that saves.
    let units = 0;
    let value = 0;
    for (const o of outs) {
      const want = ctx.needItems.get(o.flow.item.name);
      if (want === undefined || o.per <= 0) continue;
      units = Math.max(units, want / o.per);
      value += (prices.buy(o.flow.item.name, o.flow.item.id)?.price ?? 0) * want;
    }
    if (units > 0 && blockers.length === 0) {
      const secs = (secPerUnit: number) => firstLegSeconds + units * secPerUnit + Math.ceil(units / unitsPerTrip) * m.trip.overheadSeconds;
      minutes = { fast: secs(sec.fast) / 60, typical: secs(sec.typical) / 60, slow: secs(sec.slow) / 60 };
      saves = value;
    } else if (units === 0) {
      minutesReason = 'It does not produce what is needed';
    }
  }

  // --- Working capital: the most the method has out before it turns around, with unlimited cash and the protected items filled first.
  let workingCapital: number | null = null;
  if (ctx.mode === 'earn' && blockers.every((b) => b.kind === 'capital')) {
    const dry = simulate({ ...baseSim('typical', 0, 1e12), cash: 1e12, target: Math.max(target, 1), sellEveryTrip: true });
    workingCapital = Math.round(dry.peakOut) + setup;
    // Only when the run with the player's own coins does not get there, as the badge says. When smaller first batches do (the time
    // already counts them), "Can do now" next to "is out before it pays for itself" read as a contradiction (2.72.1, live: pie shells).
    if (spendable !== null && workingCapital > spendable && blockers.length === 0 && minutesReason === MONEY_RUNS_OUT) {
      cautions.push(`About ${gp(workingCapital)} gp is out before it pays for itself; you have ${gp(spendable)} gp`);
    }
  }

  // --- Synergy with what the player is already doing
  let synergy: string | null = null;
  if (m.combat && ctx.active?.foes?.some((f) => nameKey(f) === nameKey(m.combat!.foe))) synergy = `The same monster as your current step: the kills count towards it`;
  const rs = m.requirements.find((r): r is Extract<Requirement, { kind: 'level' }> => r.kind === 'level');
  if (!synergy && rs && ctx.active?.skills?.includes(rs.skill)) synergy = `Trains ${rs.skill}, which your current step needs`;

  return {
    method: m,
    eligible: blockers.length === 0,
    blockers, cautions, checks,
    confidence,
    confidenceReasons: reasons,
    unitsPerHour, netPerHour,
    perUnit: { sale: saleGrossPerUnit, coins: coinsPerUnit, tax: taxPerUnit, inputs: inputCashPerUnit, net: netPerUnit, upside: upsidePerUnit + coinsUpsidePerUnit },
    upfront: { setup, minimum, firstTrip, owned: ownedUsed },
    workingCapital,
    unitsPerTrip,
    preparation,
    minutes, ...(minutesReason ? { minutesReason } : {}),
    saves, synergy,
    notes: rateNote ? [`Pace from ${rateNote}`, ...notes] : notes,
  };
}

/** The slot arithmetic on its own, for tests and the plan text: how many units one bag allows. */
export function unitsForBag(bagSlots: number, slotsIn: number, slotsOut: number): number {
  const per = Math.max(slotsIn, slotsOut);
  return per > 0 ? Math.max(1, Math.floor(bagSlots / per)) : 1000;
}

