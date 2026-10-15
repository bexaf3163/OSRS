// The food of combat training steps from this player's estimate, into the route itself: readiness asks for one trip (the next bag), the shopping
// list buys for the whole remaining goal. A step later on the route is estimated from the levels the earlier steps reach and the weapon it asks
// for. Without the game's levels and gear nothing is picked and every step keeps the amounts written in the route.

import type { Progress, Step } from '../types';
import { gearById, gearData } from '../services/gearAdvisor';
import type { GearPiece } from '../types';
import { isClosed } from './next-step';
import { stepGoals, type Fights, type StepEstimateContext } from './combatEstimate';
import { combatPlanView } from './combatPlan';
import type { OwnedState } from './checklist';
import { nameKey } from './checklist';

export interface FoodPick {
  /** Pieces for the next trip: readiness asks for these. */
  trip: number;
  /** Pieces for the whole remaining goal (the plan, with the reserve): the shopping list buys these. */
  total: number;
}

type Live = Omit<StepEstimateContext, 'assume' | 'fights'> & {
  owned: OwnedState | null;
  /** The fights the plugin recorded, on the step they were recorded on. */
  combatLog?: { stepId: string; foes: Fights[] } | null;
};

const gearByName = new Map(gearData.items.map((p) => [nameKey(p.name), p]));

/** The weapon a step asks for (a required item the gear data knows as a weapon); none — null. */
export function stepWeapon(step: Pick<Step, 'itemsRequired'>): GearPiece | null {
  for (const i of step.itemsRequired ?? []) {
    const p = (i.wikiItemId !== undefined ? gearById.get(i.wikiItemId) : undefined) ?? gearByName.get(nameKey(i.nameEn));
    if (p?.slot === 'weapon') return p;
  }
  return null;
}

/**
 * What a step's estimate assumes: for the first open combat step nothing (the game as it is); for a later one the XP goals of the open combat steps
 * before it and the weapon it asks for.
 */
export function assumptionsFor(step: Step, steps: Step[], progress: Progress): StepEstimateContext['assume'] {
  const xp: Partial<Record<'attack' | 'strength' | 'defence', number>> = {};
  let earlier = false;
  for (const s of steps) {
    if (s.id === step.id) break;
    if (isClosed(progress, s.id)) continue;
    const goals = stepGoals(s);
    if (!goals.length) continue;
    earlier = true;
    for (const g of goals) xp[g.skill] = Math.max(xp[g.skill] ?? 0, g.exp);
  }
  return earlier ? { xp, weapon: stepWeapon(step) } : null;
}

/** The food picks of the open combat steps; a step without an estimate gets none. */
export function foodPicks(steps: Step[], progress: Progress, live: Live): Record<string, FoodPick> {
  const out: Record<string, FoodPick> = {};
  for (const s of steps) {
    if (isClosed(progress, s.id) || !stepGoals(s).length) continue;
    const fights = live.combatLog?.stepId === s.id ? live.combatLog.foes : null;
    const v = combatPlanView(s, { ...live, fights, assume: assumptionsFor(s, steps, progress) });
    if (v) out[s.id] = { trip: v.nextTrip, total: v.plan };
  }
  return out;
}

export function sameFoodPicks(a: Record<string, FoodPick>, b: Record<string, FoodPick>): boolean {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => b[k] && a[k].trip === b[k].trip && a[k].total === b[k].total);
}

/**
 * The step with its food set to the pick: `amount` one trip, `totalAmount` the whole goal. No food needed at all (health comes back faster than it
 * goes) — the food is not asked for. No pick — the same object.
 */
export function withFoodPlan(step: Step, pick: FoodPick | undefined): Step {
  const at = step.itemsRequired?.findIndex((i) => typeof i.heals === 'number') ?? -1;
  if (!pick || at < 0) return step;
  const items = [...step.itemsRequired!];
  if (pick.trip <= 0 && pick.total <= 0) items.splice(at, 1);
  else items[at] = { ...items[at], amount: pick.trip, totalAmount: pick.total };
  return { ...step, itemsRequired: items };
}
