// Goals by stage for skill levels.

import type { GoalsData, GoalValue } from '../types';

export function goalFor(goals: GoalsData, levelId: string, stage: number): GoalValue | undefined {
  return goals.rows.find((r) => r.id === levelId)?.values[stage - 1];
}

export function formatXp(n: number): string {
  return n.toLocaleString('en-US');
}
