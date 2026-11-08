import type { GearPiece } from '../../types';

export const REQ_SKILLS = ['attack', 'strength', 'defence', 'ranged', 'magic', 'prayer'] as const;
type RequirementLevels = Partial<Record<(typeof REQ_SKILLS)[number], number>>;
export type MissingRequirement =
  | { kind: 'skill'; skill: (typeof REQ_SKILLS)[number]; need: number; have: number }
  | { kind: 'quest'; quest: string };

/** Existing equipment eligibility: unread levels cannot satisfy a higher requirement, unread quests cannot unlock gear. */
export function missingRequirements(p: GearPiece, lv: RequirementLevels, quests: ReadonlySet<string> = new Set()): MissingRequirement[] {
  const r = p.req ?? {};
  const out: MissingRequirement[] = [];
  for (const skill of REQ_SKILLS) {
    const need = r[skill] ?? 1;
    const have = lv[skill] ?? 1;
    if (need > have) out.push({ kind: 'skill', skill, need, have });
  }
  for (const quest of r.quests ?? []) if (!quests.has(quest)) out.push({ kind: 'quest', quest });
  return out;
}

export function canWear(p: GearPiece, lv: RequirementLevels, quests?: ReadonlySet<string>): boolean {
  return missingRequirements(p, lv, quests).length === 0;
}
