// How long a combat training step takes and how much food it eats — for this player, against this exact opponent.
//
// The player's hit is gearAdvisor's (OSRS Wiki "Damage per second/Melee": max hit, accuracy, a successful 0 counted as 1) in the
// style the step asks for; the opponent's numbers are its own version's infobox (combatFoes.json: the level 12 and the level 27
// Minotaur are separate). From those:
//   - kills: 4 XP per point of damage, so a kill gives 4 x its hit points in the trained skill — exact, whatever the hit;
//   - attacks per kill: mean and spread over the hit distribution, by recursion over the hit points left;
//   - damage taken: the opponent swings every speedTicks while the fight lasts; its accuracy against the worn armour's
//     defence bonus, a hit rolls 0..max;
//   - level gains between, a Strength potion while its doses last, eating (3 ticks of attack delay), regeneration (1 hit point a
//     minute), finding the next target, walking to the bank between trips.
// Results are ranges: the luck of the rolls (about 90% of outcomes) plus a margin for what the model cannot see (who swings first,
// misclicks, a second aggressive giant). Measurements from the game, when there are enough, pull the estimate towards them.
// Food is counted by the healing it gives, so Lobsters at hand count as more Salmon. It never guesses missing data: no weapon
// data, no levels — no estimate.

import combatFoesJson from '../data/combatFoes.json';
import { equippedBySlot, gearData, meleeAs, SLOTS, type TrainStyle } from '../services/gearAdvisor';
import type { GearState } from '../services/runeliteBridge';
import type { GearData, GearPiece, PacingSkill, Step } from '../types';
import { FOODS } from './foodAdvice';
import { levelForXp, xpForLevel } from './xp';

export interface CombatFoe {
  name: string;
  version?: string;
  combat: number;
  members: boolean;
  hitpoints: number;
  attackLevel: number;
  strengthLevel: number;
  defenceLevel: number;
  magicLevel: number;
  attackBonus: number;
  defence: { stab: number; slash: number; crush: number; magic: number };
  attackStyle: string;
  maxHit: number;
  speedTicks: number;
  aggressive: boolean;
}

export const COMBAT_FOES = (combatFoesJson as { foes: CombatFoe[] }).foes;
export const COMBAT_FOES_DATE = (combatFoesJson as { generatedAt: string }).generatedAt;

/** The versions of an opponent the training can be done on, members-only ones left out (the route is free to play). */
export function foeVariants(name: string): CombatFoe[] {
  return COMBAT_FOES.filter((f) => f.name === name && !f.members);
}

/** "Minotaur (level 12)"; one version — the name alone. */
export function foeLabel(f: CombatFoe): string {
  return foeVariants(f.name).length > 1 ? `${f.name} (level ${f.combat})` : f.name;
}

const TICK = 0.6;
type MeleeSkill = 'attack' | 'strength' | 'defence';
export const TRAIN_STYLE: Record<MeleeSkill, TrainStyle> = { attack: 'accurate', strength: 'aggressive', defence: 'defensive' };
const MELEE = new Set<PacingSkill>(['attack', 'strength', 'defence']);

// ---------------------------------------------------------------------------
// The rolls

/** OSRS accuracy: attack roll against defence roll (the same formula both ways). */
export function hitChance(attRoll: number, defRoll: number): number {
  return attRoll > defRoll ? 1 - (defRoll + 2) / (2 * (attRoll + 1)) : attRoll / (2 * (defRoll + 1));
}

/** The player's damage on a successful hit: 0..max with equal chance, a 0 counted as 1 (as gearAdvisor's average assumes). */
function playerHitDistribution(maxHit: number): number[] {
  if (maxHit <= 0) return [0, 1];
  const q = new Array<number>(maxHit + 1).fill(1 / (maxHit + 1));
  q[0] = 0;
  q[1] = 2 / (maxHit + 1);
  return q;
}

