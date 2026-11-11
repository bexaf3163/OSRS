import type { PlayerStats, Step } from '../../types';
import type { GearState } from '../../services/runeliteBridge';
import type { OwnedState } from '../items/checklist';
import type { PrepPlan } from '../prep/prepPlan';
import type { CombatPlanView } from '../combat/combatPlan';
import { ownedFood } from '../combat/combatPlan';
import { combatReadiness } from '../combat/combatReadiness';
import { COMBAT_FOES, foeLabel, healsOf } from '../combat/combatEstimate';
import { estimateStepFights, fightLine, stepFightFoes, stepFightNames } from '../combat/fightEstimate';
import { BAG_SLOTS } from '../prep/prepPlan';
import { equippedBySlot, gearData } from '../combat/gearAdvisor';
import { readinessVerdict } from './readinessVerdict';
import { coherentSkillXp, levelForXp, xpForLevel } from '../player/xp';

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
  const gaps = estimates.filter(fight => fight.unmodelled.length).map(fight => ({ name: fight.foe.name, reason: fight.unmodelled.join('; ') }));
  const unassessedFights = [...new Set([...fightNames.filter(foe => !assessed.has(foe.name)).map(foe => foe.name),
    ...gaps.map(gap => gap.name), ...(step.pacing && !view ? allFoes : [])])];
  return { verdict: readinessVerdict({ plan, connected, owned, isFood, combat, worn, fights, fightNames, carriedFood, fightGaps: gaps }), combat, unassessedFights };
}

const MELEE = ['attack', 'strength', 'defence'];
/** The skills a fight's training forecast can raise: melee, and Ranged for a bow user's fight. */
const FIGHT_SKILLS = [...MELEE, 'ranged'];

/** Search-only ordinary melee XP: one trained skill, plus its conservative Hitpoints gain. Never observed state.
 * OSRS Wiki /Hitpoints and /Strength: 1.33 HP XP and 4 selected-skill XP per damage; quest/non-combat XP must not use this. */
export function trainedCombatStats(stats: PlayerStats, skill: string, level: number, xp: Readonly<Record<string, number>> = {}): PlayerStats {
  const start = coherentSkillXp(xp[skill], stats[skill]) ? xp[skill] : xpForLevel(Math.min(99, stats[skill] + 1)) - 1;
  const hpStart = coherentSkillXp(xp.hitpoints, stats.hitpoints) ? xp.hitpoints : xpForLevel(stats.hitpoints);
  const hpXp = Math.floor(Math.max(0, xpForLevel(level) - start) * 1.33 / 4);
  return { ...stats, [skill]: level, hitpoints: Math.max(stats.hitpoints, levelForXp(Math.min(200_000_000, hpStart + hpXp))) };
}

/** First safe target for ONE skill, with the other melee skills unchanged. Compare these targets using trainingRouter times.
 * An unmodelled encounter never becomes safe by increasing its ordinary damage-roll inputs. */
export function fightTrainingTarget(step: Step, stats: PlayerStats | null, gear: GearState | null,
  skill = 'attack', xp: Readonly<Record<string, number>> = {}): { skill: string; level: number } | null {
  const level = safeTrainingLevel(step, stats, gear, [skill], xp);
  return level === null ? null : { skill, level };
}

/** The same search-only forecast for several skills raised together; each adds only its own damage-earned Hitpoints. */
export function evenlyTrainedStats(stats: PlayerStats, skills: readonly string[], level: number, xp: Readonly<Record<string, number>> = {}): PlayerStats {
  return skills.reduce((raised, skill) => raised[skill] >= level ? raised : trainedCombatStats(raised, skill, level, xp), stats);
}

/** First level at which the fight is safe once every listed melee skill below it has reached it; null when it is safe now or never. */
export function safeTrainingLevel(step: Step, stats: PlayerStats | null, gear: GearState | null,
  skills: readonly string[], xp: Readonly<Record<string, number>> = {}): number | null {
  const count = stepFightFoes(step).length;
  if (!count || count !== stepFightNames(step).length || !stats || !skills.length || skills.some(skill => !FIGHT_SKILLS.includes(skill))
    || ['hitpoints', ...MELEE, ...skills].some(s => !Number.isInteger(stats[s]) || stats[s] < 1 || stats[s] > 99)) return null;
  const otherSlots = (step.itemsRequired ?? []).filter(item => !item.heals && !item.equip).length;
  const fits = (levels: PlayerStats) => {
    const fights = estimateStepFights(step, levels, gear);
    return fights.length === count && fights.every(f => !f.unmodelled.length && !f.cannot && f.worstHit < levels.hitpoints)
      && fights.reduce((sum, f) => sum + f.food.high, 0) <= Math.min(26, BAG_SLOTS - otherSlots);
  };
  if (fits(stats)) return null;
  if (!fits(evenlyTrainedStats(stats, skills, 99, xp))) return null;
  let low = Math.min(...skills.map(skill => stats[skill])) + 1, high = 99;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (fits(evenlyTrainedStats(stats, skills, mid, xp))) high = mid;
    else low = mid + 1;
  }
  return low;
}
