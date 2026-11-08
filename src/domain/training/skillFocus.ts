// Which skill of a combined section (Melee: Attack, Strength, Defence) to train next, and to which level. Focus
// follows the levels the planner's Decision asks for (2.82.3); only when the planner asks for none of these
// skills does the lagging skill train up to where the training engine changes its method (2.82.8).
import type { TrainingAdvice } from './trainingRouter';

/** The level where the engine's pick for the current level hands over to the method `next`; `next` null: no
 * other method takes over before `level`, the advice's goal. */
export interface MethodStop { level: number; next: string | null }

/** The goal of an `untilChange` advice. */
export function methodStop(advice: TrainingAdvice): MethodStop | null {
  return advice.best ? { level: advice.target, next: advice.next ?? null } : null;
}

export interface TrainingFocus {
  skill: string;
  target: number;
  /** planner: a level the committed Decision needs; generic: where the engine changes its method, else the next level. */
  source: 'planner' | 'generic' | 'checkpoint' | 'tracked' | 'preparation';
  /** generic: the method the engine switches to at the target; null when none takes over before it. */
  next?: string | null;
}

interface FocusInput {
  levelSkills: readonly string[];
  /** The level the planner's Decision needs in a skill, undefined when it needs none. */
  goalOf: (id: string) => number | undefined;
  levelOf: (id: string) => number;
  /** The training engine's next method change for a skill from its current level; without it the goal is the next level. */
  stopOf?: (id: string) => MethodStop | null;
  maxLevel?: number;
}

export function trainingFocus({ levelSkills, goalOf, levelOf, stopOf, maxLevel = 99 }: FocusInput): TrainingFocus {
  // 1. The skill furthest behind a level the planner needs.
  let best: TrainingFocus | null = null;
  let bestGap = 0;
  for (const id of levelSkills) {
    const goal = goalOf(id);
    const gap = goal ? goal - levelOf(id) : 0;
    if (goal && gap > bestGap) {
      bestGap = gap;
      best = { skill: id, target: goal, source: 'planner' };
    }
  }
  if (best) return best;
  // 2. The planner needs none of them: the lagging skill, up to where the engine changes its method.
  const lagging = [...levelSkills].sort((a, b) => levelOf(a) - levelOf(b))[0];
  const level = levelOf(lagging);
  const stop = stopOf?.(lagging);
  return stop && stop.level > level
    ? { skill: lagging, target: Math.min(maxLevel, stop.level), source: 'generic', next: stop.next }
    : { skill: lagging, target: Math.min(maxLevel, level + 1), source: 'generic' };
}