/** Attacks to kill an opponent with `hp` hit points: mean and variance. Infinity when nothing can hit. */
export function attacksToKill(hp: number, maxHit: number, chance: number): { mean: number; variance: number } {
  if (!(chance > 0)) return { mean: Infinity, variance: Infinity };
  const q = playerHitDistribution(maxHit);
  const mean = [0];
  const square = [0];
  for (let r = 1; r <= hp; r++) {
    // N_r = 1 + (a miss: N_r again | a hit for d: N_(r-d)); solved for N_r.
    let e = 0;
    let s = 0;
    for (let d = 1; d < q.length; d++) {
      const left = Math.max(0, r - d);
      e += q[d] * mean[left];
      s += q[d] * square[left];
    }
    const m = (1 + chance * e) / chance;
    const next = (1 - chance) * m + chance * e; // E[N'] where N_r = 1 + N'
    square[r] = (1 + 2 * next + chance * s) / chance;
    mean[r] = m;
  }
  return { mean: mean[hp], variance: Math.max(0, square[hp] - mean[hp] ** 2) };
}

/**
 * The chance that a kill takes exactly n attacks, n = 0, 1, 2… (cut where less than 1 in 100 000 is left). The same recursion as
 * attacksToKill, kept whole: the opponent's swings depend on the fight's length in a way the mean alone does not give.
 */
export function attackCounts(hp: number, maxHit: number, chance: number): number[] {
  if (!(chance > 0)) return [];
  const q = playerHitDistribution(maxHit);
  // left[r] — the chance the opponent has r hit points after the attacks so far.
  let left = new Array<number>(hp + 1).fill(0);
  left[hp] = 1;
  const out = [0];
  for (let n = 1, alive = 1; alive > 1e-5 && n < 5000; n++) {
    const next = new Array<number>(hp + 1).fill(0);
    for (let r = 1; r <= hp; r++) {
      if (!left[r]) continue;
      next[r] += left[r] * (1 - chance);
      for (let d = 1; d < q.length; d++) next[Math.max(0, r - d)] += left[r] * chance * q[d];
    }
    out.push(next[0]);
    next[0] = 0;
    left = next;
    alive = left.reduce((a, b) => a + b, 0);
  }
  return out;
}

/**
 * The opponent's swings in one fight: it answers a tick after the first attack and then every speedTicks while it lives; the kill lands
 * (n - 1) weapon intervals after the first attack, and a swing due on that tick does not come.
 */
export function swingsPerFight(counts: number[], weaponTicks: number, foeTicks: number): { mean: number; variance: number } {
  let m = 0;
  let s = 0;
  let total = 0;
  counts.forEach((pr, n) => {
    if (!pr) return;
    const k = (n - 1) * weaponTicks;
    const swings = k >= 2 ? Math.floor((k - 2) / foeTicks) + 1 : 0;
    m += pr * swings;
    s += pr * swings * swings;
    total += pr;
  });
  return { mean: m / total, variance: Math.max(0, s / total - (m / total) ** 2) };
}

/** One swing of the opponent: mean and second moment of its damage. Its hit rolls 0..max. */
export function swingDamage(chance: number, maxHit: number): { mean: number; square: number } {
  return { mean: (chance * maxHit) / 2, square: (chance * maxHit * (2 * maxHit + 1)) / 6 };
}

// ---------------------------------------------------------------------------
// The estimate

export type Basis = 'formula' | 'calibrated' | 'basic';
export interface Range { low: number; mid: number; high: number }

/** What the game measured on this opponent version: clean kills, the seconds between them, the damage taken (the plugin's CombatLog). */
export interface Observed { kills: number; seconds: number; damage?: number }

/** One opponent version's fights as the plugin reports them. */
export interface Fights { name: string; combat: number; kills: number; seconds: number; damage: number }

/** Measured kills that make an estimate "calibrated". */
export const CALIBRATED_KILLS = 10;

export interface EstimateInput {
  foe: CombatFoe;
  /** Real levels (not boosted); hitpoints is the level, the maximum health. */
  levels: { attack: number; strength: number; defence: number; hitpoints: number };
  /** XP now; absent — the start of the current level (the estimate is then a little long). */
  xp?: Partial<Record<MeleeSkill, number>>;
  /** The goals in the order they are trained: the step's pacing skill, then its `also` skills. */
  goals: { skill: MeleeSkill; exp: number }[];
  weapon: GearPiece | null;
  neck: GearPiece | null;
  /** Worn armour the gear data knows (helm, body, legs, shield). */
  armour: GearPiece[];
  /** Worn items the gear data does not know: their bonuses are counted as 0 and the estimate is "basic". */
  unknownPieces?: number;
  food: { name: string; heals: number };
  strengthDoses?: number;
  /** Health now; absent — full (the bridge does not send it). */
  currentHp?: number | null;
  /** Bag cells for food. Default 26: the weapon is worn, two for potions or loot. */
  foodSlots?: number;
  /** Minutes to the bank and back between trips. */
  tripMinutes?: [number, number];
  observed?: Observed | null;
}

