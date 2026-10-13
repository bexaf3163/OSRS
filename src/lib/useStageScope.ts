import { useMemo } from 'react';
import type { Step } from '../types';
import { useBridge } from '../bridge';
import { useReadiness } from '../readinessContext';
import { scopeReadiness, stageScope, type StageScope } from './stageScope';
import type { StepReadiness } from './readiness';

/** The stage scope of this step, only while the game confirms the quest line the player is on (the same condition as "What to do now"). */
export function useStageScope(step: Step): StageScope | null {
  const { questInstruction, state, inGame, activeStepId } = useBridge();
  return useMemo(
    () => (state === 'online' && inGame && activeStepId === step.id ? stageScope(step, questInstruction) : null),
    [step, questInstruction, state, inGame, activeStepId],
  );
}

/** A step's readiness without the quest items its current stage does not ask for; everything else is the shared engine's answer. */
export function useScopedReadiness(step: Step | null): StepReadiness | null {
  const r = useReadiness(step);
  const scope = useStageScope(step ?? EMPTY);
  return useMemo(() => (r ? scopeReadiness(r, step ? scope : null) : null), [r, scope, step]);
}

const EMPTY = { id: '' } as Step;
