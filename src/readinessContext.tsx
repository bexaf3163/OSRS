// The single readiness engine for the screens: one for the whole app, recreated only when what affects
// the calculations changes (player state, step marks, quest points, mode, route). The calculations and answers are in lib/readinessEngine.ts.

import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react';
import type { Step } from './types';
import { useStore } from './store';
import { useQuestPoints } from './lib/useQuestPoints';
import { usePlayerState } from './playerStateContext';
import { createReadinessEngine, type ReadinessEngine } from './lib/readinessEngine';
import type { StepReadiness } from './lib/readiness';
import { useRecoveryTracker, type ActiveRecovery } from './lib/useRecoveryTracker';
import { useBridge } from './bridge';
import type { QuestInstruction } from './services/runeliteBridge';
import { usePriceView } from './lib/funding/usePriceView';

const Ctx = createContext<ReadinessEngine | null>(null);
const RecoveryCtx = createContext<{ active: ActiveRecovery | null; dismiss: () => void }>({ active: null, dismiss: () => {} });

export function ReadinessProvider({ children }: { children: ReactNode }) {
  const { progress, mode, steps } = useStore();
  const qp = useQuestPoints();
  const { state } = usePlayerState();
  const prices = usePriceView(true);
  const recovery = useRecoveryTracker();
  const bridge = useBridge();
  const cursor = useRef<{ player: string | null; step: string; instruction: QuestInstruction } | null>(null);
  if (bridge.state !== 'online' || !bridge.inGame || !bridge.activeStepId || !bridge.questInstruction || cursor.current?.player !== (bridge.player ?? null) || cursor.current?.step !== bridge.activeStepId) cursor.current = null;
  if (bridge.state === 'online' && bridge.inGame && bridge.questInstruction && !bridge.questInstruction.peeking && bridge.questInstruction.stepId === bridge.activeStepId) {
    cursor.current = { player: bridge.player ?? null, step: bridge.activeStepId, instruction: bridge.questInstruction };
  }
  const questInstruction = cursor.current?.instruction ?? null;
  const engine = useMemo(
    () => createReadinessEngine({ steps, progress, qp, mode, state, prices, recovery: recovery.active, questInstruction }),
    [steps, progress, qp, mode, state, prices, recovery.active, questInstruction],
  );
  return (
    <Ctx.Provider value={engine}>
      <RecoveryCtx.Provider value={recovery}>{children}</RecoveryCtx.Provider>
    </Ctx.Provider>
  );
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
