// The single readiness engine for the screens: one for the whole app, recreated only when what affects
// the calculations changes (player state, step marks, quest points, mode, route). The calculations and answers are in lib/readinessEngine.ts.

import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react';
import type { Step } from '../types';
import { useStore } from './store';
import { useQuestPoints } from './hooks/useQuestPoints';
import { usePlayerState } from './playerStateContext';
import { createReadinessEngine, type ReadinessEngine } from '../domain/readiness/readinessEngine';
import type { StepReadiness } from '../domain/readiness/readiness';
import { useRecoveryTracker, type ActiveRecovery } from './hooks/useRecoveryTracker';
import { useBridge } from './bridge';
import type { QuestInstruction } from '../services/runeliteBridge';
import { usePriceView } from './hooks/usePriceView';
import { useTracked } from './hooks/useTracked';
import { trackedTraining, type TrackedTraining } from '../domain/training/trackedTraining';
import { useFeatures } from './hooks/useFeatures';
import { priorityOf } from '../domain/persistence/methodPriority';
import { useTradeRestriction } from './hooks/useTradeRestriction';
import { resolveActiveActivity } from '../domain/quests/activeActivity';
import { decisionStep, followedSteps, useDecision, usePlanWindow } from './decision';

const Ctx = createContext<ReadinessEngine | null>(null);
const TrainingCtx = createContext<TrackedTraining | null>(null);
const RecoveryCtx = createContext<{ active: ActiveRecovery | null; dismiss: () => void }>({ active: null, dismiss: () => {} });

export function ReadinessProvider({ children }: { children: ReactNode }) {
  const { progress, mode, steps } = useStore();
  const qp = useQuestPoints();
  const { state } = usePlayerState();
  const prices = usePriceView(true);
  const recovery = useRecoveryTracker();
  const bridge = useBridge();
  const tracked = useTracked();
  const planWindow = usePlanWindow();
  const priority = priorityOf(useFeatures());
  const trade = useTradeRestriction();
  const training = useMemo(() => trackedTraining(tracked, state, mode, priority, { prices, restriction: trade.state }),
    [tracked, state, mode, priority, prices, trade.state]);
  const engineSteps = useMemo(() => {
    const all = training ? [...steps, training.step] : steps;
    const current = planWindow[0];
    if (!current || all.includes(current)) return all;
    return all.some(s => s.id === current.id) ? all.map(s => s.id === current.id ? current : s) : [...all, current];
  }, [steps, training, planWindow]);
  const cursor = useRef<{ player: string | null; step: string; instruction: QuestInstruction } | null>(null);
  if (bridge.state !== 'online' || !bridge.inGame || !bridge.activeStepId || !bridge.questInstruction || cursor.current?.player !== (bridge.player ?? null) || cursor.current?.step !== bridge.activeStepId) cursor.current = null;
  if (bridge.state === 'online' && bridge.inGame && bridge.questInstruction && !bridge.questInstruction.peeking && bridge.questInstruction.stepId === bridge.activeStepId) {
    cursor.current = { player: bridge.player ?? null, step: bridge.activeStepId, instruction: bridge.questInstruction };
  }
  const questInstruction = cursor.current?.instruction ?? null;
  const engine = useMemo(
    () => createReadinessEngine({ steps: engineSteps, progress, qp, mode, state, prices, recovery: recovery.active, questInstruction, window: planWindow }),
    [engineSteps, progress, qp, mode, state, prices, recovery.active, questInstruction, planWindow],
  );
  return (
    <Ctx.Provider value={engine}>
      <TrainingCtx.Provider value={training}><RecoveryCtx.Provider value={recovery}>{children}</RecoveryCtx.Provider></TrainingCtx.Provider>
    </Ctx.Provider>
  );
}

/** The same virtual training step for Skills, Path, preparation, Shopping and funding. Never part of saved quest progress. */
export const useTrackedTraining = () => useContext(TrainingCtx);

/** Gear and Shopping use the same admitted active skill/game/route context. */
export function useActiveActivity() {
  const engine = useReadinessEngine();
  const training = useTrackedTraining();
  const bridge = useBridge();
  const decision = useDecision();
  return useMemo(() => resolveActiveActivity({ steps: engine.ctx.steps, progress: engine.ctx.progress, training,
    decided: decisionStep(decision, engine.ctx.steps),
    activeStepId: engine.ctx.state.connected && bridge.inGame ? bridge.activeStepId : null, objectiveSteps: followedSteps(decision, bridge.activeStepId, bridge.questStates ?? null, bridge.questInstruction),
  }), [engine, training, decision, bridge.inGame, bridge.activeStepId, bridge.questStates, bridge.questInstruction]);
}

export function useReadinessEngine(): ReadinessEngine {
  const v = useContext(Ctx);
  if (!v) throw new Error('useReadinessEngine outside ReadinessProvider');
  return v;
}

/** A step's readiness from the shared engine: recomputed only when levels, items, coins, marks or the step change. */
export function useReadiness(step: Step | null): StepReadiness | null {
  const engine = useReadinessEngine();
  return step ? engine.readiness(step) : null;
}

/** The recovery mode: a derailment (death, teleport) on the step that is shown in the game; dismiss — "this is not a derailment". */
export function useRecovery(): { active: ActiveRecovery | null; dismiss: () => void } {
  return useContext(RecoveryCtx);
}
