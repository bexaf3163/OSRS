// Where each opponent of the combat plans can be fought, taken from the route itself: the step that already sends the player to that opponent has the
// place, the NPC name and the way in, checked when the route was written. Nothing here is a second source of coordinates. An opponent no route step
// names has no spot and so cannot be offered: a plan must lead somewhere the guide knows.

import type { GamePoint, Step } from '../../types';

export interface Spot {
  /** The opponent's name as combatFoes.json has it. */
  foe: string;
  /** The route step the place comes from. */
  stepId: string;
  /** Where the arrow leads first (the entrance when the fight is underground). */
  place: { x: number; y: number; plane: number; label: string };
  npcNames: string[];
  /** The one-line target for the game's plate. */
  goal: string;
  /** Stops in order, entrance first; absent when the place is a single point. */
  waypoints?: GamePoint[];
  /** How to find it on the spot, from the step. */
  where: string;
}

/**
 * The opponents the plans may train on or collect from: the free-to-play opponents the route uses or used. The cows of the cow field, the Minotaurs
 * of the Stronghold of Security's first floor, the Giant frogs of the Lumbridge Swamp, and the Hill Giants of the Edgeville Dungeon. A quest boss is never
 * a training target.
 */
export const TRAINERS: readonly string[] = ['Cow', 'Minotaur', 'Hill Giant', 'Giant frog'];

/** Versions of an opponent that stand at the spot the route sends the player to: the first floor's Minotaurs are level 12 (the level 27 ones are elsewhere). */
export const TRAINER_LEVELS: Record<string, number[]> = { Minotaur: [12], 'Giant frog': [13] };

/**
 * Spots a route step used to give before the route moved on (2.74.2: S4-03 went from the Hill Giants to the Giant frogs). The data is the step's own as it
 * was written and played, not a new coordinate: the trapdoor, the way down and the giants' room. A current route step that names the opponent wins.
 */
export const KNOWN_SPOTS: Readonly<Record<string, Spot>> = {
  'Hill Giant': {
    foe: 'Hill Giant', stepId: 'S4-03',
    place: { x: 3097, y: 3468, plane: 0, label: 'The trapdoor to the Edgeville Dungeon' },
    npcNames: ['Hill Giant'],
    goal: 'Edgeville Dungeon: the Hill Giants',
    waypoints: [
      { x: 3097, y: 3468, plane: 0, label: 'The trapdoor to the Edgeville Dungeon: climb down' },
      { x: 3111, y: 9838, plane: 0, label: 'Edgeville Dungeon: the Hill Giants' },
    ],
    where: 'The Hill Giants in the Edgeville Dungeon: the trapdoor is in Edgeville, a few steps south-west of the bank, and the giants are in the south-east of the dungeon. If you have a Brass key, the locked door by the giants saves the walk past the skeletons. The Edgeville bank is a minute away.',
  },
};

/** The spots of the trainers, from the first route step that names each, else from the spot a route step used to give. */
export function spotsOf(steps: readonly Step[]): Map<string, Spot> {
  const out = new Map<string, Spot>();
  for (const foe of TRAINERS) {
    const s = steps.find((x) => x.foes?.[0] === foe && x.mapLocation);
    if (!s || !s.mapLocation) {
      const known = KNOWN_SPOTS[foe];
      if (known) out.set(foe, { ...known, npcNames: [...known.npcNames], ...(known.waypoints ? { waypoints: known.waypoints.map((p) => ({ ...p })) } : {}) });
      continue;
    }
    const g = s.inGame;
    out.set(foe, {
      foe, stepId: s.id,
      place: { x: s.mapLocation.x, y: s.mapLocation.y, plane: s.mapLocation.plane, label: s.mapLocation.label },
      npcNames: g?.npcNames?.length ? [...g.npcNames] : [foe],
      goal: g?.goal ?? s.mapLocation.label,
      ...(g?.pathWaypoints?.length ? { waypoints: g.pathWaypoints.map((p) => ({ ...p })) } : {}),
      where: s.where ?? '',
    });
  }
  return out;
}

/**
 * What an opponent always drops that a step may ask the player to collect: Hill Giants always drop Big bones (the wiki's drop table; the route says
 * the same). A drop with no stated chance is not planned for.
 */
export const GUARANTEED_DROPS: Record<string, string[]> = {
  'Hill Giant': ['Big bones'],
  'Giant frog': ['Big bones'],
  'Cow': ['Cowhide', 'Bones', 'Raw beef'],
};

/** The one drop of a kill worth picking up to sell, a single one each kill: a cow's hide, a Hill Giant's Big bones. Nothing else is counted as income. */
export const SELL_DROP: Record<string, string> = { 'Cow': 'Cowhide', 'Hill Giant': 'Big bones', 'Giant frog': 'Big bones' };
