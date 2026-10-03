// «Одна ходка»: подготовка к текущему шагу и нескольким ближайшим вместе — один заход в банк и на биржу вместо
// трёх. Предметы собираются из требований шагов окна, то, что уже есть у игрока, закрепляется за ближайшими шагами
// (резерв: одни и те же 13 штук еды не засчитываются дважды), инструменты берутся один раз на все шаги.
// «Нужно позже» не значит «купи сейчас»: каждой строке — срочность NOW / SOON / LATER.

import type { Step } from '../types';
import { aggregateShopping, type ShoppingLine } from './shopping';
import { parseAmount } from './checklist';
import { heldOf, type Held, type PlayerState } from './playerState';
import { isClosed } from './next-step';
import type { Progress } from '../types';
import type { Urgency } from './prepRoute';

/** Шагов вперёд после текущего, которые берём в одну ходку. */
export const LOOK_AHEAD = 3;

export type TripStatus = 'HAVE' | 'BANK' | 'GET' | 'UNKNOWN';

export interface TripAllocation {
  stepId: string;
  need: number;
  /** Сколько из нужного покрыто тем, что уже есть (закреплено за этим шагом). */
  covered: number;
}

export interface TripLine {
  line: ShoppingLine;
  held: Held;
  allocation: TripAllocation[];
  /** Сколько ещё взять (купить или забрать); null — неизвестно (банк не открывали). */
  toGet: number | null;
  status: TripStatus;
  /** Когда понадобится: по ближайшему шагу, где не хватает. */
  urgency: Urgency;
}

export interface TripCoins {
  need: number;
  have: number | null;
  missing: number | null;
}

export interface OneTripPlan {
  /** Шаги окна по порядку: текущий и ближайшие. */
  stepIds: string[];
  lines: TripLine[];
  /** Взять сейчас: нужно текущему шагу, а у игрока нет (или лежит в банке). */
  now: TripLine[];
  /** Заодно, если по пути: понадобится в ближайших шагах. */
  soon: TripLine[];
  /** Позже: не сейчас, только чтобы знать. */
  later: TripLine[];
  /** Проверить нечем (банк не открывали, плагин не следил): не «нет», а «не знаю» — в списки «взять» не попадает. */
  unknown: TripLine[];
  coins: TripCoins;
}

/** Текущий шаг и следующие незакрытые (по порядку маршрута) — окно подготовки. */
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
      // Инструмент нужен один на все шаги: берём наибольшее, а не сумму.
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
    // Закрепляем уже имеющееся за ближайшими шагами: есть 13 из 20 — первым хватает, последнему не хватит.
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
  const coinsHave = state.coins.bag.known && state.coins.bank.known ? state.coins.bag.value + state.coins.bank.value : null;
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
