// Строка «Плана прокачки» по уровню навыка.

import type { Progress, Skill, SkillRange } from '../types';
import { levelOf } from './progress';

export interface RangeHit {
  range: SkillRange;
  index: number;
  /** Уровень выше последнего закрытого диапазона («68–88» при уровне 95). */
  beyond: boolean;
}

/** Диапазон «15–30» включает 15 и не включает 30: на 30 уже следующая строка. */
export function rangeForLevel(ranges: SkillRange[], level: number): RangeHit | null {
  if (!ranges.length) return null;
  const index = ranges.findIndex((r) => level >= r.from && (r.to === null || level < r.to));
  if (index >= 0) return { range: ranges[index], index, beyond: false };
  const last = ranges.length - 1;
  if (level >= (ranges[last].to ?? Infinity)) return { range: ranges[last], index: last, beyond: true };
  return { range: ranges[0], index: 0, beyond: false };
}

/** Уровень раздела навыка. Ближний бой — по отстающему из атаки, силы и защиты. */
export function skillLevel(skill: Skill, p: Progress): number {
  return Math.min(...skill.levelSkills.map((id) => levelOf(p, id)));
}

export function skillRange(skill: Skill, p: Progress): RangeHit | null {
  return rangeForLevel(skill.plan.ranges, skillLevel(skill, p));
}
