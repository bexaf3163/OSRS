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
export function resolveActiveActivity(input: { steps: readonly Step[]; progress: Progress; decided: Step | null; training?: { step: Step; complete: boolean } | null; activeStepId?: string | null }): ActiveActivity {
  if (input.training && !input.training.complete) return { step: input.training.step, source: 'training', href: hrefTo.path() };
  const route = input.steps.filter(step => step.stage !== 0);
  const active = route.find(step => step.id === input.activeStepId && !isClosed(input.progress, step.id));
  const decided = input.decided && !isClosed(input.progress, input.decided.id) ? input.decided : null;
  const step = active ?? decided;
  return { step, source: active ? 'game' : step ? 'decision' : 'none', href: step ? hrefTo.step(step.id) : hrefTo.path() };
}
