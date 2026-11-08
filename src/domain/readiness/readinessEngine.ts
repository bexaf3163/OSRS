// The single readiness engine: once per state snapshot it counts readiness, the preparation route, the "fix everything" chain
// and "one trip", and remembers the answers. The step screen, the preparation observer, the queue and "what to do now" take them
// from here instead of each counting its own: while no levels, items or marks have changed, there are no repeated calculations.
//
// The memory lives exactly until the snapshot changes: the engine is created anew when the player's state, the marks or the mode change.

import type { Step } from '../../types';
import { stepAtQuestCursor } from '../quests/questCursor';
import { fixChainOf, readinessOf, type ChainLink, type ReadinessContext, type StepReadiness } from './readiness';
import { buildPrepRoute, openTaskIds, type PrepRoute } from '../prep/prepRoute';
import { planOneTrip, tripWindow, type OneTripPlan } from '../prep/oneTrip';
import { buildQueue, type PrepQueue } from '../prep/prepQueue';
import type { PlayStyle } from '../persistence/playStyle';
import { buildPrepPlan, type PrepPlan } from '../prep/prepPlan';
import type { UpgradeRecommendation } from '../training/gearUpgradeRouter';
import { dependencyFacts, type DependencyFact } from '../quests/next-step';
import { levelOf, ownedCountOf } from '../player/playerState';
import { stockShoppingContext, stockUpShopping } from '../economy/trainingStock';

export interface ReadinessEngine {
  readonly ctx: ReadinessContext;
  readonly dependencies: DependencyFact;
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
  trip(current: string | Step, ahead?: number): OneTripPlan;
  /**
   * The preparation plan: one decision "what is needed", from which the in-app "What you need", the in-game list and the bank
   * check are drawn (prepPlan.ts). upgrade is a tool tip, if there is one.
   */
  plan(step: Step, opts?: { ahead?: number; upgrade?: UpgradeRecommendation | null }): PrepPlan;
  /** How many times it was really counted (not from memory), for tests. */
  readonly computed: { readiness: number; trip: number; plan: number };
}

export function createReadinessEngine(ctx: ReadinessContext): ReadinessEngine {
  const cursor = ctx.state.connected ? ctx.questInstruction ?? null : null;
  const entries = new WeakMap<Step, Step>();
  const entry = (step: Step): Step => {
    if (!cursor || cursor.peeking || cursor.stepId !== step.id) return step;
    const cached = entries.get(step);
    if (cached) return cached;
    const projected = stepAtQuestCursor(step, cursor);
    entries.set(step, projected);
    entries.set(projected, projected);
    return projected;
  };
  const steps = ctx.steps.map(entry);
  if (steps.some((step, index) => step !== ctx.steps[index])) ctx = { ...ctx, steps };
  const readinessMemo = new WeakMap<Step, StepReadiness>();
  const prepMemo = new WeakMap<Step, PrepRoute>();
  const chainMemo = new WeakMap<Step, ChainLink[]>();
  const tripMemo = new WeakMap<Step, Map<string, OneTripPlan>>();
  const queueMemo = new WeakMap<Step, Map<PlayStyle, PrepQueue>>();
  const planMemo = new WeakMap<Step, Map<string, PrepPlan>>();
  const computed = { readiness: 0, trip: 0, plan: 0 };
  const stepOf = (id: string) => ctx.steps.find((s) => s.id === id);

  const readiness = (step: Step): StepReadiness => {
    step = entry(step);
    const hit = readinessMemo.get(step);
    if (hit) return hit;
    computed.readiness++;
    const r = readinessOf(step, ctx);
    readinessMemo.set(step, r);
    return r;
  };

  const prep = (step: Step): PrepRoute => {
    step = entry(step);
    const hit = prepMemo.get(step);
    if (hit) return hit;
    const r = buildPrepRoute(readiness(step), step);
    const buy = r.tasks.find(t => t.kind === 'buy' && t.need === 'REQUIRED');
    if (buy && step.stockItems?.length) {
      const window = tripWindow(ctx.steps, ctx.progress, step);
      const stocked = stockUpShopping(window.length ? window : [entry(step)], stockShoppingContext(ctx.state, ctx.prices, ctx.qp), ctx.prices);
      if (stocked.stock.length) buy.detail = `Buy together if convenient: ${stocked.stock.map(row => `${row.name} ×${row.qty}`).join(', ')}. Bank these extras for later; they do not block this step.`;
    }
    prepMemo.set(step, r);
    return r;
  };

  const tripOf = (current: string | Step, ahead?: number): OneTripPlan => {
    const step = typeof current === 'string' ? stepOf(current) : entry(current);
    if (!step) return planOneTrip(ctx.steps, ctx.progress, current, ctx.state, ahead);
    const key = `${ahead ?? ''}`;
    const memo = tripMemo.get(step);
    const hit = memo?.get(key);
    if (hit) return hit;
    computed.trip++;
    // A caller-supplied candidate absent from this context gets its own kit, never another phase with the same ID.
    const window = ctx.steps.includes(step) ? ctx.steps : [step];
    const t = planOneTrip(window, ctx.progress, step, ctx.state, ahead);
    const rows = memo ?? new Map<string, OneTripPlan>();
    rows.set(key, t);
    tripMemo.set(step, rows);
    return t;
  };

  return {
    dependencies: dependencyFacts(ctx.steps, ctx.state.quests.known ? ctx.state.quests.value : null, skill => levelOf(ctx.state, skill), ownedCountOf(ctx.state)),
    ctx,
    readiness,
    prep,
    chain(step) {
      step = entry(step);
      const hit = chainMemo.get(step);
      if (hit) return hit;
      const c = fixChainOf(step, ctx, 3, readiness);
      chainMemo.set(step, c);
      return c;
    },
    queue(step, style) {
      step = entry(step);
      const memo = queueMemo.get(step);
      const hit = memo?.get(style);
      if (hit) return hit;
      const q = buildQueue(prep(step), { state: ctx.state, mode: ctx.mode, style });
      const rows = memo ?? new Map<PlayStyle, PrepQueue>();
      rows.set(style, q);
      queueMemo.set(step, rows);
      return q;
    },
    openTasks(stepId) {
      const step = stepOf(stepId);
      return step ? openTaskIds(readiness(step), step) : null;
    },
    trip: tripOf,
    plan(step, opts = {}) {
      step = entry(step);
      const up = opts.upgrade;
      const rec = ctx.recovery && ctx.recovery.stepId === step.id ? ctx.recovery.recovery : null;
      const key = `${opts.ahead ?? ''}:${up ? JSON.stringify(up) : '-'}:${rec ? `${rec.reason}/${rec.since}` : '-'}`;
      const memo = planMemo.get(step);
      const hit = memo?.get(key);
      if (hit) return hit;
      computed.plan++;
      const p = buildPrepPlan({
        step, steps: ctx.steps, progress: ctx.progress, state: ctx.state,
        trip: tripOf(step, opts.ahead), readiness: readiness(step), prices: ctx.prices, upgrade: up ?? null, recovery: rec, questInstruction: ctx.state.connected ? ctx.questInstruction : null,
      });
      const rows = memo ?? new Map<string, PrepPlan>();
      rows.set(key, p);
      planMemo.set(step, rows);
      return p;
    },
    computed,
  };
}
