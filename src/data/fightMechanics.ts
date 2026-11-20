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
  /** The route fights it from a spot it cannot reach, with this spell: no damage taken, the casts its runes pay for. */
  safespot?: { spell: string };
  /** At this distance every attack of the foe is one that this prayer blocks (the Jungle Demon's magic): no damage while it is on. */
  prayer?: { name: string; level: number; distance: string };
  /** Every version of the monster is fought in a row, without a break (one shapeshifting opponent). */
  forms?: boolean;
  /** The place allows no weapon, armour or runes (Glarial's Tomb): fought bare-handed, whatever is worn. */
  bare?: boolean;
  /** It lowers every combat level, Hitpoints included, to this before the fight (the Mourner's potion). */
  levelCap?: number;
  /** The place allows no food (Recruitment Drive's test rooms): the fight must be won on Hitpoints alone. */
  noFood?: boolean;
  /** Only this quest arrow hurts the foe, fired from this bow or a better one (Temple of Ikov's ice arrows): the fight is that bow and arrow at the Ranged level, whatever weapon is worn. */
  ammo?: { item: string; bow: string };
  facts: string[];
}

const data = mechanicsJson as unknown as { protections: Record<string, string[]>; foes: Record<string, FightMechanics> };
export const FIGHT_MECHANICS: Readonly<Record<string, FightMechanics>> = data.foes;
/** Worn items that count as a protection, by the hazard's name as the Wiki labels the attack. */
export const PROTECTIONS: Readonly<Record<string, readonly string[]>> = data.protections;
