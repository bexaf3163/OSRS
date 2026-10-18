// The bridge between the funding evaluator and the combat model: one kill of a monster, for this player's levels and worn gear, in seconds and in food.
// There is no second estimator here. estimateStep() (combatEstimate.ts) does the arithmetic - the same one the route's food plan uses - and this file only
// turns its answer into what the evaluator takes: seconds a kill (a range from the model's own margin) and the food a kill eats, in the cheapest food
// that fits the monster.
//
// The activity keeps the player's style: the skill the open combat steps train (accurate for Attack, aggressive for Strength, defensive for Defence). When
// no step asks for one the estimate assumes Strength training and says so. A detour for money does not change what the player trains.

import type { Step } from '../../types';
import { estimateStep, healsOf, observedFor, type CombatEstimate, type Fights, type StepEstimateContext } from '../combatEstimate';
import { chooseVariant } from '../combatPlan';
import type { GearState } from '../../services/runeliteBridge';
import type { Personalised } from './evaluate';
import type { PriceView } from './quotes';
import type { FundingMethod } from './types';

export interface CombatLive {
  stats: Partial<Record<string, number>> | null;
  xp?: Partial<Record<string, number>> | null;
  gear: GearState | null;
  strengthDoses?: number;
  fights?: Fights[] | null;
  /** The melee skill the player is training now (from the open combat steps); absent - Strength is assumed. */
  train?: 'attack' | 'strength' | 'defence' | null;
}

/** The model's own margin by how much it knows (combatEstimate.ts), used as the spread around the mean kill time. */
const MARGIN: Record<CombatEstimate['basis'], number> = { formula: 0.15, calibrated: 0.08, basic: 0.35 };
/** Kills the estimate is taken over: long enough for the food to average out, short enough that the level gains in it do not blur the figure. */
const SAMPLE_KILLS = 60;

export interface FoodChoice { name: string; heals: number; price: number | null }

/** The cheapest food per point of health among those the method allows; an unpriced food only when none has a price. */
export function cheapestFood(names: readonly string[], prices: PriceView): FoodChoice | null {
  const foods = names.flatMap((n) => {
    const heals = healsOf(n);
    return heals === null ? [] : [{ name: n, heals, price: prices.buy(n)?.price ?? null }];
  });
  if (!foods.length) return null;
  const priced = foods.filter((f) => f.price !== null);
  if (!priced.length) return foods[0];
  return priced.sort((a, b) => a.price! / a.heals - b.price! / b.heals || b.heals - a.heals)[0];
}

export function combatPersonaliser(live: CombatLive, prices: PriceView): (m: FundingMethod) => Personalised | null {
  return (m) => {
    if (!m.combat || !live.stats || !live.gear) return null;
    const skill = live.train ?? 'strength';
    const food = cheapestFood(m.combat.food, prices) ?? { name: 'Salmon', heals: healsOf('Salmon') ?? 9, price: null };
    const xpNow = live.xp?.[skill];
    // A goal of SAMPLE_KILLS kills' worth of XP in the trained skill: 4 XP per point of damage, so 4 x the monster's hitpoints a kill.
    const probeFoe = m.combat.foe;
    const step = {
      pacing: { skill, targetLevel: 99, targetExp: (xpNow ?? 0) + 1, actionName: 'kill', expPerAction: 1 },
      foes: [probeFoe],
      itemsRequired: [{ nameEn: food.name, amount: 1, heals: food.heals, howToGet: '' }],
    } as unknown as Pick<Step, 'pacing' | 'foes' | 'itemsRequired'>;
    const ctx: StepEstimateContext = { stats: live.stats, xp: live.xp ?? null, gear: live.gear, strengthDoses: live.strengthDoses, fights: live.fights };
    // The goal must be large enough for SAMPLE_KILLS kills: ask for it through the first free version's hitpoints.
    const first = estimateStep(step, ctx)[0];
    const hp = first?.foe.hitpoints ?? 0;
    if (!first || hp <= 0) return null;
    const sized = { ...step, pacing: { ...step.pacing!, targetExp: (xpNow ?? 0) + 4 * hp * SAMPLE_KILLS } } as typeof step;
    const versions = m.combat.versions;
    const estimates = estimateStep(sized, ctx).filter((e) => !versions?.length || versions.includes(e.foe.version ?? ''));
    const e = chooseVariant(estimates, live.fights);
    if (!e || e.kills <= 0) return null;
    const margin = MARGIN[e.basis];
    const seconds = e.secondsPerKill;
    const piecesPerKill = e.food.mid / e.kills;
    const observed = observedFor(e.foe, live.fights);
    const notes = [
      `Kill time and food from the combat model for ${e.foe.name}${e.foe.version && versions && versions.length > 1 ? ` (level ${e.foe.combat})` : ''}, training ${skill}`,
      ...(live.train ? [] : ['No combat step is open, so Strength training is assumed']),
      ...e.assumed,
    ];
    return {
      secondsPerUnit: { fast: seconds * (1 - margin), typical: seconds, slow: seconds * (1 + margin) },
      extraInputs: piecesPerKill >= 0.005 ? [{ item: { id: 0, name: food.name }, qty: piecesPerKill, note: `${food.name} heals ${food.heals}` }] : [],
      confidence: e.basis === 'basic' ? 'LOW' : e.basis === 'calibrated' || observed ? 'HIGH' : 'MEDIUM',
      basis: e.basis === 'calibrated' ? 'measured kills and the combat model' : 'the combat model',
      notes,
      ...(piecesPerKill > 3 ? { caution: `Food-intensive: about ${piecesPerKill.toFixed(1)} ${food.name} a kill` } : {}),
    };
  };
}