export interface Phase {
  skill: MeleeSkill;
  style: TrainStyle;
  fromLevel: number;
  toLevel: number;
  kills: number;
  /** Seconds of fighting, mean. */
  seconds: number;
  /** Damage taken, mean. */
  damage: number;
}

export interface CombatEstimate {
  basis: Basis;
  foe: CombatFoe;
  phases: Phase[];
  kills: number;
  /** Fighting only, minutes. */
  combatMinutes: Range;
  /** With finding targets, eating and banking, minutes. */
  totalMinutes: Range;
  /** Damage taken over the whole remaining goal, net of regeneration. */
  damage: Range;
  /** Pieces of food over the remaining goal. */
  food: Range;
  foodSlots: number;
  /** Kills one bag of food lasts; Infinity — regeneration keeps up, no food needed. */
  killsPerTrip: number;
  /** Health a kill costs, net of the regeneration while it lasts (mean, never below 0): the game turns the bag's food into kills with it. */
  hpPerKill: number;
  /** Seconds a kill with finding the next target, mean. */
  secondsPerKill: number;
  trips: Range;
  /** Pieces to take on the next trip. */
  nextTrip: number;
  /** Pieces kept beyond the expected for bad luck: the plan is mid + reserve = high. */
  reserve: number;
  /** Assumptions made where data was missing, in words. */
  assumed: string[];
  /** Whole unused Strength doses after this estimate; a partly elapsed dose is conservatively not carried into a later bank visit. */
  strengthDosesLeft?: number;
}

/** Model margin on top of the luck of the rolls, by how much is known. */
const MARGIN: Record<Basis, number> = { formula: 0.15, calibrated: 0.08, basic: 0.35 };
/** About 90% of outcomes lie within this many standard deviations. */
const Z = 1.65;
/** Finding and reaching the next target, seconds a kill. */
const BETWEEN_KILLS: [number, number] = [2, 6];
const EAT_SECONDS = 3 * TICK;
/** Natural regeneration: 1 hit point a minute. */
const REGEN_PER_SECOND = 1 / 60;
/** Overheal and eating early waste part of each piece. */
const USABLE: [number, number] = [0.85, 1];
/** How fast the game measurements take over: at this many kills they weigh as much as the formulas. */
const CALIBRATION_KILLS = 30;

const strengthBoost = (level: number) => Math.floor(level / 10) + 3;

