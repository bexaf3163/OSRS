// The food of combat steps from this player's estimate. Quest-fight food the estimate needs is required (one trip);
// training food is only recommended, since a trip can always end to heal. Without the game's levels and gear, or for
// a fight with no estimate, the route's amount is only recommended, never required.

import type { Progress, Step, StepItemRequirement } from '../../types';
import { gearById, gearData } from './gearAdvisor';
import type { GearPiece } from '../../types';
import { isClosed } from '../quests/next-step';
import { stepGoals, type Fights, type StepEstimateContext } from './combatEstimate';
import { combatPlanView } from './combatPlan';
import type { OwnedState } from '../items/checklist';
import { parseAmount } from '../items/checklist';
import { nameKey } from '../items/itemKey';
import { estimateStepFights } from './fightEstimate';
import { termsFor } from './route/spots';

export interface FoodPick {
  /** Pieces for the next trip: readiness asks for these. */
  trip: number;
  /** Pieces for the whole remaining goal (the plan, with the reserve): the shopping list buys these. */
  total: number;
  /** Health a kill costs net of regeneration, to a tenth: the game's training plate turns the bag's food into kills. */
  hpPerKill: number;
  /** Survival food for a quest fight (required); otherwise only recommended. */
  essential: boolean;
  /** Recommended pieces beyond the estimate where it leaves mechanics out, and which ones. */
  extra?: number;
  extraWhy?: string;
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
 * A quest fight is one trip: the high end of the estimate for each fight with the kit worn now, added up.
 * The guide's amount is never a floor: a fight the estimate says needs no healing needs no food. Where the
 * estimate leaves mechanics out, the guide's surplus is only a recommendation. Only for a fight with no open
 * training step before it (the levels it would reach are not the game's yet).
 */
function fightPick(s: Step, steps: Step[], progress: Progress, live: Live): FoodPick | null {
  const food = (s.itemsRequired ?? []).find((i) => typeof i.heals === 'number');
  if (!food || assumptionsFor(s, steps, progress) !== null) return null;
  const fights = estimateStepFights(s, live.stats as Partial<Record<string, number>> | null, live.gear ?? null, { name: food.nameEn, heals: food.heals! });
  if (!fights.length) return null;
  const need = Math.ceil(fights.reduce((a, f) => a + Math.max(0, f.food.high), 0));
  // One bag at most, beside the step's other items: a fight that needs more is not won by buying more, and the readiness verdict says so.
  const others = (s.itemsRequired ?? []).filter((i) => i !== food && !i.inStep).length;
  const trip = Math.min(need, Math.max(1, Math.min(26, 28 - others)));
  const missing = [...new Set(fights.flatMap((f) => f.unmodelled))];
  const extra = missing.length ? Math.max(0, (parseAmount(food.amount) ?? 0) - trip) : 0;
  return { trip, total: trip, hpPerKill: 0, essential: true, ...(extra ? { extra, extraWhy: missing.join(', ') } : {}) };
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
    if (v) out[s.id] = { trip: v.nextTrip, total: v.plan, hpPerKill: Math.round(v.primary.hpPerKill * 10) / 10, essential: false };
  }
  return out;
}

export function sameFoodPicks(a: Record<string, FoodPick>, b: Record<string, FoodPick>): boolean {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length
    && ka.every((k) => b[k] && a[k].trip === b[k].trip && a[k].total === b[k].total && a[k].hpPerKill === b[k].hpPerKill && a[k].essential === b[k].essential && a[k].extra === b[k].extra);
}

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

/**
 * The step with its food set by the player's own estimate. Essential quest-fight food is required at the estimated
 * amount; training food, the guide's surplus over a partial estimate and food for an unestimated fight are only
 * recommended. A fight that needs no food asks for none.
 */
export function withFoodPlan(step: Step, pick: FoodPick | undefined): Step {
  const at = step.itemsRequired?.findIndex((i) => typeof i.heals === 'number') ?? -1;
  if (at < 0) return step;
  const food = step.itemsRequired![at], key = nameKey(food.nameEn);
  const items = [...step.itemsRequired!];
  items.splice(at, 1);
  const recommended = (step.itemsRecommended ?? []).filter((item) => nameKey(item.nameEn) !== key);
  const { totalAmount: _total, ...plain } = food;
  const advise = (amount: StepItemRequirement['amount'], why: string): StepItemRequirement =>
    ({ ...plain, amount, howToGet: `Optional: ${why}.${food.howToGet ? ` ${food.howToGet}` : ''}` });
  const essential = !!pick?.essential && pick.trip > 0;
  if (essential) items.splice(at, 0, { ...food, amount: pick!.trip, totalAmount: pick!.total });
  if (!pick) recommended.push(advise(food.amount, 'the risk of this fight is not estimated yet, so the guide amount is only a suggestion'));
  else if (!pick.essential) {
    // The adopted combat plan's later phases (goalItemsRequired) still count toward the whole-goal suggestion.
    const later = step.goalItemsRequired?.find((item) => nameKey(item.nameEn) === key);
    const goal = Math.max(pick.total, Number(later?.totalAmount ?? later?.amount) || 0);
    if (pick.trip > 0 || goal > 0) recommended.push({ ...advise(pick.trip, 'more kills per trip; you can always leave to heal'), totalAmount: goal });
  }
  else if (pick.extra) recommended.push(advise(pick.extra, `a margin, because the estimate leaves out ${pick.extraWhy}`));
  // The game's training plate: the food in the bag as kills (plugin 2.57+; an older plugin ignores the field).
  const pacing = step.pacing && pick && pick.hpPerKill > 0 && pick.hpPerKill <= 500 ? { ...step.pacing, foodHpPerKill: pick.hpPerKill } : step.pacing;
  const goalItemsRequired = step.goalItemsRequired?.flatMap((item) => nameKey(item.nameEn) !== key ? [item]
    : essential ? [{ ...item, amount: pick!.total, totalAmount: pick!.total }] : []);
  return { ...step, itemsRequired: items, itemsRecommended: recommended, ...(goalItemsRequired ? { goalItemsRequired } : {}), ...(pacing ? { pacing } : {}) };
}
