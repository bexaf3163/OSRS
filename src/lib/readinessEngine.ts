// Единый движок готовности: один раз на снимок состояния считает готовность, маршрут подготовки, цепочку «починить всё»
// и «одну ходку» — и помнит ответы. Экран шага, наблюдатель подготовки, очередь и «что делать сейчас» берут их
// отсюда, а не считают каждый своё: пока ни уровни, ни предметы, ни отметки не изменились, повторных расчётов нет.
//
// Память живёт ровно до смены снимка: движок создаётся заново, когда меняется состояние игрока, отметки или режим.

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
  /** Готовность шага (с памятью). */
  readiness(step: Step): StepReadiness;
  /** Маршрут подготовки к шагу: главное, следом не больше двух. */
  prep(step: Step): PrepRoute;
  /** «Починить всё»: цепочка шагов до готовности. */
  chain(step: Step): ChainLink[];
  /** Открытые задачи подготовки шага; null — такого шага нет. */
  openTasks(stepId: string): Set<string> | null;
  /** Очередь подготовки: маршрут с «куда вести» для каждой задачи. */
  queue(step: Step, style: PlayStyle): PrepQueue;
  /** «Одна ходка» на этот шаг и ближайшие. */
  trip(stepId: string, ahead?: number): OneTripPlan;
  /**
   * План подготовки: одно решение «что нужно», из которого рисуются «Что нужно» в программе, список в игре и проверка
   * у банка (prepPlan.ts). upgrade — совет по инструменту, если он есть.
   */
  plan(step: Step, opts?: { ahead?: number; upgrade?: UpgradeRecommendation | null }): PrepPlan;
  /** Сколько раз по-настоящему считали (не из памяти) — для проверок. */
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