export function estimateCombat(inp: EstimateInput): CombatEstimate | null {
  const { foe } = inp;
  if (!inp.goals.length || foe.hitpoints <= 0) return null;
  const assumed: string[] = [];
  const lv = { ...inp.levels };
  const xp: Record<MeleeSkill, number> = {
    attack: inp.xp?.attack ?? xpForLevel(lv.attack),
    strength: inp.xp?.strength ?? xpForLevel(lv.strength),
    defence: inp.xp?.defence ?? xpForLevel(lv.defence),
  };
  if (!inp.xp) assumed.push('XP counted from the start of your current levels');

  // The opponent against the worn armour: its attack type is the defence bonus that counts.
  const type = (['stab', 'slash', 'crush', 'magic', 'ranged'] as const).find((t) => t === foe.attackStyle) ?? 'crush';
  const defenceBonus = [inp.weapon, inp.neck, ...inp.armour].reduce((sum, p) => sum + (p?.defence[type] ?? 0), 0);
  const foeRoll = (foe.attackLevel + 9) * (foe.attackBonus + 64);
  if (inp.unknownPieces) assumed.push(`${inp.unknownPieces} worn item${inp.unknownPieces > 1 ? 's' : ''} without data counted as no armour`);

  const xpPerKill = 4 * foe.hitpoints;
  // A Strength potion dose lasts `boost` minutes: it wears off a level a minute, so each boost from the full one down to +1 holds
  // for a minute (the max hit grows in steps, an average boost would hide them).
  const boost = strengthBoost(lv.strength);
  let potionSeconds = (inp.strengthDoses ?? 0) * boost * 60;
  const phases: Phase[] = [];
  let kills = 0;
  let fightMean = 0;
  let fightVar = 0;
  let damageMean = 0;
  let damageVar = 0;

  for (const goal of inp.goals) {
    const style = TRAIN_STYLE[goal.skill];
    const fromLevel = levelForXp(xp[goal.skill]);
    const phase: Phase = { skill: goal.skill, style, fromLevel, toLevel: fromLevel, kills: 0, seconds: 0, damage: 0 };
    let phaseFightVar = 0;
    let phaseDamageVar = 0;
    while (xp[goal.skill] < goal.exp) {
      const level = levelForXp(xp[goal.skill]);
      lv[goal.skill] = level;
      const segment = Math.min(goal.exp, level < 99 ? xpForLevel(level + 1) : goal.exp) - xp[goal.skill];
      let segmentKills = segment / xpPerKill;
      // With a potion first while doses last, then without.
      const runs: { kills: number; boost: number }[] = [];
      if (potionSeconds > 0) {
        const rates = Array.from({ length: boost }, (_, i) => {
          const hit = meleeAs({ attack: lv.attack, strength: lv.strength + i + 1, defence: lv.defence }, inp.weapon, inp.neck, style, foe);
          return 1 / (attacksToKill(foe.hitpoints, hit.maxHit, hit.hitChance).mean * hit.speed); // kills a second at +i+1
        });
        const total = rates.reduce((a, b) => a + b, 0);
        const covered = Math.min(segmentKills, (potionSeconds * total) / boost);
        potionSeconds -= (covered * boost) / total;
        rates.forEach((r, i) => runs.push({ kills: (covered * r) / total, boost: i + 1 }));
        segmentKills -= covered;
      }
      runs.push({ kills: segmentKills, boost: 0 });
      for (const run of runs) {
        if (run.kills <= 0) continue;
        const hit = meleeAs({ attack: lv.attack, strength: lv.strength + run.boost, defence: lv.defence }, inp.weapon, inp.neck, style, foe);
        const a = attacksToKill(foe.hitpoints, hit.maxHit, hit.hitChance);
        if (!Number.isFinite(a.mean)) return null;
        const weaponTicks = hit.speed / TICK;
        const effDef = lv.defence + (style === 'defensive' ? 3 : 0) + 8;
        const swing = swingDamage(hitChance(foeRoll, effDef * (defenceBonus + 64)), foe.maxHit);
        const sw = swingsPerFight(attackCounts(foe.hitpoints, hit.maxHit, hit.hitChance), weaponTicks, foe.speedTicks);
        const swingsMean = sw.mean;
        const swingsVar = sw.variance;
        const perKillDamage = swingsMean * swing.mean;
        const perKillDamageVar = swingsMean * (swing.square - swing.mean ** 2) + swingsVar * swing.mean ** 2;
        phase.kills += run.kills;
        phase.seconds += run.kills * a.mean * hit.speed;
        phase.damage += run.kills * perKillDamage;
        phaseFightVar += run.kills * a.variance * hit.speed ** 2;
        phaseDamageVar += run.kills * perKillDamageVar;
      }
      xp[goal.skill] += segment;
      phase.toLevel = levelForXp(xp[goal.skill]);
    }
    if (phase.kills > 0) {
      // The last kill is whole: what it gives over the goal stays in this skill, the next phase starts from its own XP.
      const whole = Math.ceil(phase.kills - 1e-9);
      const f = whole / phase.kills;
      phase.kills = whole;
      phase.seconds *= f;
      phase.damage *= f;
      fightVar += phaseFightVar * f;
      damageVar += phaseDamageVar * f;
      phases.push(phase);
      kills += phase.kills;
      fightMean += phase.seconds;
      damageMean += phase.damage;
    }
    lv[goal.skill] = levelForXp(xp[goal.skill]);
  }

  if (kills === 0) return null;

  // Calibration: the measured seconds a kill and healing a kill pull the formulas their way, a little at a time.
  let basis: Basis = inp.unknownPieces ? 'basic' : 'formula';
  const obs = inp.observed;
  if (obs && obs.kills >= CALIBRATED_KILLS && obs.seconds > 0) {
    const w = obs.kills / (obs.kills + CALIBRATION_KILLS);
    const modelPerKill = fightMean / kills + (BETWEEN_KILLS[0] + BETWEEN_KILLS[1]) / 2;
    const ratio = (1 - w) + (w * (obs.seconds / obs.kills)) / modelPerKill;
    fightMean *= ratio;
    fightVar *= ratio ** 2;
    if (obs.damage !== undefined) {
      const dRatio = (1 - w) + (w * (obs.damage / obs.kills)) / Math.max(1e-6, damageMean / kills);
      damageMean *= dRatio;
      damageVar *= dRatio ** 2;
    }
    basis = 'calibrated';
  }
  const margin = MARGIN[basis] + (foe.aggressive ? 0.1 : 0);

  const fight = spread(fightMean, fightVar, margin);
  const regen = (fightMean + kills * avg(BETWEEN_KILLS)) * REGEN_PER_SECOND;
  const maxHp = inp.levels.hitpoints;
  if (inp.currentHp == null) assumed.push('you start at full health');
  const startHp = Math.min(maxHp, inp.currentHp ?? maxHp);
  // Health below two of its max hits is where you eat; what is above that at the start is free.
  const buffer = Math.max(0, startHp - 2 * foe.maxHit);
  const netMid = Math.max(0, damageMean - regen - buffer);
  const damage = spread(netMid, damageVar, margin);
  const heals = inp.food.heals;
  const food: Range = {
    low: Math.max(0, Math.floor(damage.low / (heals * USABLE[1]))),
    mid: Math.max(0, Math.round(damage.mid / (heals * avg(USABLE)))),
    high: Math.max(0, Math.ceil(damage.high / (heals * USABLE[0]))),
  };
  const eatSeconds = (n: number) => n * EAT_SECONDS;

  const foodSlots = Math.max(1, Math.min(28, inp.foodSlots ?? 26));
  // One bag lasts until its healing and the regeneration on the way are used up.
  const perKillNet = damageMean / kills - (fightMean / kills + avg(BETWEEN_KILLS)) * REGEN_PER_SECOND;
  const killsPerTrip = perKillNet > 0 ? (foodSlots * heals * avg(USABLE)) / perKillNet : Infinity;
  const tripsFor = (n: number) => (n <= 0 ? 0 : Math.ceil(n / foodSlots));
  const trips: Range = { low: Math.max(1, tripsFor(food.low)), mid: Math.max(1, tripsFor(food.mid)), high: Math.max(1, tripsFor(food.high)) };
  const trip = inp.tripMinutes ?? [3, 6];
  const minutes = (s: number) => s / 60;
  const combatMinutes = { low: minutes(fight.low), mid: minutes(fight.mid), high: minutes(fight.high) };
  const totalMinutes: Range = {
    low: minutes(fight.low + kills * BETWEEN_KILLS[0] + eatSeconds(food.low)) + (trips.low - 1) * trip[0],
    mid: minutes(fight.mid + kills * avg(BETWEEN_KILLS) + eatSeconds(food.mid)) + (trips.mid - 1) * avg(trip),
    high: minutes(fight.high + kills * BETWEEN_KILLS[1] + eatSeconds(food.high)) + (trips.high - 1) * trip[1],
  };

  return {
    basis, foe, phases, kills, combatMinutes, totalMinutes, damage, food, foodSlots, killsPerTrip, trips,
    hpPerKill: Math.max(0, perKillNet), secondsPerKill: fightMean / kills + avg(BETWEEN_KILLS),
    nextTrip: Math.min(foodSlots, food.high), reserve: food.high - food.mid, assumed,
    strengthDosesLeft: Math.max(0, Math.floor(potionSeconds / (boost * 60))),
  };
}

