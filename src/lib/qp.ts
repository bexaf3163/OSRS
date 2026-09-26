// Очки квестов.

import type { Progress, Step } from '../types';

/** Набранные очки: база (Learning the Ropes) плюс сделанные шаги. Пропущенный шаг очков не даёт. */
export function questPoints(steps: Step[], p: Progress, base: number): number {
  return steps.reduce((sum, s) => sum + (p.steps[s.id] === 'done' ? s.qp ?? 0 : 0), base);
}

/** Сколько очков вообще можно набрать с учётом пропущенных шагов. */
export function reachableQuestPoints(steps: Step[], p: Progress, base: number): number {
  return steps.reduce((sum, s) => sum + (p.steps[s.id] === 'skipped' ? 0 : s.qp ?? 0), base);
}

/** Очки к концу этапа по плану, минус пропущенные шаги до него включительно. */
export function stageQuestPoints(steps: Step[], stage: number, base: number, p?: Progress): number {
  return steps.reduce((sum, s) => sum + (s.stage <= stage && p?.steps[s.id] !== 'skipped' ? s.qp ?? 0 : 0), base);
}
