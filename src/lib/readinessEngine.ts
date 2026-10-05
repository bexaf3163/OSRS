// The single readiness engine: once per state snapshot it counts readiness, the preparation route, the "fix everything" chain
// and "one trip", and remembers the answers. The step screen, the preparation observer, the queue and "what to do now" take them
// from here instead of each counting its own: while no levels, items or marks have changed, there are no repeated calculations.
//
// The memory lives exactly until the snapshot changes: the engine is created anew when the player's state, the marks or the mode change.

import type { Step } from '../types';
import { fixChainOf, readinessOf, type ChainLink, type ReadinessContext, type StepReadiness } from './readiness';
import { buildPrepRoute, openTaskIds, type PrepRoute } from './prepRoute';
import { planOneTrip, type OneTripPlan } from './oneTrip';
import { buildQueue, type PrepQueue } from './prepQueue';
import type { PlayStyle } from './playStyle';
import { buildPrepPlan, type PrepPlan } from './prepPlan';
import type { UpgradeRecommendation } from '../services/gearUpgradeRouter';

export interface ReadinessEngine {
  readonly ctx: ReadinessContext;
  /** A step's readiness (with memory). */
  readiness(step: Step): StepReadiness;
  /** The preparation route for a step: the main task, then no more than two. */
  prep(step: Step): PrepRoute;
  /** "Fix everything": a chain of steps to readiness. */
  chain(step: Step): ChainLink[];
  /** A step's open preparation tasks; null means there is no such step. */
  openTasks(stepId: string): Set<string> | null;
  /** The preparation queue: the route with "where to lead" for each task. */
  queue(step: Step, style: PlayStyle): PrepQueue;
  /** "One trip" for this step and the nearest ones. */
  trip(stepId: string, ahead?: number): OneTripPlan;
  /**
   * The preparation plan: one decision "what is needed", from which the in-app "What you need", the in-game list and the bank
   * check are drawn (prepPlan.ts). upgrade is a tool tip, if there is one.
   */
  plan(step: Step, opts?: { ahead?: number; upgrade?: UpgradeRecommendation | null }): PrepPlan;
  /** How many times it was really counted (not from memory), for tests. */
  readonly computed: { readiness: number; trip: number; plan: number };
}

export function createReadinessEngine(ctx: ReadinessContext): ReadinessEngine {
  const readinessMemo = new Map<string, StepReadiness>();
  const prepMemo = new Map<string, PrepRoute>();
  const chainMemo = new Map<string, ChainLink[]>();
  const tripMemo = new Map<string, OneTripPlan>();
  const queueMemo = new Map<string, PrepQueue>();
  const planMemo = new Map<string, PrepPlan>();
  const computed = { readiness: 0, trip: 0, plan: 0 };
  const stepOf = (id: string) => ctx.steps.find((s) => s.id === id);

  const readiness = (step: Step): StepReadiness => {
    const hit = readinessMemo.get(step.id);
    if (hit) return hit;
    computed.readiness++;
    const r = readinessOf(step, ctx);
    readinessMemo.set(step.id, r);
    return r;
  };

  const prep = (step: Step): PrepRoute => {
    const hit = prepMemo.get(step.id);
    if (hit) return hit;
    const r = buildPrepRoute(readiness(step), step);
    prepMemo.set(step.id, r);
    return r;
  };

  const tripOf = (stepId: string, ahead?: number): OneTripPlan => {
    const key = `${stepId}:${ahead ?? ''}`;
    const hit = tripMemo.get(key);
    if (hit) return hit;
    computed.trip++;
    const t = planOneTrip(ctx.steps, ctx.progress, stepId, ctx.state, ahead);
    tripMemo.set(key, t);
    return t;
  };

  return {
    ctx,
    readiness,
    prep,
    chain(step) {
      const hit = chainMemo.get(step.id);
      if (hit) return hit;
      const c = fixChainOf(step, ctx, 3, readiness);
      chainMemo.set(step.id, c);
      return c;
    },
    queue(step, style) {
      const key = `${step.id}:${style}`;
      const hit = queueMemo.get(key);
      if (hit) return hit;
      const q = buildQueue(prep(step), { state: ctx.state, mode: ctx.mode, style });
      queueMemo.set(key, q);
      return q;
    },
    openTasks(stepId) {
      const step = stepOf(stepId);
      return step ? openTaskIds(readiness(step), step) : null;
    },
    trip: tripOf,
    plan(step, opts = {}) {
      const up = opts.upgrade;
      const rec = ctx.recovery && ctx.recovery.stepId === step.id ? ctx.recovery.recovery : null;
      const key = `${step.id}:${opts.ahead ?? ''}:${up ? `${up.status}/${up.recommendedItem ?? ''}/${up.approxCost ?? ''}` : '-'}:${rec ? `${rec.reason}/${rec.since}` : '-'}`;
      const hit = planMemo.get(key);
      if (hit) return hit;
      computed.plan++;
      const p = buildPrepPlan({
        step, steps: ctx.steps, progress: ctx.progress, state: ctx.state,
        trip: tripOf(step.id, opts.ahead), readiness: readiness(step), upgrade: up ?? null, recovery: rec,
      });
      planMemo.set(key, p);
      return p;
    },
    computed,
  };
}
