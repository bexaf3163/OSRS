// Where each opponent of the combat training engine can be fought: the registry data/trainers.json, built from
// scripts/data/trainers.defs.json and checked against the OSRS Wiki (scripts/data/build-trainers.ts). Nothing here names an
// opponent, a place or a bank: a new spot (a members one too) is an entry in the definitions and a build, and every rule below
// applies to it as it is. A spot is written out (place, NPC names, goal and text) or a wiki spawn (location): a spawn tile of
// the article's spawn list. Each spot also carries what it changes in the estimate: the walk to its bank and back, a lone
// boss's respawn, healing for the asking, a special attack to keep health above, others joining a fight; and what the opponent
// always drops, with the one worth selling.

import { trainersJson } from '../../data';
import type { GamePoint } from '../../types';
import type { SpotTerms } from './combatEstimate';

export interface Spot {
  /** The opponent's name as combatFoes.json has it. */
  foe: string;
  /** How the guide says them: "cows", "Giant frogs", "Brutus". */
  name: string;
  /** One named opponent ("Fight Brutus", not "the Brutus"). */
  proper?: boolean;
  /** Where the arrow leads first (the entrance when the fight is underground). */
  place: { x: number; y: number; plane: number; label: string };
  npcNames: string[];
  /** The one-line target for the game's plate. */
  goal: string;
  /** Stops in order, entrance first; absent when the place is a single point. */
  waypoints?: GamePoint[];
  /** How to find it on the spot. */
  where: string;
  /** The bank the player uses from the spot, a majorLocations.json bank ("Edgeville Bank"); absent - the nearest in a straight line. */
  bank?: string;
  /** A quest the spot needs done (Brutus: The Ides of Milk). */
  requires?: { quest: string };
  /** Seconds from a kill to the next fight when the opponent is alone (a boss's respawn). */
  betweenKills?: [number, number];
  /** Healing for the asking instead of food (the monks). */
  freeHeal?: boolean;
  /** A special attack's max hit, dodged by stepping aside. */
  specialMaxHit?: number;
  /** Others of the group join when one is attacked. */
  groupAggro?: boolean;
  /** The always-drop worth picking up to sell, one a kill. */
  sell?: string;
}

/** A spot of data/trainers.json, as the builder writes it. */
export interface TrainerEntry extends Partial<Omit<Spot, 'foe' | 'name'>> {
  foe: string;
  name: string;
  /** Opponent versions standing there (combat levels); absent - every free version. */
  levels?: number[];
  /** What the opponent always drops (the wiki's drop table). */
  always: string[];
  members: boolean;
}

export const TRAINER_SPOTS: readonly TrainerEntry[] = (trainersJson as unknown as { trainers: TrainerEntry[] }).trainers;



/** Versions of an opponent that stand at its spot: the first floor's Minotaurs are level 12 (the level 27 ones are elsewhere). */
export const TRAINER_LEVELS: Record<string, number[]> = Object.fromEntries(TRAINER_SPOTS.filter((t) => t.levels?.length).map((t) => [t.foe, [...t.levels!]]));

/** What an opponent always drops that a step may ask the player to collect (the wiki's drop table, through the registry). */
export const GUARANTEED_DROPS: Record<string, string[]> = Object.fromEntries(TRAINER_SPOTS.map((t) => [t.foe, [...t.always]]));


/** The spots of the trainers, as the registry writes them. Members spots only for members. */
export function spotsOf(members: boolean): Map<string, Spot> {
  const out = new Map<string, Spot>();
  for (const t of TRAINER_SPOTS) {
    if (t.members && !members) continue;
    if (!t.place || !t.npcNames || !t.goal || !t.where) continue;
    out.set(t.foe, {
      foe: t.foe, name: t.name, place: { ...t.place }, npcNames: [...t.npcNames], goal: t.goal, where: t.where,
      ...(t.waypoints?.length ? { waypoints: t.waypoints.map((p) => ({ ...p })) } : {}),
      ...(t.proper ? { proper: true } : {}), ...(t.bank ? { bank: t.bank } : {}), ...(t.requires ? { requires: { ...t.requires } } : {}),
      ...(t.betweenKills ? { betweenKills: [...t.betweenKills] as [number, number] } : {}), ...(t.freeHeal ? { freeHeal: true } : {}),
      ...(t.specialMaxHit ? { specialMaxHit: t.specialMaxHit } : {}), ...(t.groupAggro ? { groupAggro: true } : {}), ...(t.sell ? { sell: t.sell } : {}),
    });
  }
  return out;
}

import { bankTrip } from '../travel/bankTrip';

/** What each trainer's spot changes in the combat estimate, by the opponent's name: the bank trip and the spot's own traits. */
export function spotTerms(spots: ReadonlyMap<string, Spot>): Record<string, SpotTerms> {
  const out: Record<string, SpotTerms> = {};
  for (const [foe, spot] of spots) {
    const trip = bankTrip(spot);
    out[foe] = {
      ...(trip ? { tripMinutes: trip.minutes } : {}), ...(spot.betweenKills ? { betweenKills: spot.betweenKills } : {}),
      ...(spot.freeHeal ? { freeHeal: true } : {}), ...(spot.specialMaxHit ? { specialMaxHit: spot.specialMaxHit } : {}),
      ...(spot.groupAggro ? { groupAggro: true } : {}),
    };
  }
  return out;
}

let terms: Record<string, SpotTerms> | null = null;
/** spotTerms of every spot, computed once: the food plan and the estimate both use it, so they never disagree. Terms are facts
 * of a place (its bank trip, its respawn), so every spot has them; who may use a spot is decided where spots are offered. */
export function termsFor(): Record<string, SpotTerms> {
  return (terms ??= spotTerms(spotsOf(true)));
}
