// The shapes of the funding system: the method catalogue (data), the player snapshot it is judged against, and the answer.
// Nothing here computes; the files next to it do. Every fact the catalogue states carries where it came from and when it was checked.

import type { Confidence } from './quotes';

export type { Confidence };

/** An item by its exchange id and name. Coins are id 995. */
export interface ItemRef { id: number; name: string }

export const COINS: ItemRef = { id: 995, name: 'Coins' };

/**
 * One item moved by one unit of the activity (a kill, an ore, a log, a bar). The expected amount per unit is qty x chance; no chance means every time.
 * Coins are an ordinary flow with the Coins item.
 */
export interface Flow {
  item: ItemRef;
  qty: number;
  /** [numerator, denominator] of the chance per unit, as the wiki states it (3/128). Absent means certain. */
  chance?: [number, number];
  /** Stackable items (runes, arrows, coins) take one bag slot however many there are; everything else one slot each. */
  stack?: boolean;
  note?: string;
}

/** The activity families the audit covers (see docs/FUNDING_COVERAGE.md). */
export type Family =
  | 'combat' | 'gathering' | 'collecting' | 'processing' | 'production'
  | 'shop' | 'direct-coin' | 'surplus-sale' | 'self-supply' | 'one-time';

export type Requirement =
  | { kind: 'level'; skill: string; level: number }
  | { kind: 'quest'; quest: string; state: 'complete' | 'started' }
  | { kind: 'qp'; points: number }
  /** A tool or piece of gear: any one of these will do (a pickaxe of any tier the level allows). */
  | { kind: 'item'; role: 'tool' | 'gear'; any: ItemRef[]; /** A tool family whose tiers are usable at the player's level (toolTiers.ts); replaces the explicit list. */ family?: 'pickaxe' | 'axe'; note?: string }
  /** Coins that must be paid on the way (a ferry, a trip fee), per round trip. */
  | { kind: 'fare'; coins: number; reason: string; /** The fare is not paid once this quest is complete (the Al Kharid toll gate). */ unlessQuest?: string }
  /** A world-state fact the game cannot tell us, shown as "check" and never assumed. */
  | { kind: 'check'; text: string };

export interface Place { x: number; y: number; plane: number; label: string }

export interface Source {
  url: string;
  title: string;
  /** The wiki revision the figures were read from, when the source has one. */
  revision?: number;
  revisedAt?: string;
  retrievedAt: string;
  /** Which fields came from this source. */
  used: string;
}

export interface RateModel {
  /** What one unit is: a kill, an ore, a log, a catch, a bar, a shield. */
  unit: string;
  /** Units an hour of actual work, banking and walking not included. fast is the best case, slow the careful one. */
  perHour: { slow: number; typical: number; fast: number };
  basis: 'wiki-guide' | 'combat-model' | 'observed';
  /** What the figure assumes, in words (gear, levels, crowds). */
  assumes: string;
  /**
   * The wiki figure is for a player at `atLevel`; below it the rate is scaled down linearly to `minFactor` at the required level. A heuristic,
   * stated as one: it exists so that a level-15 miner is not promised a level-60 rate.
   */
  levelScale?: { skill: string; fromLevel: number; atLevel: number; minFactor: number };
  /** The tool the figure assumes; holding a lesser one multiplies the rate by `below`. */
  toolScale?: { assumed: string; better: string[]; below: number };
}

export interface TripModel {
  /** Bag slots the trip's inputs and outputs can use (28 less what is carried for the work: a tool, a pot). The units a trip yields follow from it. */
  bagSlots: number;
  /** Seconds of walking and banking per trip, not counting the work itself. */
  overheadSeconds: number;
  note: string;
}

export type GuideKind = 'prepare' | 'travel' | 'perform' | 'bank' | 'sell' | 'restock';

export interface GuideAction {
  kind: GuideKind;
  /** One short sentence. {units}, {item} and {place} are filled from the plan. */
  text: string;
  place?: Place;
}

export interface CombatProfile {
  /** The monster's name as combatFoes.json has it; the version is chosen from the player's state. */
  foe: string;
  /** The versions the activity is done on (the free ones). */
  versions?: string[];
  /** Food the activity can be done with, cheapest-first decisions are made against live prices. */
  food: string[];
}

export interface FundingMethod {
  /** Stable. Saved plans refer to it. */
  id: string;
  title: string;
  family: Family;
  access: 'f2p' | 'members';
  repeatable: boolean;
  summary: string;
  requirements: Requirement[];
  /** Consumed per unit: supplies, ingredients, fees. */
  inputs: Flow[];
  /** Produced per unit. */
  outputs: Flow[];
  rate: RateModel;
  trip: TripModel;
  /** Where the work is and the bank it banks at. */
  spot: Place;
  bank: Place;
  /** Seconds to sell a trip's worth at the exchange once there (open, list, wait, collect). */
  saleSeconds: number;
  risk: 'low' | 'moderate' | 'high';
  intensity: 'low' | 'moderate' | 'high';
  /** Competition or supply the model cannot see (other players' ore, crowded spawns): the rate is widened and the confidence capped. */
  marketDependence?: string;
  combat?: CombatProfile;
  /** For a self-supply method: the items it provides for the preparation shortfall instead of selling. */
  supplies?: ItemRef[];
  guide: GuideAction[];
  sources: Source[];
  verifiedAt: string;
  confidence: Confidence;
  assumptions: string[];
}

export interface Catalogue {
  version: number;
  generatedAt: string;
  methods: FundingMethod[];
}

/** Wiki guide ids the audit looked at and what became of each (docs/FUNDING_COVERAGE.md is made from the same data). */
export type CoverageStatus = 'supported' | 'unsupported';
export interface CoverageEntry {
  /** The id in moneyMaking.json. */
  id: string;
  status: CoverageStatus;
  /** For supported entries: the catalogue method ids that implement it. */
  methods?: string[];
  family: Family;
  /** For unsupported entries: why, in a short phrase. */
  reason?: string;
}
