// Единый движок готовности для экранов: один на всё приложение, пересоздаётся только когда меняется то, что влияет
// на расчёты (состояние игрока, отметки шагов, очки квестов, режим, маршрут). Расчёты и ответы — lib/readinessEngine.ts.

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Step } from './types';
import { useStore } from './store';
import { usePlayerState } from './playerStateContext';
import { createReadinessEngine, type ReadinessEngine } from './lib/readinessEngine';
import type { StepReadiness } from './lib/readiness';

const Ctx = createContext<ReadinessEngine | null>(null);

export function ReadinessProvider({ children }: { children: ReactNode }) {
  const { progress, qp, mode, steps } = useStore();
  const { state } = usePlayerState();
  const engine = useMemo(() => createReadinessEngine({ steps, progress, qp, mode, state }), [steps, progress, qp, mode, state]);
  return <Ctx.Provider value={engine}>{children}</Ctx.Provider>;
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
