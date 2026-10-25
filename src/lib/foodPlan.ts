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
import { nameKey, parseAmount } from './checklist';
import { estimateStepFights } from './fightEstimate';
import { termsFor } from './combatRoute/spots';

export interface FoodPick {
  /** Pieces for the next trip: readiness asks for these. */
  trip: number;
  /** Pieces for the whole remaining goal (the plan, with the reserve): the shopping list buys these. */
  total: number;
  /** Health a kill costs net of regeneration, to a tenth: the game's training plate turns the bag's food into kills. */
  hpPerKill: number;
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

/**
 * A quest fight is one trip: the high end of the estimate for each fight with the kit worn now, added up, never below what the route writes (the
 * estimate leaves out specials and dragonfire, so it only ever raises the route's amount). Only for a fight with no open training step before it:
 * the levels it would reach are not the game's yet.
 */
function fightPick(s: Step, steps: Step[], progress: Progress, live: Live): FoodPick | null {
  const food = (s.itemsRequired ?? []).find((i) => typeof i.heals === 'number');
  if (!food || assumptionsFor(s, steps, progress) !== null) return null;
  const fights = estimateStepFights(s, live.stats as Partial<Record<string, number>> | null, live.gear ?? null, { name: food.nameEn, heals: food.heals! });
  if (!fights.length) return null;
  const need = fights.reduce((a, f) => a + Math.max(0, f.food.high), 0);
  const written = parseAmount(food.amount) ?? 0;
  // One bag at most, beside the step's other items: a fight that needs more is not won by buying more, and the readiness verdict says so.
  const others = (s.itemsRequired ?? []).filter((i) => i !== food && !i.inStep).length;
  const slots = Math.max(1, Math.min(26, 28 - others));
  const trip = Math.min(Math.max(need, written), Math.max(slots, written));
  return trip > written ? { trip, total: trip, hpPerKill: 0 } : null;
}

/** The food picks of the open combat steps; a step without an estimate gets none. */
export function foodPicks(steps: Step[], progress: Progress, live: Live): Record<string, FoodPick> {
  const out: Record<string, FoodPick> = {};
  for (const s of steps) {
    if (isClosed(progress, s.id)) continue;
    if (!stepGoals(s).length && !s.combatPlan?.trainingSkill) {
      const p = fightPick(s, steps, progress, live);
      if (p) out[s.id] = p;
      continue;
    }
    const fights = live.combatLog?.stepId === s.id ? live.combatLog.foes : null;
    const v = combatPlanView(s, { ...live, fights, assume: assumptionsFor(s, steps, progress), terms: termsFor(steps) });
    if (v) out[s.id] = { trip: v.nextTrip, total: v.plan, hpPerKill: Math.round(v.primary.hpPerKill * 10) / 10 };
  }
  return out;
}

export function sameFoodPicks(a: Record<string, FoodPick>, b: Record<string, FoodPick>): boolean {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length
    && ka.every((k) => b[k] && a[k].trip === b[k].trip && a[k].total === b[k].total && a[k].hpPerKill === b[k].hpPerKill);
}

/**
 * The step with its food set to the pick: `amount` one trip, `totalAmount` the whole goal. No food needed at all (health comes back faster than it
 * goes) — the food is not asked for. No pick — the same object.
 */
/** The personal food plan has replaced the route's own food amount, or there is no food to plan: no food item is left without a total. */
export function foodPlanApplied(step: Pick<Step, 'itemsRequired'>): boolean {
  return !(step.itemsRequired ?? []).some((i) => typeof i.heals === 'number' && i.totalAmount === undefined);
}

/**
 * What sends a combat training step to the game again by itself (bridge.tsx): its plan and phase, the opponent, the place, and whether the food plan has
 * replaced the route's amount yet. Not the food figures themselves: they follow the player's XP and would resend the step every few kills. The food plan
 * settles after the plan (it waits for prices and gear), and without it in the key the game kept the route's 25 Salmon while the app said 21 (2.72.2, live).
 */
export function stepResendKey(step: Step): string {
  return JSON.stringify([step.combatPlan ?? null, step.foes?.[0] ?? null, step.mapLocation && [step.mapLocation.x, step.mapLocation.y], foodPlanApplied(step)]);
}

export function withFoodPlan(step: Step, pick: FoodPick | undefined): Step {
  const at = step.itemsRequired?.findIndex((i) => typeof i.heals === 'number') ?? -1;
  if (!pick || at < 0) return step;
  const items = [...step.itemsRequired!];
  if (pick.trip <= 0 && pick.total <= 0) items.splice(at, 1);
  else items[at] = { ...items[at], amount: pick.trip, totalAmount: pick.total };
  // The game's training plate: the food in the bag as kills (plugin 2.57+; an older plugin ignores the field).
  const pacing = step.pacing && pick.hpPerKill > 0 && pick.hpPerKill <= 500 ? { ...step.pacing, foodHpPerKill: pick.hpPerKill } : step.pacing;
  return { ...step, itemsRequired: items, ...(pacing ? { pacing } : {}) };
}
