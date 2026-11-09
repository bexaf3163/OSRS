import type { PlayerStats, Step } from '../../../types';
import type { GearState } from '../../../services/runeliteBridge';
import { adviseGear, type GearAction } from '../../combat/gearAdvisor';
import { gearMarketPrices } from '../../combat/gearAdvice';
import { estimateStepFights, stepFightNames, stepFightFoes } from '../../combat/fightEstimate';
import type { FightEstimate } from '../../combat/fightEstimate';
import { EAT_SECONDS } from '../../combat/combatEstimate';
import { gearById } from '../../items/gearRegistry';
import { safetyRulesOf } from '../../prep/safety';
import { stepFood } from '../../player/foodStock';
import { fightTrainingTarget, trainedCombatStats } from '../../readiness/stepAssessment';
import type { PriceView } from '../../market/quotes';
import type { PlanningSnapshot, Minutes } from '../contracts';

export interface EncounterSetup {
  label: string;
  step: Step;
  gear: GearState;
  stats: PlayerStats;
  kit: readonly GearAction[];
  target?: { skill: string; level: number };
  fight: Minutes;
}

/** The same fight/eating accounting for observed and hypothetical setups; no second DPS formula. */
export function encounterWork(fights: readonly FightEstimate[]): Minutes {
  return { fast: fights.reduce((n, f) => n + f.seconds.low + f.food.low * EAT_SECONDS, 0) / 60,
    typical: fights.reduce((n, f) => n + f.seconds.mid + f.food.mid * EAT_SECONDS, 0) / 60,
    slow: fights.reduce((n, f) => n + f.seconds.high + f.food.high * EAT_SECONDS, 0) / 60,
    source: 'Shared fightEstimate damage rolls and combatEstimate eating delay; estimated full-health encounter' };
}

/** Conditional equipment for the calculator only. Never grants actual ownership or wearing. */
function wearing(gear: GearState, kit: readonly GearAction[]): GearState {
  let equipment = [...gear.equipment!];
  for (const { item } of kit) {
    const slot = item.slot === 'neck' ? 'amulet' : item.slot;
    equipment = equipment.filter(piece => piece.slot !== slot && !(item.twoHanded && piece.slot === 'shield'));
    equipment.push({ id: item.id, name: item.name, slot, count: 1 });
  }
  return { ...gear, equipment };
}

/** Assemble the shared model's exact combat-food need and selected kit; quest hand-ins remain untouched. */
function forecast(step: Step, stats: PlayerStats, gear: GearState, kit: readonly GearAction[], label: string,
  target?: EncounterSetup['target'], assessed?: FightEstimate[]): EncounterSetup | null {
  if (gear.equipment?.some(p => p.slot === 'shield') && gear.equipment.some(p => p.slot === 'weapon' && gearById.get(p.id)?.twoHanded)) return null;
  if (safetyRulesOf(step).some(rule => rule.worn && !gear.equipment?.some(p => rule.names.includes(p.name)))) return null;
  const fights = assessed ?? estimateStepFights(step, stats, gear);
  if (!fights.length || fights.length !== stepFightNames(step).length || fights.some(f => f.unmodelled.length || f.foe.maxHit >= stats.hitpoints)) return null;
  const food = Math.ceil(fights.reduce((sum, f) => sum + f.food.high, 0));
  const authoredFood = stepFood(step) ?? { nameEn: 'Trout', heals: 7, amount: 0, howToGet: '' };
  const items = (step.itemsRequired ?? []).filter(item => !item.heals && !kit.some(a => a.item.name === item.nameEn));
  const others = items.filter(item => !item.equip).length;
  if (food > Math.min(26, 28 - others)) return null;
  const requirements = [ ...kit.map(a => ({ nameEn: a.item.name, wikiItemId: a.item.id, amount: 1, equip: true, howToGet: '' })),
    ...items, ...(food ? [{ ...authoredFood, amount: food, totalAmount: food, inStep: false }] : []) ];
  // Eating delay is the existing combatEstimate model's 3 ticks per piece. Do not count food as free fight time.
  return { label, stats, gear, kit, target, fight: encounterWork(fights),
    step: { ...step, itemsRequired: requirements, itemsRecommended: (step.itemsRecommended ?? []).filter(item => !item.heals) } };
}