const avg = (r: readonly [number, number]) => (r[0] + r[1]) / 2;

/** Mean with the luck of the rolls (Z standard deviations) and the model margin on both sides. */
export function spread(mean: number, variance: number, margin: number): Range {
  const sd = Math.sqrt(Math.max(0, variance));
  return { low: Math.max(0, mean * (1 - margin) - Z * sd), mid: mean, high: mean * (1 + margin) + Z * sd };
}

// ---------------------------------------------------------------------------
// From a step and the game

/** The step's melee goals in training order, with the XP each ends at. Non-melee pacing — none. */
export function stepGoals(step: Pick<Step, 'pacing'>): { skill: MeleeSkill; exp: number }[] {
  const p = step.pacing;
  if (!p || !MELEE.has(p.skill)) return [];
  const out: { skill: MeleeSkill; exp: number }[] = [{ skill: p.skill as MeleeSkill, exp: p.targetExp }];
  for (const s of p.also ?? []) {
    const g = p.goals?.[s];
    if (MELEE.has(s) && g) out.push({ skill: s as MeleeSkill, exp: g.exp });
  }
  return out;
}

/** Healing of one piece by its name; unknown food — null. */
export function healsOf(name: string): number | null {
  return FOODS.find((f) => f.name.toLowerCase() === name.toLowerCase())?.heals ?? null;
}

