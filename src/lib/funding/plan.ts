// A funding plan: the temporary detour that raises the coins a route step is short of. It is a small state machine over a list of sub-steps, and it never touches
// the route: the step it was started for (`sourceStepId`) stays open, its progress is not changed, and when the plan ends - done, cancelled or replaced - the
// route is exactly where it was. Nothing in this file can complete, reorder or rename a route step.
//
// A sub-step advances only on something the game can show:
//   travel  - the player stands near the place (arriving finishes the travel, and only the travel);
//   perform - the items the work should have produced are in the bag, or the player says it is done;
//   bank    - the player stands at the bank and the produced items have left the bag (a move to the bank is not income);
//   sell    - the coins have risen by most of what the sale should bring, or the player confirms;
//   restock - the supplies the route wanted are in the bag, or the player confirms.
// Arrival is never "done", a loot value is never a sale, and what cannot be seen is asked of the player: the sub-step says "confirm" instead of guessing.
// The plan belongs to one character; another character's plan is never applied.

import { nameKey } from '../checklist';
import type { FundingAssessment, FundingOption } from './assess';
import type { FundingSnapshot } from './snapshot';
import type { FundingMethod, GuideKind, Place } from './types';

export type PlanStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'DONE';

export type Detect =
  | { type: 'near'; place: Place; radius: number }
  | { type: 'bagAtLeast'; item: string; qty: number }
  | { type: 'bagAtMost'; item: string; qty: number; near: Place }
  | { type: 'coinsRise'; by: number }
  | { type: 'manual' };

export interface SubStep {
  id: string;
  kind: GuideKind | 'resume';
  text: string;
  place?: Place;
  detect: Detect;
  /** What the sub-step is working towards, for the progress line ("27 Cowhide"). */
  goal?: { item: string; qty: number };
  done: boolean;
  doneAt?: number;
  doneBy?: 'observed' | 'manual';
}

export interface FundingPlanState {
  v: 1;
  /** Unique per start: "earn:cows-cowhide@1792000000000". */
  id: string;
  /** Raised when the plan is changed while it runs (a new target); the game and the app compare it. */
  version: number;
  character: string;
  optionId: string;
  kind: FundingOption['kind'];
  methodId?: string;
  title: string;
  sourceStepId: string;
  target: { required: number; gap: number; liquidAtStart: number | null };
  /** Items that must stay out of any sale while the plan runs (the route's reserve, copied at the start). */
  reserved: { name: string; qty: number }[];
  status: PlanStatus;
  startedAt: number;
  updatedAt: number;
  pausedAt?: number;
  active: number;
  subSteps: SubStep[];
  /** What the bag held and the coins at the start of the sub-step in progress, to tell what the work changed. */
  baseline: { bagCoins: number | null; bag: Record<string, number> };
  /** Seconds of actual work, counted only while a perform sub-step is active and the game is reporting. */
  workSeconds: number;
  lastTickAt: number;
  /** The expected net proceeds the sale should bring, for the sell sub-step's detection and the "estimated" label. */
  expectedNet: number;
}

/** Where the Grand Exchange is: the place to sell and to buy. */
export const GRAND_EXCHANGE: Place = { x: 3165, y: 3490, plane: 0, label: 'Grand Exchange' };

/** The radius of "near" for arriving at a place: a few steps, any floor mismatch is not near. */
export const NEAR_TILES = 20;
/** The coins must rise by this share of the expected proceeds before a sale is taken as made. */
export const SALE_SHARE = 0.6;
/** Time between two reports longer than this is a pause (a disconnect, a sleep), not work. */
export const MAX_GAP_SECONDS = 45;
/** A plan older than this is stale and is dropped on load. */
export const STALE_AFTER_MS = 3 * 24 * 3600_000;

const bagCount = (snap: FundingSnapshot, name: string): number => {
  if (!snap.bag) return -1;
  const k = nameKey(name);
  return snap.bag.filter((b) => nameKey(b.name) === k).reduce((s, b) => s + b.count, 0);
};

