import type { Progress, Step } from '../../types';
import { isClosed } from './next-step';
import { hrefTo } from '../pages/pages';

export interface ActiveActivity {
  step: Step | null;
  source: 'training' | 'game' | 'decision' | 'none';
  href: string;
}

/** Browsing a page is not a new activity; completed synthetic skill steps never become fallbacks. The objective comes only
 * from the committed Decision (v14): no route order picks it here. */
export function resolveActiveActivity(input: { steps: readonly Step[]; progress: Progress; decided: Step | null; training?: { step: Step; complete: boolean } | null; activeStepId?: string | null; objectiveSteps?: ReadonlySet<string> }): ActiveActivity {
  if (input.training && !input.training.complete) return { step: input.training.step, source: 'training', href: hrefTo.path() };
  const route = input.steps.filter(step => step.stage !== 0);
  const active = route.find(step => step.id === input.activeStepId && !isClosed(input.progress, step.id));
  const decided = input.decided && !isClosed(input.progress, input.decided.id) ? input.decided : null;
  // The game's step only refines the Decision inside the same objective: a leftover step of another quest never outranks the planner.
  const game = active && (!decided || active.id === decided.id || input.objectiveSteps?.has(active.id)) ? active : null;
  const step = game ?? decided;
  return { step, source: game ? 'game' : step ? 'decision' : 'none', href: step ? hrefTo.step(step.id) : hrefTo.path() };
}
