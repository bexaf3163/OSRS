// Which skill of a combined section (Melee: Attack, Strength, Defence) to train next, and to which level. Focus
// follows the levels the planner's Decision asks for (2.82.3; before, the old guide's stage goals); only when the
// planner asks for none of these skills does the generic "lagging skill, end of its training row" apply.

export interface TrainingFocus {
  skill: string;
  target: number;
  /** planner: a level the committed Decision needs; generic: the end of the training plan row. */
  source: 'planner' | 'generic' | 'checkpoint' | 'tracked' | 'preparation';
}

interface FocusInput {
  levelSkills: readonly string[];
  /** The level the planner's Decision needs in a skill, or undefined when it needs none. */
  goalOf: (id: string) => number | undefined;
  levelOf: (id: string) => number;
  /** The end of the training plan row that holds this level, when there is one above it. */
  rowEnd: (id: string, level: number) => number | null;
  maxLevel?: number;
}

export function trainingFocus({ levelSkills, goalOf, levelOf, rowEnd, maxLevel = 99 }: FocusInput): TrainingFocus {
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

  // 2. The planner needs none of them: the lagging skill and the end of its training row.
  const lagging = [...levelSkills].sort((a, b) => levelOf(a) - levelOf(b))[0];
  const level = levelOf(lagging);
  const end = rowEnd(lagging, level);
  return { skill: lagging, target: end && end > level ? end : Math.min(maxLevel, level + 1), source: 'generic' };
}
