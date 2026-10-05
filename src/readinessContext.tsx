// The single readiness engine for the screens: one for the whole app, recreated only when what affects
// the calculations changes (player state, step marks, quest points, mode, route). The calculations and answers are in lib/readinessEngine.ts.

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Step } from './types';
import { useStore } from './store';
import { usePlayerState } from './playerStateContext';
import { createReadinessEngine, type ReadinessEngine } from './lib/readinessEngine';
import type { StepReadiness } from './lib/readiness';
import { useRecoveryTracker, type ActiveRecovery } from './lib/useRecoveryTracker';

const Ctx = createContext<ReadinessEngine | null>(null);
const RecoveryCtx = createContext<{ active: ActiveRecovery | null; dismiss: () => void }>({ active: null, dismiss: () => {} });

export function ReadinessProvider({ children }: { children: ReactNode }) {
  const { progress, qp, mode, steps } = useStore();
  const { state } = usePlayerState();
  const recovery = useRecoveryTracker();
  const engine = useMemo(
    () => createReadinessEngine({ steps, progress, qp, mode, state, recovery: recovery.active }),
    [steps, progress, qp, mode, state, recovery.active],
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
