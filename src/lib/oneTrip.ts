// "One trip": preparation for the current step and several nearest ones together: one visit to the bank and the exchange instead of
// three. The items are collected from the requirements of the window's steps, what the player already has is assigned to the nearest steps
// (a reserve: the same 13 pieces of food are not counted twice), tools are taken once for all the steps.
// "Needed later" does not mean "buy now": each line has an urgency NOW / SOON / LATER.

import type { Step } from '../types';
import { aggregateShopping, type ShoppingLine } from './shopping';
import { parseAmount } from './checklist';
import { heldOf, type Held, type PlayerState } from './playerState';
import { isClosed } from './next-step';
import type { Progress } from '../types';
import type { Urgency } from './prepRoute';

/** How many steps ahead after the current one are taken into one trip. */
export const LOOK_AHEAD = 3;

export type TripStatus = 'HAVE' | 'BANK' | 'GET' | 'UNKNOWN';

export interface TripAllocation {
  stepId: string;
  need: number;
  /** How much of what is needed is covered by what you already have (assigned to this step). */
  covered: number;
}

export interface TripLine {
  line: ShoppingLine;
  held: Held;
  allocation: TripAllocation[];
  /** How much more to take (to buy or collect); null means unknown (the bank was not opened). */
  toGet: number | null;
  status: TripStatus;
  /** When it will be needed: by the nearest step where it is lacking. */
  urgency: Urgency;
}

export interface TripCoins {
  need: number;
  have: number | null;
  missing: number | null;
}

export interface OneTripPlan {
  /** The window's steps in order: the current one and the nearest ones. */
  stepIds: string[];
  lines: TripLine[];
  /** Take now: the current step needs it and the player does not have it (or it is in the bank). */
  now: TripLine[];
  /** While you are at it, if on the way: it will be needed in the nearest steps. */
  soon: TripLine[];
  /** Later: not now, only to know. */
  later: TripLine[];
  /** Nothing to check with (the bank was not opened, the plugin did not watch): not "none" but "unknown", it does not get into the "take" lists. */
  unknown: TripLine[];
  coins: TripCoins;
}

/** The current step and the following unclosed ones (in route order): the preparation window. */
export function tripWindow(steps: Step[], progress: Progress, currentId: string, ahead = LOOK_AHEAD): Step[] {
  const at = steps.findIndex((s) => s.id === currentId);
  if (at < 0) return [];
  const out: Step[] = [steps[at]];
  for (let i = at + 1; i < steps.length && out.length < ahead + 1; i++) {
    if (!isClosed(progress, steps[i].id)) out.push(steps[i]);
  }
  return out;
}

function perStepNeed(line: ShoppingLine, stepIds: string[]): { stepId: string; need: number }[] {
  const out: { stepId: string; need: number }[] = [];
  let reusableTaken = false;
  for (const stepId of stepIds) {
    const src = line.sources.filter((s) => s.stepId === stepId && !s.carryOver);
    if (!src.length) continue;
    const n = src.reduce((sum, s) => sum + (parseAmount(s.amount) ?? 1), 0);
    if (line.reusable) {
      // One tool serves all the steps: take the largest, not the sum.
      if (reusableTaken) continue;
      reusableTaken = true;
      out.push({ stepId, need: line.count });
    } else {
      out.push({ stepId, need: n });
    }
  }
  return out;
}

export function planOneTrip(steps: Step[], progress: Progress, currentId: string, state: PlayerState, ahead = LOOK_AHEAD): OneTripPlan {
  const window = tripWindow(steps, progress, currentId, ahead);
  const ids = window.map((s) => s.id);
  const list = aggregateShopping(window);
  const lines: TripLine[] = [];
  for (const line of list.required) {
    const held = heldOf(state, line.nameEn, line.key);
    const needs = perStepNeed(line, ids);
    // Assign what is already owned to the nearest steps: 13 of 20 is on hand, the first steps are covered, the last is not.
    let pool = held.total ?? 0;
    const allocation: TripAllocation[] = needs.map((n) => {
      const covered = Math.min(pool, n.need);
      pool -= covered;
      return { stepId: n.stepId, need: n.need, covered };
    });
    const missing = allocation.reduce((sum, a) => sum + (a.need - a.covered), 0);
    const bagHas = (held.bag ?? 0) + held.noted;
    let status: TripStatus;
    let toGet: number | null;
    if (held.presence === 'UNKNOWN' || (held.bank === null && held.source === 'game' && missing > 0)) {
      status = 'UNKNOWN';
      toGet = null;
    } else if (missing > 0) {
      status = 'GET';
      toGet = missing;
    } else if (bagHas < line.count) {
      status = 'BANK';
      toGet = 0;
    } else {
      status = 'HAVE';
      toGet = 0;
    }
    const firstGap = allocation.findIndex((a) => a.need > a.covered);
    const idx = firstGap >= 0 ? ids.indexOf(allocation[firstGap].stepId) : 0;
    const urgency: Urgency = idx <= 0 ? 'NOW' : idx <= 2 ? 'SOON' : 'LATER';
    lines.push({ line, held, allocation, toGet, status, urgency });
  }
  const pending = lines.filter((l) => l.status === 'GET' || l.status === 'BANK');
  // The bank not opened leaves the total unknown, but coins in the bag that already cover the need settle the question.
  const { bag, bank } = state.coins;
  const coinsHave = !bag.known ? null : bank.known ? bag.value + bank.value : bag.value >= list.coins ? bag.value : null;
  const coinsMissing = coinsHave === null ? null : Math.max(0, list.coins - coinsHave);
  return {
    stepIds: ids,
    lines,
    now: pending.filter((l) => l.urgency === 'NOW'),
    soon: pending.filter((l) => l.urgency === 'SOON'),
    later: pending.filter((l) => l.urgency === 'LATER'),
    unknown: lines.filter((l) => l.status === 'UNKNOWN'),
    coins: { need: list.coins, have: coinsHave, missing: coinsMissing },
  };
}