const near = (snap: FundingSnapshot, place: Place, radius: number): boolean => {
  const p = snap.position;
  return Boolean(p) && p!.plane === place.plane && Math.max(Math.abs(p!.x - place.x), Math.abs(p!.y - place.y)) <= radius;
};

function baselineOf(snap: FundingSnapshot): FundingPlanState['baseline'] {
  const bag: Record<string, number> = {};
  for (const b of snap.bag ?? []) bag[nameKey(b.name)] = (bag[nameKey(b.name)] ?? 0) + b.count;
  return { bagCoins: snap.coins.bag, bag };
}

// ---------------------------------------------------------------------------
// Building a plan from an option

/** The product the work is counted by: the item a unit of the activity yields most of, and how many of it a unit yields on average. Coins are not a product. */
export function mainOutputOf(method: FundingMethod): { name: string; perUnit: number } | null {
  const per = (o: FundingMethod['outputs'][number]) => o.qty * (o.chance ? o.chance[0] / o.chance[1] : 1);
  const best = method.outputs.filter((o) => o.item.id !== 995).sort((a, b) => per(b) - per(a))[0];
  return best ? { name: best.item.name, perUnit: per(best) } : null;
}

function subSteps(option: FundingOption, assessment: FundingAssessment, method: FundingMethod | undefined): { steps: SubStep[]; expectedNet: number } {
  const GE = GRAND_EXCHANGE;
  const steps: SubStep[] = [];
  const add = (s: Omit<SubStep, 'done'>) => steps.push({ ...s, done: false });

  if (option.kind === 'SELL_SURPLUS') {
    const net = assessment.budget.surplus.net;
    add({ id: 'travel', kind: 'travel', text: 'Go to the Grand Exchange.', place: GE, detect: { type: 'near', place: GE, radius: NEAR_TILES } });
    add({ id: 'sell', kind: 'sell', text: 'Sell your spare items.', place: GE, detect: { type: 'coinsRise', by: Math.floor(Math.min(net, assessment.gap ?? net) * SALE_SHARE) } });
    add({ id: 'resume', kind: 'resume', text: 'Back to your step.', detect: { type: 'manual' } });
    return { steps, expectedNet: net };
  }

  if (option.kind === 'CHEAPER_SUPPLY' && option.cheaper) {
    const c = option.cheaper;
    add({ id: 'restock', kind: 'restock', text: `Buy ${c.pieces} ${c.to} instead of ${c.from}.`, place: GE, detect: { type: 'bagAtLeast', item: c.to, qty: c.pieces }, goal: { item: c.to, qty: c.pieces } });
    add({ id: 'resume', kind: 'resume', text: 'Back to your step.', detect: { type: 'manual' } });
    return { steps, expectedNet: 0 };
  }

  if (!method) {
    add({ id: 'resume', kind: 'resume', text: 'Back to your step.', detect: { type: 'manual' } });
    return { steps, expectedNet: 0 };
  }

  const e = option.evaluation;
  const main = mainOutputOf(method);
  const units = Math.max(1, Math.min(e?.unitsPerTrip ?? 1, 1000));
  const goalQty = main ? Math.max(1, Math.floor(units * main.perUnit)) : 0;
  const gather = option.kind === 'SELF_GATHER';
  const tool = method.requirements.find((r) => r.kind === 'item' && r.role === 'tool');
  if (tool && e && e.upfront.setup > 0) {
    add({ id: 'prepare', kind: 'prepare', text: `Get a pickaxe or axe you can use (about ${e.upfront.setup} gp).`, place: GE, detect: { type: 'manual' } });
  } else if (method.inputs.some((i) => i.item.id !== 995) || tool) {
    add({ id: 'prepare', kind: 'prepare', text: method.guide.find((g) => g.kind === 'prepare')?.text ?? 'Take what you need from the bank.', place: method.bank, detect: { type: 'manual' } });
  }
  add({ id: 'travel', kind: 'travel', text: method.guide.find((g) => g.kind === 'travel')?.text ?? `Go to ${method.spot.label}.`, place: method.spot, detect: { type: 'near', place: method.spot, radius: NEAR_TILES } });
  add({
    id: 'perform', kind: 'perform', text: method.guide.find((g) => g.kind === 'perform')?.text ?? 'Do the work.', place: method.spot,
    detect: main ? { type: 'bagAtLeast', item: main.name, qty: goalQty } : { type: 'manual' }, ...(main ? { goal: { item: main.name, qty: goalQty } } : {}),
  });
  if (!gather) {
    add({ id: 'bank', kind: 'bank', text: method.guide.find((g) => g.kind === 'bank')?.text ?? 'Bank the loot.', place: method.bank, detect: main ? { type: 'bagAtMost', item: main.name, qty: Math.floor(goalQty * 0.1), near: method.bank } : { type: 'manual' } });
    add({ id: 'sell', kind: 'sell', text: method.guide.find((g) => g.kind === 'sell')?.text ?? 'Sell at the Grand Exchange.', place: GE, detect: { type: 'coinsRise', by: 0 } });
  }
  add({ id: 'restock', kind: 'restock', text: 'Buy the supplies you were short of.', place: GE, detect: { type: 'manual' } });
  add({ id: 'resume', kind: 'resume', text: 'Back to your step.', detect: { type: 'manual' } });
  const expectedNet = e ? Math.round(Math.max(0, e.perUnit.net) * units) : 0;
  // The sale is taken as made when the coins have risen by most of what this trip should bring.
  const sell = steps.find((s) => s.id === 'sell');
  if (sell) sell.detect = { type: 'coinsRise', by: Math.floor(Math.min(expectedNet, assessment.gap ?? expectedNet) * SALE_SHARE) };
  return { steps, expectedNet };
}

