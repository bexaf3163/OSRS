import type { Progress, Step } from '../types';
import { isClosed, nextStep, type DependencyFact } from './next-step';

export interface ActiveActivity {
  step: Step | null;
  source: 'training' | 'game' | 'route' | 'none';
  href: string;
}

/** Browsing a page is not a new activity; completed synthetic skill steps never become route fallbacks. */
export function resolveActiveActivity(input: {
  steps: Step[]; progress: Progress; qp: number; dependencies: DependencyFact;
  training?: { step: Step; complete: boolean } | null; activeStepId?: string | null;
}): ActiveActivity {
  if (input.training && !input.training.complete) return { step: input.training.step, source: 'training', href: '#/' };
  const route = input.steps.filter(step => step.stage !== 0);
  const active = route.find(step => step.id === input.activeStepId && !isClosed(input.progress, step.id));
  const step = active ?? nextStep(route, input.progress, input.qp, input.dependencies) ?? null;
  return { step, source: active ? 'game' : step ? 'route' : 'none', href: step ? `#/step/${step.id}` : '#/' };
}