/** Bounded alternatives INSIDE tactical preparation, not another objective planner. No fabricated kit, prices or monster stats. */
export function encounterSetups(step: Step, snapshot: PlanningSnapshot, prices: PriceView, ironman: boolean | null, currentOnly = false): EncounterSetup[] {
  const { stats, gear } = snapshot.combat ?? {};
  if (!snapshot.player.connected || !stats || !gear?.equipment || !stepFightNames(step).length) return [];
  // Before proposing any spend/training, require a supported observed baseline model (unsafe food quantity is allowed here).
  const estimates = estimateStepFights(step, stats, gear);
  if (estimates.length !== stepFightNames(step).length || estimates.some(f => f.unmodelled.length)) return [];
  const current = forecast(step, stats, gear, [], 'Current equipment', undefined, estimates);
  if (currentOnly) return current ? [current] : [];
  const questsDone = new Set(Object.entries(snapshot.quests).filter(([, q]) => q.state === 'COMPLETED').map(([id]) => id));
  const advice = (levels: PlayerStats) => adviseGear({ levels, gear, owned: snapshot.player.owned, mode: snapshot.scope.mode,
    geQuotes: gearMarketPrices(prices), foes: stepFightFoes(step), questsDone });
  const picked = advice(stats);
  const eligible = (a: GearAction): GearAction | null => {
    if (a.source.kind !== 'ge' || ironman === false) return a;
    const source = a.alternatives.find(s => s.kind === 'shop');
    return source?.kind === 'shop' ? { ...a, source, cost: source.price + (source.toll ?? 0) } : null;
  };
  const choices = picked.choices.flatMap(a => { const c = eligible(a); return c && (c.how === 'wear' || c.cost !== null) ? [c] : []; });
  // At most cheap/best/owned per slot, plus combined affordable and full kits. Preserve different safety/cost tradeoffs.
  const kits: GearAction[][] = [[]];
  for (const slot of ['weapon', 'neck', 'body', 'legs', 'head', 'shield']) {
    const rows = choices.filter(a => a.slot === slot);
    if (!rows.length) continue;
    const gain = (a: GearAction) => a.gain.kind === 'dps' ? a.gain.after.dps : a.gain.after;
    const best = [...rows].sort((a, b) => gain(b) - gain(a) || (a.cost ?? Infinity) - (b.cost ?? Infinity))[0];
    const cheap = [...rows].sort((a, b) => (a.cost ?? Infinity) - (b.cost ?? Infinity) || gain(b) - gain(a))[0];
    const owned = rows.filter(a => a.how === 'wear').sort((a, b) => gain(b) - gain(a))[0];
    for (const a of new Set([cheap, best, ...(owned ? [owned] : [])])) kits.push([a]);
  }
  const allowed = (rows: GearAction[]) => rows.flatMap(a => { const c = eligible(a); return c ? [c] : []; });
  kits.push(allowed([...picked.actions, ...picked.armour]), allowed([...picked.actions, ...picked.armour, ...picked.goals]
    .filter((a, i, all) => !all.slice(i + 1).some(b => b.slot === a.slot))));
  const seen = new Set<string>(), result: EncounterSetup[] = current ? [current] : [];
  for (const kit of kits) {
    if (kit.some(a => a.source.kind === 'ge' && ironman !== false)) continue;
    const key = kit.map(a => a.item.id).sort().join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    const worn = wearing(gear, kit), label = kit.length ? kit.map(a => a.item.name).join(' + ') : 'Current equipment';
    if (kit.length) { const ready = forecast(step, stats, worn, kit, label); if (ready) result.push(ready); }
    // Training on every individual armour permutation is redundant. Compare current kit and both advisor bundles.
    if (kit.length && !kits.slice(-2).includes(kit)) continue;
    const xp = Object.fromEntries(Object.entries(snapshot.xp).flatMap(([id, x]) => x.known ? [[id, x.value]] : []));
    for (const skill of ['attack', 'strength', 'defence']) {
      const target = fightTrainingTarget(step, stats, worn, skill, xp);
      if (!target) continue;
      const trained = trainedCombatStats(stats, skill, target.level, xp);
      const ready = forecast(step, trained, worn, kit, `Train ${skill} to ${target.level}${kit.length ? `, then ${label}` : ''}`, target);
      if (ready) result.push(ready);
    }
  }
  // Relevant wearable unlocks: train only the skill the existing advisor says is missing, then re-evaluate that kit.
  for (const lock of picked.locked) {
    if (lock.missing.length !== 1 || lock.missing[0].kind !== 'skill') continue;
    const missing = lock.missing[0];
    if (!['attack', 'strength', 'defence'].includes(missing.skill)) continue;
    const target = { skill: missing.skill, level: missing.need };
    const raised = trainedCombatStats(stats, target.skill, target.level);
    const found = advice(raised).choices.find(a => a.item.id === lock.item.id);
    const upgraded = found && eligible(found);
    if (!upgraded || (ironman !== false && upgraded.source.kind === 'ge')) continue;
    const ready = forecast(step, raised, wearing(gear, [upgraded]), [upgraded], `Train ${target.skill} to ${target.level}, then ${lock.item.name}`, target);
    if (ready) result.push(ready);
  }
  return result;
}