export function startPlan(assessment: FundingAssessment, option: FundingOption, snap: FundingSnapshot, method: FundingMethod | undefined, now: number): FundingPlanState | null {
  if (!snap.character || assessment.state !== 'SHORT' || assessment.gap === null) return null;
  const built = subSteps(option, assessment, method);
  const steps = built.steps;
  const reserved = [...snap.protections.values()].filter((p) => Number.isFinite(p.qty) && p.qty > 0).map((p) => ({ name: p.name, qty: p.qty }));
  const plan: FundingPlanState = {
    v: 1, id: `${option.id}@${now}`, version: 1, character: snap.character, optionId: option.id, kind: option.kind,
    ...(method ? { methodId: method.id } : {}), title: option.title, sourceStepId: assessment.stepId,
    target: { required: assessment.required, gap: assessment.gap, liquidAtStart: snap.liquid.amount },
    reserved, status: 'ACTIVE', startedAt: now, updatedAt: now, active: 0, subSteps: steps,
    baseline: baselineOf(snap), workSeconds: 0, lastTickAt: now, expectedNet: built.expectedNet,
  };
  return settle(plan, snap, now);
}

// ---------------------------------------------------------------------------
// Observing

function detected(plan: FundingPlanState, s: SubStep, snap: FundingSnapshot): boolean {
  const d = s.detect;
  switch (d.type) {
    case 'near': return near(snap, d.place, d.radius);
    case 'bagAtLeast': {
      const n = bagCount(snap, d.item);
      return n >= 0 && n >= d.qty;
    }
    case 'bagAtMost': {
      const n = bagCount(snap, d.item);
      return n >= 0 && n <= d.qty && near(snap, d.near, NEAR_TILES);
    }
    case 'coinsRise': {
      const bag = snap.coins.bag;
      const was = plan.baseline.bagCoins;
      return d.by > 0 && bag !== null && was !== null && bag - was >= d.by;
    }
    case 'manual': return false;
  }
}

/** The next sub-step starts from what the game shows now. */
function advanceTo(plan: FundingPlanState, index: number, snap: FundingSnapshot): FundingPlanState {
  return { ...plan, active: index, baseline: baselineOf(snap) };
}

