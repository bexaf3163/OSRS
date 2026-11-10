import type { GearPiece, PlayerStats, Step } from '../../../types';
import type { GearState } from '../../../services/runeliteBridge';
import { adviseGear, type GearAction } from '../../combat/gearAdvisor';
import { gearMarketPrices } from '../../combat/gearAdvice';
import { estimateStepFights, stepFightNames, stepFightFoes } from '../../combat/fightEstimate';
import type { FightEstimate } from '../../combat/fightEstimate';
import { EAT_SECONDS } from '../../combat/combatEstimate';
import { gearById, gearPieceByName } from '../../items/gearRegistry';
import { safetyRulesOf } from '../../prep/safety';
import { FIGHT_MECHANICS } from '../../../data/fightMechanics';
import { stepFood } from '../../player/foodStock';
import { evenlyTrainedStats, fightTrainingTarget, safeTrainingLevel, trainedCombatStats } from '../../readiness/stepAssessment';
import type { PriceView } from '../../market/quotes';
import type { PlanningSnapshot, Minutes } from '../contracts';

export interface EncounterSetup {
  label: string;
  step: Step;
  gear: GearState;
  stats: PlayerStats;
  kit: readonly GearAction[];
  /** Skills to raise first, in training order; empty when the setup needs no training. */
  targets: readonly { skill: string; level: number }[];
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
function wearing(gear: GearState, pieces: readonly GearPiece[]): GearState {
  let equipment = [...gear.equipment!];
  for (const item of pieces) {
    const slot = item.slot === 'neck' ? 'amulet' : item.slot;
    equipment = equipment.filter(piece => piece.slot !== slot && !(item.twoHanded && piece.slot === 'shield'));
    equipment.push({ id: item.id, name: item.name, slot, count: 1 });
  }
  return { ...gear, equipment };
}

/** Assemble the shared model's exact combat-food need and selected kit; quest hand-ins remain untouched. */
function forecast(step: Step, stats: PlayerStats, gear: GearState, kit: readonly GearAction[], label: string,
  targets: EncounterSetup['targets'] = [], protection: readonly GearPiece[] = [], assessed?: FightEstimate[]): EncounterSetup | null {
  if (gear.equipment?.some(p => p.slot === 'shield') && gear.equipment.some(p => p.slot === 'weapon' && gearById.get(p.id)?.twoHanded)) return null;
  if (safetyRulesOf(step).some(rule => rule.worn && !gear.equipment?.some(p => rule.names.includes(p.name)))) return null;
  const fights = assessed ?? estimateStepFights(step, stats, gear);
  if (!fights.length || fights.length !== stepFightNames(step).length || fights.some(f => f.unmodelled.length || f.cannot || f.worstHit >= stats.hitpoints)) return null;
  const food = Math.ceil(fights.reduce((sum, f) => sum + f.food.high, 0));
  const authoredFood = stepFood(step) ?? { nameEn: 'Trout', heals: 7, amount: 0, howToGet: '' };
  const worn = [...protection, ...kit.map(a => a.item)];
  const items = (step.itemsRequired ?? []).filter(item => !item.heals && !worn.some(piece => piece.name === item.nameEn));
  const others = items.filter(item => !item.equip).length;
  if (food > Math.min(26, 28 - others)) return null;
  const authored = (piece: GearPiece) => (step.itemsRequired ?? []).find(item => item.nameEn === piece.name)?.howToGet ?? '';
  const requirements = [ ...worn.map(piece => ({ nameEn: piece.name, wikiItemId: piece.id, amount: 1, equip: true, howToGet: authored(piece) })),
    ...items, ...(food ? [{ ...authoredFood, amount: food, totalAmount: food, inStep: false }] : []) ];
  // Eating delay is the existing combatEstimate model's 3 ticks per piece. Do not count food as free fight time.
  return { label, stats, gear, kit, targets, fight: encounterWork(fights),
    step: { ...step, itemsRequired: requirements, itemsRecommended: (step.itemsRecommended ?? []).filter(item => !item.heals) } };
}

/** Bounded alternatives INSIDE tactical preparation, not another objective planner. No fabricated kit, prices or monster stats. */
export function encounterSetups(step: Step, snapshot: PlanningSnapshot, prices: PriceView, ironman: boolean | null,
  options: { currentOnly?: boolean; keepDefenceOne?: boolean } = {}): EncounterSetup[] {
  const { stats, gear } = snapshot.combat ?? {};
  if (!snapshot.player.connected || !stats || !gear?.equipment || !stepFightNames(step).length) return [];
  // Before proposing any spend/training, require a supported observed baseline model (unsafe food quantity is allowed here).
  const estimates = estimateStepFights(step, stats, gear);
  if (estimates.length !== stepFightNames(step).length || estimates.some(f => f.unmodelled.length)) return [];
  // Protection the fight must be worn with (safety rules) is part of every setup: its slot is taken before any kit is compared.
  const guards = safetyRulesOf(step).filter(rule => rule.worn).flatMap(rule => gearPieceByName(rule.names[0]) ?? []);
  const protection = guards.filter(piece => !gear.equipment!.some(p => p.slot === piece.slot && safetyRulesOf(step).some(rule => rule.names.includes(p.name))));
  const base = wearing(gear, protection);
  // A fight done with its own weapon (fightMechanics.json) gains nothing from another one.
  const taken = new Set([...guards.map(piece => piece.slot), ...(stepFightFoes(step).some(foe => FIGHT_MECHANICS[foe.name]?.weapon) ? ['weapon'] : [])]);
  const free = (kit: GearAction[]) => kit.filter(a => !taken.has(a.item.slot) && !(a.item.twoHanded && taken.has('shield')));
  const current = forecast(step, stats, base, [], protection.length ? protection.map(piece => piece.name).join(' + ') : 'Current equipment', [], protection,
    protection.length ? undefined : estimates);
  if (options.currentOnly) return current ? [current] : [];
  const melee = ['attack', 'strength', 'defence'].filter(skill => !(options.keepDefenceOne && skill === 'defence'));
  const questsDone = new Set(Object.entries(snapshot.quests).filter(([, q]) => q.state === 'COMPLETED').map(([id]) => id));
  const advice = (levels: PlayerStats) => adviseGear({ levels, gear, owned: snapshot.player.owned, mode: snapshot.scope.mode,
    geQuotes: gearMarketPrices(prices), foes: stepFightFoes(step), questsDone });
  const picked = advice(stats);
  const eligible = (a: GearAction): GearAction | null => {
    if (a.source.kind !== 'ge' || ironman === false) return a;
    const source = a.alternatives.find(s => s.kind === 'shop');
    return source?.kind === 'shop' ? { ...a, source, cost: source.price + (source.toll ?? 0) } : null;
  };
  const choices = free(picked.choices).flatMap(a => { const c = eligible(a); return c && (c.how === 'wear' || c.cost !== null) ? [c] : []; });
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
  const allowed = (rows: GearAction[]) => free(rows).flatMap(a => { const c = eligible(a); return c ? [c] : []; });
  const fullKit = (a: typeof picked) => allowed([...a.actions, ...a.armour, ...a.goals].filter((row, i, all) => !all.slice(i + 1).some(b => b.slot === row.slot)));
  kits.push(allowed([...picked.actions, ...picked.armour]), fullKit(picked));
  const xp = Object.fromEntries(Object.entries(snapshot.xp).flatMap(([id, x]) => x.known ? [[id, x.value]] : []));
  const names = (kit: readonly GearAction[]) => kit.map(a => a.item.name).join(' + ');
  const seen = new Set<string>(), result: EncounterSetup[] = current ? [current] : [];
  for (const kit of kits) {
    if (kit.some(a => a.source.kind === 'ge' && ironman !== false)) continue;
    const key = kit.map(a => a.item.id).sort().join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    const worn = wearing(base, kit.map(a => a.item)), label = kit.length ? names(kit) : 'Current equipment';
    if (kit.length) { const ready = forecast(step, stats, worn, kit, label, [], protection); if (ready) result.push(ready); }
    // Training on every individual armour permutation is redundant. Compare current kit and both advisor bundles.
    if (kit.length && !kits.slice(-2).includes(kit)) continue;
    for (const skill of melee) {
      const target = fightTrainingTarget(step, stats, worn, skill, xp);
      if (!target) continue;
      const trained = trainedCombatStats(stats, skill, target.level, xp);
      const ready = forecast(step, trained, worn, kit, `Train ${skill} to ${target.level}${kit.length ? `, then ${label}` : ''}`, [target], protection);
      if (ready) result.push(ready);
    }
  }
  // One skill alone can need an absurd level. The ordinary alternative raises the melee skills together, lowest first, in the
  // worn kit and in the kit those levels unlock (the advisor asked again at each searched level).
  if (!current && melee.length > 1) {
    const even = (level: number, worn: GearState, kit: readonly GearAction[]) => {
      const targets = melee.filter(skill => stats[skill] < level).sort((a, b) => stats[a] - stats[b]).map(skill => ({ skill, level }));
      return targets.length > 1 ? forecast(step, evenlyTrainedStats(stats, melee, level, xp), worn, kit,
        `Train ${targets.map(t => t.skill).join(', ')} to ${level}${kit.length ? `, then ${names(kit)}` : ''}`, targets, protection) : null;
    };
    const plain = safeTrainingLevel(step, stats, base, melee, xp);
    const unlocked = (level: number) => {
      const kit = fullKit(advice(evenlyTrainedStats(stats, melee, level, xp)));
      return kit.length && !kit.some(a => a.source.kind === 'ge' && ironman !== false) ? even(level, wearing(base, kit.map(a => a.item)), kit) : null;
    };
    let low = Math.min(...melee.map(skill => stats[skill])) + 1, high = plain ?? 99, found = unlocked(high);
    while (found && low < high) {
      const mid = Math.floor((low + high) / 2), row = unlocked(mid);
      if (row) { high = mid; found = row; } else low = mid + 1;
    }
    for (const row of [plain ? even(plain, base, []) : null, found]) if (row) result.push(row);
  }
  // Relevant wearable unlocks: train only the skill the existing advisor says is missing, then re-evaluate that kit.
  for (const lock of picked.locked) {
    if (lock.missing.length !== 1 || lock.missing[0].kind !== 'skill') continue;
    const missing = lock.missing[0];
    if (!melee.includes(missing.skill)) continue;
    const target = { skill: missing.skill, level: missing.need };
    const raised = trainedCombatStats(stats, target.skill, target.level);
    const found = advice(raised).choices.find(a => a.item.id === lock.item.id);
    const upgraded = found && eligible(found);
    if (!upgraded || (ironman !== false && upgraded.source.kind === 'ge')) continue;
    if (!free([upgraded]).length) continue;
    const ready = forecast(step, raised, wearing(base, [upgraded.item]), [upgraded], `Train ${target.skill} to ${target.level}, then ${lock.item.name}`, [target], protection);
    if (ready) result.push(ready);
  }
  return result;
}
