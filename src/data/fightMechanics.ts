// Typed access to authored/fightMechanics.json: the Wiki's facts about a fight that a plain damage roll does not cover.
import mechanicsJson from './authored/fightMechanics.json';

export interface FightMechanics {
  url: string;
  /** It restores 1 hit point every this many ticks. */
  regenTicks?: number;
  /** An item in the inventory that weakens it when the fight starts; its levels come back 1 every restoreTicks. */
  carried?: { item: string; drain: { hitpoints?: number; attack?: number; strength?: number; defence?: number }; restoreTicks: number; maxHitBonus?: number }[];
  /** Items the killing blow needs in the inventory. */
  finisher?: string[];
  /** The weapon the fight must be done with, and what it multiplies the damage dealt by. */
  weapon?: { item: string; damageMultiplier: number };
  /** Opponents that must be dealt with first (single-way combat). */
  company?: { foe: string; version?: string }[];
  /** A telegraphed attack after every afterAttacks basic ones: a share of the player's Hitpoints level, up to maxHit. */
  specials?: { label: string; afterAttacks: number; hitpointsShare: number; maxHit: number }[];
  /** Other attacks with no known share: always lands, rolls 0..maxHit; unprotected applies without the named protection worn. */
  attacks?: { label: string; maxHit: number; protection?: string; unprotected?: number }[];
  facts: string[];
}

const data = mechanicsJson as unknown as { protections: Record<string, string[]>; foes: Record<string, FightMechanics> };
export const FIGHT_MECHANICS: Readonly<Record<string, FightMechanics>> = data.foes;
/** Worn items that count as a protection, by the hazard's name as the Wiki labels the attack. */
export const PROTECTIONS: Readonly<Record<string, readonly string[]>> = data.protections;