export interface StepEstimateContext {
  stats: Partial<Record<string, number>> | null;
  xp?: Partial<Record<string, number>> | null;
  gear: GearState | null;
  strengthDoses?: number;
  foodSlots?: number;
  /** The fights the plugin recorded on this step, per opponent version; each version is calibrated with its own. */
  fights?: Fights[] | null;
  /**
   * A step later on the route: the XP the earlier steps will have reached (never below the real XP) and the weapon the step asks for. The current
   * step leaves both out: its estimate is from the game as it is.
   */
  assume?: { xp?: Partial<Record<MeleeSkill, number>>; weapon?: GearPiece | null } | null;
  data?: GearData;
}

/** The recorded fights of one opponent version, as an observation. */
export function observedFor(foe: CombatFoe, fights: Fights[] | null | undefined): Observed | null {
  const f = fights?.find((x) => x.name === foe.name && x.combat === foe.combat);
  return f ? { kills: f.kills, seconds: f.seconds, damage: f.damage } : null;
}

/**
 * Estimates for every free version of the step's first opponent (the level 12 and level 27 Minotaur side by side), with the step's
 * required food. Empty — no melee goal, no opponent data, no levels or no gear from the game, or a weapon the gear data does not know:
 * then there is nothing honest to say.
 */
export function estimateStep(step: Pick<Step, 'pacing' | 'foes' | 'itemsRequired'>, ctx: StepEstimateContext): CombatEstimate[] {
  const goals = stepGoals(step);
  const name = step.foes?.[0];
  const st = ctx.stats;
  if (!goals.length || !name || !st || !ctx.gear?.equipment) return [];
  const need = (k: string) => (typeof st[k] === 'number' && (st[k] as number) >= 1 ? (st[k] as number) : null);
  const levels = { attack: need('attack'), strength: need('strength'), defence: need('defence'), hitpoints: need('hitpoints') };
  if (Object.values(levels).some((v) => v === null)) return [];
  const later = ctx.assume?.xp ?? {};
  const foodItem = (step.itemsRequired ?? []).find((i) => typeof i.heals === 'number');
  const food = foodItem ? { name: foodItem.nameEn, heals: foodItem.heals! } : null;
  if (!food) return [];
  const equipped = equippedBySlot(ctx.gear, ctx.data ?? gearData);
  if (equipped.weapon && !equipped.weapon.piece) return [];
  const armour = (['head', 'body', 'legs', 'shield'] as const).map((s) => equipped[s]?.piece).filter((p): p is GearPiece => Boolean(p));
  const unknownPieces = SLOTS.filter((s) => s !== 'weapon' && equipped[s] && !equipped[s]!.piece).length;
  const xp = ctx.xp ?? null;
  const real = (k: MeleeSkill) => (xp && typeof xp[k] === 'number' ? (xp[k] as number) : undefined);
  const xpOf = (k: MeleeSkill) => {
    const r = real(k);
    return r === undefined ? undefined : Math.max(r, later[k] ?? 0);
  };
  const haveXp = xp && (['attack', 'strength', 'defence'] as const).every((k) => real(k) !== undefined);
  // The levels a later step starts from.
  for (const k of ['attack', 'strength', 'defence'] as const) {
    const x = xpOf(k) ?? later[k];
    if (x !== undefined) levels[k] = Math.max(levels[k]!, levelForXp(x));
  }
  const weapon = ctx.assume?.weapon !== undefined && ctx.assume.weapon !== null ? ctx.assume.weapon : equipped.weapon?.piece ?? null;
  return foeVariants(name).flatMap((foe) => {
    const e = estimateCombat({
      foe, levels: levels as EstimateInput['levels'], goals, food, armour, unknownPieces,
      ...(haveXp ? { xp: { attack: xpOf('attack'), strength: xpOf('strength'), defence: xpOf('defence') } } : {}),
      weapon, neck: equipped.neck?.piece ?? null,
      strengthDoses: ctx.strengthDoses, foodSlots: ctx.foodSlots, observed: observedFor(foe, ctx.fights),
    });
    return e ? [e] : [];
  });
}
