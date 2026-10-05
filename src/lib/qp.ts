// Quest points.

import type { Progress, Step } from '../types';

/**
 * The points earned: the base (Learning the Ropes) plus the done steps and the steps returned to active
 * after V2 Review (their points are already received in the game). A skipped step gives no points.
 */
export function questPoints(steps: Step[], p: Progress, base: number): number {
  const kept = new Set(p.qpKept ?? []);
  return steps.reduce((sum, s) => sum + (p.steps[s.id] === 'done' || kept.has(s.id) ? s.qp ?? 0 : 0), base);
}

/** How many points can be earned in all, taking skipped steps into account. */
export function reachableQuestPoints(steps: Step[], p: Progress, base: number): number {
  return steps.reduce((sum, s) => sum + (p.steps[s.id] === 'skipped' ? 0 : s.qp ?? 0), base);
}

/** The points by the end of a stage per the plan, minus skipped steps up to and including it. */
export function stageQuestPoints(steps: Step[], stage: number, base: number, p?: Progress): number {
  return steps.reduce((sum, s) => sum + (s.stage <= stage && p?.steps[s.id] !== 'skipped' ? s.qp ?? 0 : 0), base);
}
