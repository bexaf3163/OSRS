// The estimator's view of the player for one step: the same inputs the food plan uses (lib/foodPlan.ts), so a plan and the food list never disagree.

import type { Progress, Step } from '../../types';
import type { GearState } from '../../services/runeliteBridge';
import type { Fights, StepEstimateContext } from '../combatEstimate';
import { assumptionsFor } from '../foodPlan';

export interface LiveCombat {
  stats: Partial<Record<string, number>> | null;
  xp: Partial<Record<string, number>> | null;
  gear: GearState | null;
  /** The fights the plugin recorded, on the step they were recorded on. */
  combatLog?: { stepId: string; foes: Fights[] } | null;
}

export function estimateContext(step: Step, live: LiveCombat, steps: Step[], progress: Progress): StepEstimateContext {
  const fights = live.combatLog?.stepId === step.id ? live.combatLog.foes : null;
  return { stats: live.stats, xp: live.xp, gear: live.gear, fights, assume: assumptionsFor(step, steps, progress) };
}
