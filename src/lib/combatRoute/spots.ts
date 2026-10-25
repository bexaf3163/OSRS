// Where each opponent of the combat plans can be fought: the registry data/trainers.json, built from scripts/trainers.defs.json and checked against the
// OSRS Wiki and the route (scripts/build-trainers.ts). Nothing here names an opponent, a place or a bank: a new spot (a members one too) is an entry
// in the definitions and a build, and every rule below applies to it as it is. A spot is
//   - a route step's own (fromStep): the step that sends the player to that opponent has the place, the NPC, the way in and the text;
//   - a place a route step used to give (formerStep), written out as it was played;
//   - a wiki spawn (location): a spawn tile of the article's spawn list, kept only where a route step stands within a few tiles.
// Each spot also carries what it changes in the estimate: the walk to its bank and back, a lone boss's respawn, healing for the asking, a special
// attack to keep health above, others joining a fight; and what the opponent always drops, with the one worth selling.

import trainersJson from '../../data/trainers.json';
import type { GamePoint, Step } from '../../types';
import type { SpotTerms } from '../combatEstimate';

export interface Spot {
  /** The opponent's name as combatFoes.json has it. */
  foe: string;
  /** How the guide says them: "cows", "Giant frogs", "Brutus". */
  name: string;
  /** One named opponent ("Fight Brutus", not "the Brutus"). */
  proper?: boolean;
  /** The route step the place comes from (for a wiki spawn: the route step nearest to it). */
  stepId: string;
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
export interface TrainerEntry extends Partial<Omit<Spot, 'foe' | 'stepId' | 'name'>> {
  foe: string;
  name: string;
  fromStep?: string;
  formerStep?: string;
  routeStep?: string;
  /** Opponent versions standing there (combat levels); absent - every free version. */
  levels?: number[];
  /** What the opponent always drops (the wiki's drop table). */
  always: string[];
  members: boolean;
}
export const TRAINER_SPOTS: readonly TrainerEntry[] = (trainersJson as unknown as { trainers: TrainerEntry[] }).trainers;

/** How the guide says an opponent: the registry's name ("Giant frogs"), else the name with an s. */
export const nameOf = (foe: string): string => TRAINER_SPOTS.find((t) => t.foe === foe)?.name ?? `${foe}s`;
/** "the cows", "Brutus": the opponents as the object of a sentence. */
export const themOf = (spot: Pick<Spot, 'name' | 'proper'>): string => (spot.proper ? spot.name : `the ${spot.name}`);

/** The opponents the plans may train on or collect from, in the registry's order. A quest boss is a trainer only through a training spot of its own. */
export const TRAINERS: readonly string[] = TRAINER_SPOTS.map((t) => t.foe);

/** Versions of an opponent that stand at its spot: the first floor's Minotaurs are level 12 (the level 27 ones are elsewhere). */
export const TRAINER_LEVELS: Record<string, number[]> = Object.fromEntries(TRAINER_SPOTS.filter((t) => t.levels?.length).map((t) => [t.foe, [...t.levels!]]));

/** What an opponent always drops that a step may ask the player to collect (the wiki's drop table, through the registry). */
export const GUARANTEED_DROPS: Record<string, string[]> = Object.fromEntries(TRAINER_SPOTS.map((t) => [t.foe, [...t.always]]));

/** The one drop of a kill worth picking up to sell, a single one each kill: a cow's hide, a Hill Giant's Big bones. */
export const SELL_DROP: Record<string, string> = Object.fromEntries(TRAINER_SPOTS.filter((t) => t.sell).map((t) => [t.foe, t.sell!]));

/** The traits of a registry entry that every spot of that opponent carries. */
function traits(t: TrainerEntry): Partial<Spot> & { name: string } {
  return {
    name: t.name, ...(t.proper ? { proper: true } : {}),
    ...(t.bank ? { bank: t.bank } : {}), ...(t.requires ? { requires: { ...t.requires } } : {}),
    ...(t.betweenKills ? { betweenKills: [...t.betweenKills] as [number, number] } : {}), ...(t.freeHeal ? { freeHeal: true } : {}),
    ...(t.specialMaxHit ? { specialMaxHit: t.specialMaxHit } : {}), ...(t.groupAggro ? { groupAggro: true } : {}), ...(t.sell ? { sell: t.sell } : {}),
  };
}

/**
 * The spots of the trainers. A route step that names the opponent first gives the place, the way in and the text (the first such step: a test or an
 * older route may name another); else the registry's written place. A spot that needs a quest is never taken from a step: a quest boss's step is the
 * quest, not a place to train. Members spots only for members.
 */
export function spotsOf(steps: readonly Step[], members: boolean): Map<string, Spot> {
  const out = new Map<string, Spot>();
  for (const t of TRAINER_SPOTS) {
    if (t.members && !members) continue;
    const s = t.requires ? undefined : steps.find((x) => x.foes?.[0] === t.foe && x.mapLocation);
    if (s?.mapLocation) {
      const g = s.inGame;
      out.set(t.foe, {
        foe: t.foe, stepId: s.id,
        place: { x: s.mapLocation.x, y: s.mapLocation.y, plane: s.mapLocation.plane, label: s.mapLocation.label },
        npcNames: g?.npcNames?.length ? [...g.npcNames] : [t.foe],
        goal: g?.goal ?? s.mapLocation.label,
        ...(g?.pathWaypoints?.length ? { waypoints: g.pathWaypoints.map((p) => ({ ...p })) } : {}),
        where: s.where ?? '',
        ...traits(t),
      });
    } else if (t.place && t.npcNames && t.goal && t.where) {
      out.set(t.foe, {
        foe: t.foe, stepId: t.formerStep ?? t.routeStep ?? t.fromStep ?? '', place: { ...t.place }, npcNames: [...t.npcNames], goal: t.goal, where: t.where,
        ...(t.waypoints?.length ? { waypoints: t.waypoints.map((p) => ({ ...p })) } : {}),
        ...traits(t),
      });
    }
  }
  return out;
}

export { bankTrip } from '../bankTrip';
import { bankTrip } from '../bankTrip';

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

const termsCache = new WeakMap<readonly Step[], Record<string, SpotTerms>>();
/** spotTerms of a route's spots, once per route: what the food plan, the plans and the step's estimate all use, so they never disagree. */
export function termsFor(steps: readonly Step[]): Record<string, SpotTerms> {
  let t = termsCache.get(steps);
  // Terms are facts of a place (its bank trip, its respawn), so every spot has them; who may use a spot is decided where spots are offered.
  if (!t) termsCache.set(steps, (t = spotTerms(spotsOf(steps, true))));
  return t;
}