/** Mark finished sub-steps in order; one observation can finish several (a player who is already at the place). */
function settle(plan: FundingPlanState, snap: FundingSnapshot, now: number): FundingPlanState {
  let p = plan;
  while (p.status === 'ACTIVE' && p.active < p.subSteps.length) {
    const s = p.subSteps[p.active];
    if (s.done || !detected(p, s, snap)) break;
    const subSteps = p.subSteps.map((x, i) => (i === p.active ? { ...x, done: true, doneAt: now, doneBy: 'observed' as const } : x));
    p = advanceTo({ ...p, subSteps, updatedAt: now }, p.active + 1, snap);
  }
  return finishIfCovered(p, snap, now);
}

/** The plan is done when the coins it set out to raise are in hand; the route's own progress is not touched. */
function finishIfCovered(plan: FundingPlanState, snap: FundingSnapshot, now: number): FundingPlanState {
  if (plan.status !== 'ACTIVE') return plan;
  const have = snap.liquid.amount;
  const closed = have !== null && have >= plan.target.required;
  const allDone = plan.subSteps.every((s) => s.done);
  if (closed || allDone) return { ...plan, status: 'DONE', updatedAt: now };
  return plan;
}

/**
 * One report from the game: time worked, sub-steps finished, the end of the plan. Another character's report changes nothing. The same state is returned
 * (the same object) when nothing changed, so a caller can tell.
 */
export function tick(plan: FundingPlanState, snap: FundingSnapshot, now: number): FundingPlanState {
  if (plan.status !== 'ACTIVE') return plan;
  if (!snap.connected || snap.character !== plan.character) return plan;
  let p = plan;
  const gap = (now - p.lastTickAt) / 1000;
  const working = p.subSteps[p.active]?.kind === 'perform';
  // Only a short gap between two reports is work; a long one is a disconnect or a sleep.
  if (working && gap > 0 && gap <= MAX_GAP_SECONDS) p = { ...p, workSeconds: p.workSeconds + gap };
  p = { ...p, lastTickAt: now };
  p = settle(p, snap, now);
  return p;
}

/** The player says a sub-step is done (the game cannot show it: a sale at the exchange, a tool bought, the supplies back). */
export function confirm(plan: FundingPlanState, id: string, snap: FundingSnapshot, now: number): FundingPlanState {
  if (plan.status !== 'ACTIVE') return plan;
  const at = plan.subSteps.findIndex((s) => s.id === id);
  if (at < 0 || plan.subSteps[at].done) return plan;
  const subSteps = plan.subSteps.map((s, i) => (i <= at && !s.done ? { ...s, done: true, doneAt: now, doneBy: 'manual' as const } : s));
  return settle(advanceTo({ ...plan, subSteps, updatedAt: now }, Math.max(plan.active, at + 1), snap), snap, now);
}

export function pause(plan: FundingPlanState, now: number): FundingPlanState {
  return plan.status === 'ACTIVE' ? { ...plan, status: 'PAUSED', pausedAt: now, updatedAt: now } : plan;
}

export function resume(plan: FundingPlanState, snap: FundingSnapshot, now: number): FundingPlanState {
  if (plan.status !== 'PAUSED') return plan;
  // Time asleep is not work, and what changed meanwhile (the player banked, sold) must not be read as progress of this sub-step.
  return advanceTo({ ...plan, status: 'ACTIVE', pausedAt: undefined, lastTickAt: now, updatedAt: now }, plan.active, snap);
}

export function cancel(plan: FundingPlanState, now: number): FundingPlanState {
  return plan.status === 'CANCELLED' || plan.status === 'DONE' ? plan : { ...plan, status: 'CANCELLED', updatedAt: now };
}

export const isRunning = (p: FundingPlanState | null): p is FundingPlanState => Boolean(p) && (p!.status === 'ACTIVE' || p!.status === 'PAUSED');

// ---------------------------------------------------------------------------
// What the app and the game both show

