import type { PlayerStats, Step } from '../../types';
import type { GearState } from '../../services/runeliteBridge';
import type { OwnedState } from '../items/checklist';
import type { PrepPlan } from '../prep/prepPlan';
import type { CombatPlanView } from '../combat/combatPlan';
import { ownedFood } from '../combat/combatPlan';
import { combatReadiness } from '../combat/combatReadiness';
import { COMBAT_FOES, foeLabel, healsOf } from '../combat/combatEstimate';
import { estimateStepFights, fightLine, OTHER_METHOD, stepFightNames } from '../combat/fightEstimate';
import { equippedBySlot, gearData } from '../combat/gearAdvisor';
import { readinessVerdict } from './readinessVerdict';

/** One composition of the existing kit, fight and readiness calculators for both UI and planning. */
export function assessStepReadiness(input: {
  step: Step; plan: PrepPlan; connected: boolean; owned: OwnedState | null; stats: PlayerStats | null;
  gear: GearState | null; view: CombatPlanView | null;
}) {
  const { step, plan, connected, owned, stats, gear, view } = input;
  const food = new Set((step.itemsRequired ?? []).filter(item => typeof item.heals === 'number')
    .flatMap(item => [item.nameEn, ...item.anyOf ?? []]).map(name => name.toLowerCase()));
  const isFood = (name: string) => food.has(name.toLowerCase()) || healsOf(name) !== null;
  const combat = combatReadiness(step, view, gear, owned?.bankSeen === true);
  const weapon = gear?.equipment ? equippedBySlot(gear, gearData).weapon : undefined;
  const worn = weapon ? { weapon: weapon.name, twoHanded: Boolean(weapon.piece?.twoHanded) } : null;
  const estimates = estimateStepFights(step, stats, gear);
  const fights = estimates.map(fight => ({ line: fightLine(fight), foodHigh: fight.food.high,
    foodMid: fight.food.mid, foodName: fight.foodName, foe: foeLabel(fight.foe), name: fight.foe.name }));
  const fightNames = stepFightNames(step).map(name => ({ name, known: COMBAT_FOES.some(foe => foe.name === name) }));
  const carriedFood = ownedFood(step, owned)?.carriedEq ?? null;
  const assessed = new Set(fights.map(fight => fight.name));
  const allFoes = [...new Set([...(step.foes ?? []), ...(step.threats ?? [])])];
  const gaps = [...estimates.filter(fight => fight.unmodelled.length).map(fight => ({ name: fight.foe.name, reason: fight.unmodelled.join('; ') })),
    ...allFoes.filter(name => OTHER_METHOD[name]).map(name => ({ name, reason: OTHER_METHOD[name] }))];
  const unassessedFights = [...new Set([...fightNames.filter(foe => !assessed.has(foe.name)).map(foe => foe.name),
    ...gaps.map(gap => gap.name), ...(step.pacing && !view ? allFoes : [])])];
  return { verdict: readinessVerdict({ plan, connected, owned, isFood, combat, worn, fights, fightNames, carriedFood, fightGaps: gaps }), combat, unassessedFights };
}
