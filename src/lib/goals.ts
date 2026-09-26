// Цели по этапам для уровней навыков.

import type { GoalsData, GoalValue } from '../types';

export function goalFor(goals: GoalsData, levelId: string, stage: number): GoalValue | undefined {
  return goals.rows.find((r) => r.id === levelId)?.values[stage - 1];
}

export function isReached(level: number, goal: GoalValue): boolean {
  return level >= goal.min;
}

export function formatXp(n: number): string {
  return n.toLocaleString('ru-RU');
}
