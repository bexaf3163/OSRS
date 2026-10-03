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
  /** Сколько раз по-настоящему считали (не из памяти) — для проверок. */
  readonly computed: { readiness: number; trip: number };
}

export function createReadinessEngine(ctx: ReadinessContext): ReadinessEngine {
  const readinessMemo = new Map<string, StepReadiness>();
  const prepMemo = new Map<string, PrepRoute>();
  const chainMemo = new Map<string, ChainLink[]>();
  const tripMemo = new Map<string, OneTripPlan>();
  const queueMemo = new Map<string, PrepQueue>();
  const computed = { readiness: 0, trip: 0 };
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
    trip(stepId, ahead) {
      const key = `${stepId}:${ahead ?? ''}`;
      const hit = tripMemo.get(key);
      if (hit) return hit;
      computed.trip++;
      const t = planOneTrip(ctx.steps, ctx.progress, stepId, ctx.state, ahead);
      tripMemo.set(key, t);
      return t;
    },
    computed,
  };
}
