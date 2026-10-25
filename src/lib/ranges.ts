// The "Training plan" row by skill level.

import type { GoalsData, Progress, Skill, SkillRange } from '../types';
import { levelOf } from './progress';
import { trainingFocus } from './skillFocus';

export interface RangeHit {
  range: SkillRange;
  index: number;
  /** A level above the last closed range ("68–88" at level 95). */
  beyond: boolean;
}

/** The range "15–30" includes 15 and does not include 30: at 30 the next row applies. */
export function rangeForLevel(ranges: SkillRange[], level: number): RangeHit | null {
  if (!ranges.length) return null;
  const index = ranges.findIndex((r) => level >= r.from && (r.to === null || level < r.to));
  if (index >= 0) return { range: ranges[index], index, beyond: false };
  const last = ranges.length - 1;
  if (level >= (ranges[last].to ?? Infinity)) return { range: ranges[last], index: last, beyond: true };
  return { range: ranges[0], index: 0, beyond: false };
}

/** The skill section's level. Melee is the lagging one of Attack, Strength and Defence. */
export function skillLevel(skill: Skill, p: Progress): number {
  return Math.min(...skill.levelSkills.map((id) => levelOf(p, id)));
}

export function skillRange(skill: Skill, p: Progress): RangeHit | null {
  return rangeForLevel(skill.plan.ranges, skillLevel(skill, p));
}

/**
 * The plan row for the skill the route is training: in Melee the one with a goal ahead (Attack 30 toward 40 → giant frogs), not the lowest of the three
 * (a Defence kept at 1 on purpose would show cows). A single skill is its own focus.
 */
export function focusRange(skill: Skill, p: Progress, goals: GoalsData, stage: number, lastStage?: number): { skill: string; level: number; target: number; hit: RangeHit | null } {
  const focus = trainingFocus({
    levelSkills: skill.levelSkills, stage, goals, levelOf: (id) => levelOf(p, id), lastStage,
    rowEnd: (_id, lv) => rangeForLevel(skill.plan.ranges, lv)?.range.to ?? null,
  });
  const level = levelOf(p, focus.skill);
  return { skill: focus.skill, level, target: focus.target, hit: rangeForLevel(skill.plan.ranges, level) };
}
