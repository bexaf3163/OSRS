// The one committed Decision as the pages, syncs and hooks read it (v14). Only the provider (decisionContext.tsx) writes it;
// readers import this module so they never pull in the provider's funding and route dependencies.
import { createContext, useContext } from 'react';
import type { Step } from '../types';
import type { CommittedDecision } from '../domain/planning/contracts';
import { currentStage } from '../domain/quests/next-step';
import { useStore } from './store';

export interface DecisionValue { decision: CommittedDecision | null; window: readonly Step[] }

export const DecisionCtx = createContext<DecisionValue>({ decision: null, window: [] });

/** The committed Decision; null while the facts cannot support one (the pages then show that it waits for data). */
export function useDecision(): CommittedDecision | null {
  return useContext(DecisionCtx).decision;
}

/** The steps the Decision runs next: its current step and at most two successors (planningWindow). Empty without one. */
export function useDecisionWindow(): readonly Step[] {
  return useContext(DecisionCtx).window;
}

/** The stage the Decision's step is in: Skills, Shopping and the range hints scope their goals by it. */
export function useDecisionStage(): number {
  const { progress, steps } = useStore();
  // shortcut: before the first Decision (connected, character not read yet) the first open stage scopes the pages; drop it when those pages get a waiting state.
  return decisionStep(useDecision(), steps)?.stage ?? currentStage(steps, progress);
}

/** The road ahead from a step, for teleport supplies and the bag: the Decision's window from that step when it is in it,
 * otherwise the step alone. Route order never extends it. */
export function roadFrom(window: readonly Step[], step: Step): Step[] {
  const at = window.findIndex(s => s.id === step.id);
  return at < 0 ? [step] : window.slice(at);
}

/** The authored step the Decision's current action runs on, or null (a VERIFY action, or a step outside these steps). */
export function decisionStep(decision: CommittedDecision | null, steps: readonly Step[]): Step | null {
  const id = decision?.activeAction.stepId;
  return id ? steps.find(step => step.id === id) ?? null : null;
}
