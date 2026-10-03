// Единый движок готовности для экранов: один на всё приложение, пересоздаётся только когда меняется то, что влияет
// на расчёты (состояние игрока, отметки шагов, очки квестов, режим, маршрут). Расчёты и ответы — lib/readinessEngine.ts.

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
  if (!v) throw new Error('useReadinessEngine вне ReadinessProvider');
  return v;
}

/** Готовность шага из общего движка: пересчёт — только когда меняются уровни, предметы, монеты, отметки или шаг. */
export function useReadiness(step: Step | null): StepReadiness | null {
  const engine = useReadinessEngine();
  return step ? engine.readiness(step) : null;
}

/** Режим восстановления: срыв (смерть, телепорт) на шаге, который показан в игре; dismiss — «это не срыв». */
export function useRecovery(): { active: ActiveRecovery | null; dismiss: () => void } {
  return useContext(RecoveryCtx);
}
