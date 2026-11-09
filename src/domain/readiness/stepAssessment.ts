import type { PlayerStats, Step } from '../../types';
import type { GearState } from '../../services/runeliteBridge';
import type { OwnedState } from '../items/checklist';
import type { PrepPlan } from '../prep/prepPlan';
import type { CombatPlanView } from '../combat/combatPlan';
import { ownedFood } from '../combat/combatPlan';
import { combatReadiness } from '../combat/combatReadiness';
import { COMBAT_FOES, foeLabel, healsOf } from '../combat/combatEstimate';
import { estimateStepFights, fightLine, OTHER_METHOD, stepFightFoes, stepFightNames } from '../combat/fightEstimate';
import { BAG_SLOTS } from '../prep/prepPlan';
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

const MELEE = ['attack', 'strength', 'defence'];

/** The lowest equal Attack, Strength, Defence and Hitpoints at which even the high food estimate of every quest fight of
 * the step fits in the bag (the verdict blocks a whole bag on average), and the lowest of those melee skills to train
 * first. Null when the levels already do, are unread, or no level up to 99 does. */
export function fightTrainingTarget(step: Step, stats: PlayerStats | null, gear: GearState | null): { skill: string; level: number } | null {
  const count = stepFightFoes(step).length;
  if (!count || !stats || ['hitpoints', ...MELEE].some((s) => typeof stats[s] !== 'number')) return null;
  const fits = (levels: PlayerStats) => {
    const fights = estimateStepFights(step, levels, gear);
    return fights.length === count && fights.every((f) => f.food.high < BAG_SLOTS);
  };
  if (fits(stats)) return null;
  for (let level = 2; level <= 99; level++) {
    const lifted = Object.fromEntries(['hitpoints', ...MELEE].map((s) => [s, Math.max(stats[s], level)]));
    if (!fits({ ...stats, ...lifted })) continue;
    const skill = [...MELEE].sort((a, b) => stats[a] - stats[b]).find((s) => stats[s] < level);
    return skill ? { skill, level } : null;
  }
  return null;
}
