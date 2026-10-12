// Monkey Madness I: Daero's training choice. Two options, both give 35,000 XP to two skills and 20,000 to the other two:
//   A: Attack and Defence 35,000, Strength and Hitpoints 20,000;
//   B: Strength and Hitpoints 35,000, Attack and Defence 20,000.
// The route wants 60 Attack for the Dragon scimitar, so the choice follows what Attack still needs.

import { xpForLevel } from './xp';

export const DAERO_BIG = 35_000;
export const DAERO_SMALL = 20_000;
export const ATTACK_FOR_DRAGON_SCIMITAR = 60;

export type DaeroPick = 'ATTACK_DEFENCE' | 'STRENGTH_HITPOINTS';

export interface DaeroAdvice {
  pick: DaeroPick;
  /** Attack XP still missing for 60 before the reward; null when not known. */
  missing: number | null;
  /** One sentence for the player. */
  reason: string;
}

/**
 * Which pair to ask Daero for. With the Attack XP known the answer is exact; with only the level it is the level; with nothing, Attack and Defence
 * (the route's default: it is the pair that can matter for the scimitar).
 */
export function daeroAdvice(attackLevel: number | undefined, attackXp: number | undefined): DaeroAdvice {
  const need = xpForLevel(ATTACK_FOR_DRAGON_SCIMITAR);
  const xp = attackXp ?? (attackLevel !== undefined && attackLevel >= ATTACK_FOR_DRAGON_SCIMITAR ? need : undefined);
  if (xp !== undefined) {
    const missing = Math.max(0, need - xp);
    if (missing === 0) {
      return { pick: 'STRENGTH_HITPOINTS', missing, reason: 'You already have 60 Attack for the Dragon scimitar: take Strength and Hitpoints, 35,000 XP each.' };
    }
    if (missing <= DAERO_SMALL) {
      return { pick: 'STRENGTH_HITPOINTS', missing, reason: `Attack is only ${missing.toLocaleString('en-US')} XP short of 60, and even the smaller share (20,000) covers it: take Strength and Hitpoints, 35,000 XP each.` };
    }
    return {
      pick: 'ATTACK_DEFENCE', missing,
      reason: missing <= DAERO_BIG
        ? `Attack needs ${missing.toLocaleString('en-US')} XP for 60 and only the larger share (35,000) gets there: take Attack and Defence.`
        : `Attack is ${missing.toLocaleString('en-US')} XP short of 60: take Attack and Defence, 35,000 XP each, it saves the most grinding.`,
    };
  }
  if (attackLevel !== undefined) {
    return { pick: 'ATTACK_DEFENCE', missing: null, reason: `Attack ${attackLevel} is below 60: take Attack and Defence, 35,000 XP each.` };
  }
  return { pick: 'ATTACK_DEFENCE', missing: null, reason: 'Take Attack and Defence unless your Attack is already 60 or close to it: it is the share that saves the Dragon scimitar grind.' };
}
