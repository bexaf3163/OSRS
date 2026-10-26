// Which combat plan is in effect for a step: the guide's recommendation by default, the player's own choice when they made one. One answer for every
// screen and for the game (2.69): the step page, the preparation and shopping lists, the arrow and the in-game panel all read this selection.
//
// The rules:
//  - Nothing chosen yet (a new step, or an older save where the route's plan applied by default): the recommended plan applies at once.
//  - The guide's own choice ("auto") follows the recommendation, which already holds a plan in effect unless another is clearly better (KEEP_MARGIN in
//    plans.ts). A change in the middle of a trip waits for the next bank trip (food gone, step not on screen in the game) and is announced meanwhile.
//  - The player's own choice ("player") stays while it is still a plan for this step and safe. A clearly better recommendation is offered, never applied.
//  - A plan that is gone (its conditions changed: the bones are already in hand) or not safe gives way at once: safety does not wait for a bank trip.

import type { Adopted } from './adopt';
import { earningsOrder } from '../lootValue';
import { gainOver, MIN_GAIN, planKeyOf, planNetPerHour, type EvaluatedPlan, type PlanReport } from './plans';

/** Whether the player is in the middle of a trip on this step: then a better plan waits for the next bank trip instead of moving the arrow. */
export interface TripState { inProgress: boolean }

export interface PlanSelection {
  /** The plan in effect. */
  key: string;
  /** Who chose it: the guide (by its recommendation) or the player. */
  source: 'auto' | 'player';
  /** The plan the model recommends now. */
  recommended: string;
  /** A better plan the guide moves to at the next bank trip. */
  pending?: string;
  /** A clearly better plan than the one the player chose: offered, not applied. */
  offer?: string;
}

const usable = (report: PlanReport, key: string | undefined): EvaluatedPlan | undefined => {
  const k = key ? planKeyOf(report.plans, key) : undefined;
  return k ? report.plans.find((p) => p.key === k && p.eligible) : undefined;
};

/**
 * The selection for one step. `report` must be evaluated with the stored key as its `adopted` plan, so the recommendation already keeps a plan in
 * effect unless another is clearly better.
 */
export function selectPlan(report: PlanReport, stored: Adopted | undefined, trip: TripState): PlanSelection {
  const recommended = report.recommended;
  const chosen = stored?.by === 'player' ? usable(report, stored.key) : undefined;
  if (stored && chosen) {
    // The guide's own pick is offered when it is clearly better than the player's (MIN_GAIN of the chosen plan's score); otherwise the choice stands quietly.
    const top = usable(report, report.fresh);
    const better = top && top.key !== chosen.key && (report.priority === 'profit' ? earningsOrder(planNetPerHour(top), planNetPerHour(chosen)) < 0 : gainOver(chosen, top) >= MIN_GAIN);
    return { key: chosen.key, source: 'player', recommended: report.fresh, ...(better ? { offer: top.key } : {}) };
  }
  // What applied before this evaluation: the guide's earlier choice, or for a step never chosen the route's own plan (the default before 2.69).
  const before = stored?.by === 'auto' ? planKeyOf(report.plans, stored.key) : 'route';
  if (recommended !== before && trip.inProgress && usable(report, before)) {
    return { key: before, source: 'auto', recommended, pending: recommended };
  }
  return { key: recommended, source: 'auto', recommended };
}

/** The plan of a selection, from its report. */
export function selectedPlan(report: PlanReport, sel: PlanSelection): EvaluatedPlan | undefined {
  return report.plans.find((p) => p.key === sel.key);
}