export interface FundingView {
  planId: string;
  version: number;
  status: PlanStatus;
  sourceStepId: string;
  title: string;
  /** The sub-step in hand, one short sentence. */
  action: string;
  kind: SubStep['kind'];
  /** "12 / 27 Cowhide", "425 gp to go"; null when there is nothing to count. */
  progress: string | null;
  /** The loot's value is an estimate until it is sold. */
  estimated: boolean;
  target: Place | null;
  stepIndex: number;
  stepCount: number;
  /** Sub-steps that only the player can confirm show their button here. */
  needsConfirm: boolean;
}

const gp = (n: number) => Math.round(n).toLocaleString('en-US');

export function viewOf(plan: FundingPlanState, snap: FundingSnapshot): FundingView {
  const s = plan.subSteps[Math.min(plan.active, plan.subSteps.length - 1)];
  let progress: string | null = null;
  if (s.goal) {
    const n = Math.max(0, bagCount(snap, s.goal.item));
    progress = `${Math.min(n, s.goal.qty)} / ${s.goal.qty} ${s.goal.item}`;
  } else if (s.kind === 'sell' || s.kind === 'resume') {
    const have = snap.liquid.amount;
    if (have !== null) progress = have >= plan.target.required ? 'Enough coins' : `${gp(plan.target.required - have)} gp to go`;
  }
  return {
    planId: plan.id, version: plan.version, status: plan.status, sourceStepId: plan.sourceStepId, title: plan.title,
    action: s.text, kind: s.kind, progress, estimated: s.kind === 'bank' || s.kind === 'sell',
    target: s.place ?? null, stepIndex: plan.subSteps.indexOf(s) + 1, stepCount: plan.subSteps.length,
    needsConfirm: s.detect.type === 'manual' || s.kind === 'sell' || s.kind === 'restock',
  };
}

// ---------------------------------------------------------------------------
// Saving

export const FUNDING_PLAN_KEY = 'osrs-put:funding-plan';

export function planKey(profileId: string, character: string | null | undefined): string {
  const who = (character ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `${FUNDING_PLAN_KEY}:${profileId}:${who || '-'}`;
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function validPlan(p: unknown): p is FundingPlanState {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  return o.v === 1 && typeof o.id === 'string' && typeof o.character === 'string' && typeof o.sourceStepId === 'string'
    && typeof o.status === 'string' && ['ACTIVE', 'PAUSED', 'CANCELLED', 'DONE'].includes(o.status)
    && Array.isArray(o.subSteps) && o.subSteps.length > 0 && typeof o.active === 'number' && Number.isFinite(o.active)
    && typeof o.startedAt === 'number' && typeof o.target === 'object' && o.target !== null
    && o.subSteps.every((s) => s && typeof s === 'object' && typeof (s as SubStep).id === 'string' && typeof (s as SubStep).done === 'boolean' && typeof (s as SubStep).detect === 'object');
}

/** The plan saved for this character, or null: nothing saved, damaged, another character's, finished, or older than three days. */
export function loadPlan(store: Store | undefined, key: string, character: string | null | undefined, now: number): FundingPlanState | null {
  try {
    const text = store?.getItem(key);
    if (!text) return null;
    const data: unknown = JSON.parse(text);
    if (!validPlan(data)) return null;
    if (!character || data.character !== character) return null;
    if (data.status === 'CANCELLED' || data.status === 'DONE') return null;
    if (now - data.updatedAt > STALE_AFTER_MS) return null;
    const active = Math.min(Math.max(0, Math.floor(data.active)), data.subSteps.length - 1);
    return { ...data, active, workSeconds: Number.isFinite(data.workSeconds) ? data.workSeconds : 0, lastTickAt: now };
  } catch {
    return null;
  }
}

export function savePlan(store: Store | undefined, key: string, plan: FundingPlanState | null): void {
  try {
    if (!plan || plan.status === 'CANCELLED' || plan.status === 'DONE') store?.removeItem(key);
    else store?.setItem(key, JSON.stringify(plan));
  } catch {
    // Storage full or closed: the plan lives in memory until the app closes.
  }
}
