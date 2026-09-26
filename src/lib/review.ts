// V2 Review: выполненные шаги, в которых в V2 появились важные требования, ещё не проверенные пользователем.

import type { Progress, Step } from '../types';

export function needsReview(step: Step, p: Progress): boolean {
  return step.updatedInV2 === true && p.steps[step.id] === 'done' && !(p.reviewedV2Steps ?? []).includes(step.id);
}

export function pendingReview(steps: Step[], p: Progress): Step[] {
  return steps.filter((s) => needsReview(s, p));
}
