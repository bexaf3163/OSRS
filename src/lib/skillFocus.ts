// Which skill of a combined section (Melee: Attack, Strength, Defence) to train next, and to which level.
// The route sets the order (Damage First: Defence stays at 1 until the stage that needs it), so the choice follows the stage goals;
// only when the route has nothing left to ask for does the generic "lagging skill, end of its training row" apply.

import type { GoalsData } from '../types';
import { goalFor } from './goals';

export interface TrainingFocus {
  skill: string;
  target: number;
  /** route: the goal of the current stage; ahead: the goal of a later stage; generic: the end of the training plan row. */
  source: 'route' | 'ahead' | 'generic' | 'checkpoint' | 'tracked';
  /** The stage the goal belongs to (route and ahead only). */
  stage?: number;
}

interface FocusInput {
  levelSkills: readonly string[];
  stage: number;
  goals: GoalsData;
  levelOf: (id: string) => number;
  /** The end of the training plan row that holds this level, when there is one above it. */
  rowEnd: (id: string, level: number) => number | null;
  maxLevel?: number;
  /** The last stage of the mode the player is in (F2P ends at 6): later cells are not looked at. */
  lastStage?: number;
}

export function trainingFocus({ levelSkills, stage, goals, levelOf, rowEnd, maxLevel = 99, lastStage = goals.stages.length }: FocusInput): TrainingFocus {
  // An optional cell (the Bond branch) is a target of a step the player may skip: it never steers the training.
  const required = (id: string, s: number) => {
    const g = goalFor(goals, id, s);
    return g && g.kind !== 'optional' ? g : undefined;
  };

  // 1. A skill that is behind the goal of the current stage — the biggest gap first.
  let best: TrainingFocus | null = null;
  let bestGap = 0;
  for (const id of levelSkills) {
    const goal = required(id, stage);
    const gap = goal ? goal.min - levelOf(id) : 0;
    if (goal && gap > bestGap) {
      bestGap = gap;
      best = { skill: id, target: goal.min, source: 'route', stage };
    }
  }
  if (best) return best;

  // 2. The stage is satisfied: the nearest later stage that asks for more. A single skill keeps its own training row instead:
  //    only a combined section needs the route to say which of its skills comes first.
  for (let s = stage + 1; levelSkills.length > 1 && s <= lastStage; s++) {
    let pick: TrainingFocus | null = null;
    let gap = 0;
    for (const id of levelSkills) {
      const goal = required(id, s);
      const g = goal ? goal.min - levelOf(id) : 0;
      if (goal && g > gap) {
        gap = g;
        pick = { skill: id, target: goal.min, source: 'ahead', stage: s };
      }
    }
    if (pick) return pick;
  }

  // 3. Nothing in the route: the lagging skill and the end of its training row.
  const lagging = [...levelSkills].sort((a, b) => levelOf(a) - levelOf(b))[0];
  const level = levelOf(lagging);
  const end = rowEnd(lagging, level);
  return { skill: lagging, target: end && end > level ? end : Math.min(maxLevel, level + 1), source: 'generic' };
}
