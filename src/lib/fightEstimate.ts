// One quest fight with the kit the player has now (combat estimate group 7, 2.63.0): Count Draynor, Ithoi, Brutus, Melzar, the Lesser demon, Elvarg,
// the Black Knights, the Ancient Guardian. The same rolls as the training estimate (combatEstimate.ts): the player's hits against the opponent's
// defence, its swings while the fight lasts against the worn armour. One fight, at the current levels, with the safest melee style (the least
// damage taken). It is an estimate: the range holds about 9 outcomes in 10, and no kit guarantees survival.

import { equippedBySlot, gearData, meleeAs, SLOTS, type TrainStyle } from '../services/gearAdvisor';
import type { GearState } from '../services/runeliteBridge';
import type { GearPiece, Step } from '../types';
import { attackCounts, attacksToKill, COMBAT_FOES, foeLabel, hitChance, spread, swingDamage, swingsPerFight, type CombatFoe, type Range } from './combatEstimate';
import { THREATS } from './foodAdvice';

const TICK = 0.6;
const STYLES: TrainStyle[] = ['accurate', 'aggressive', 'defensive'];
const STYLE_WORD: Record<TrainStyle, string> = { accurate: 'Accurate', aggressive: 'Aggressive', defensive: 'Defensive' };
/** Overheal and eating early waste part of each piece (as the training estimate). */
const USABLE: [number, number] = [0.85, 1];

export interface FightEstimate {
  foe: CombatFoe;
  style: TrainStyle;
  /** The fight alone, seconds. */
  seconds: Range;
  /** Damage taken over the fight, before eating. */
  damage: Range;
  /** Pieces of the given food: the damage beyond the health above two of its max hits. */
  food: Range;
  foodName: string;
  /** The player's chance to hit and max hit with that style. */
  hitChance: number;
  maxHit: number;
  /** Its chance to hit the player. */
  foeHitChance: number;
  assumed: string[];
  /** Its other attacks from the wiki (a special, dragonfire): said, not modelled. */
  extra: string[];
}

export interface FightInput {
  foe: CombatFoe;
  levels: { attack: number; strength: number; defence: number; hitpoints: number; magic?: number };
  weapon: GearPiece | null;
  neck: GearPiece | null;
  armour: GearPiece[];
  unknownPieces?: number;
  food: { name: string; heals: number };
  currentHp?: number | null;
}

/** Its chance to hit the player: melee against the worn armour's bonus of its type; magic against the player's magic defence. */
function foeChance(foe: CombatFoe, inp: FightInput, style: TrainStyle): number {
  const gear = [inp.weapon, inp.neck, ...inp.armour];
  const effDef = inp.levels.defence + (style === 'defensive' ? 3 : 0) + 8;
  if (foe.attackStyle === 'magic') {
    // OSRS: the defender's magic level counts 70%, its defence 30%. Its own magic attack bonus is not in the table: counted as 0.
    const magic = inp.levels.magic ?? 1;
    const eff = Math.floor(magic * 0.7) + Math.floor(effDef * 0.3);
    const bonus = gear.reduce((s, p) => s + (p?.defence.magic ?? 0), 0);
    return hitChance((foe.magicLevel + 9) * 64, eff * (bonus + 64));
  }
  const type = (['stab', 'slash', 'crush', 'ranged'] as const).find((t) => t === foe.attackStyle) ?? 'crush';
  const bonus = gear.reduce((s, p) => s + (p?.defence[type] ?? 0), 0);
  return hitChance((foe.attackLevel + 9) * (foe.attackBonus + 64), effDef * (bonus + 64));
}

export function estimateFight(inp: FightInput): FightEstimate | null {
  const { foe } = inp;
  if (foe.hitpoints <= 0) return null;
  const assumed: string[] = [];
  if (foe.attackStyle === 'magic') assumed.push(`${foeLabel(foe)} attacks with magic: its magic attack bonus counted as 0${inp.levels.magic === undefined ? ', your Magic as 1' : ''}`);
  if (inp.unknownPieces) assumed.push(`${inp.unknownPieces} worn item${inp.unknownPieces > 1 ? 's' : ''} without data counted as no armour`);
  if (inp.currentHp == null) assumed.push('you start at full health');
  let best: { style: TrainStyle; secMean: number; secVar: number; dmgMean: number; dmgVar: number; chance: number; max: number; foeC: number } | null = null;
  for (const style of STYLES) {
    const hit = meleeAs({ attack: inp.levels.attack, strength: inp.levels.strength, defence: inp.levels.defence }, inp.weapon, inp.neck, style, foe);
    const a = attacksToKill(foe.hitpoints, hit.maxHit, hit.hitChance);
    if (!Number.isFinite(a.mean)) continue;
    const foeC = foeChance(foe, inp, style);
    const swing = swingDamage(foeC, foe.maxHit);
    const sw = swingsPerFight(attackCounts(foe.hitpoints, hit.maxHit, hit.hitChance), hit.speed / TICK, foe.speedTicks);
    const dmgMean = sw.mean * swing.mean;
    const dmgVar = sw.mean * (swing.square - swing.mean ** 2) + sw.variance * swing.mean ** 2;
    const c = { style, secMean: a.mean * hit.speed, secVar: a.variance * hit.speed ** 2, dmgMean, dmgVar, chance: hit.hitChance, max: hit.maxHit, foeC };
    if (!best || c.dmgMean < best.dmgMean - 1e-9 || (Math.abs(c.dmgMean - best.dmgMean) <= 1e-9 && c.secMean < best.secMean)) best = c;
  }
  if (!best) return null;
  const margin = (inp.unknownPieces ? 0.35 : 0.15) + (foe.aggressive ? 0.1 : 0) + (foe.attackStyle === 'magic' ? 0.15 : 0);
  const seconds = spread(best.secMean, best.secVar, margin);
  const damage = spread(best.dmgMean, best.dmgVar, margin);
  const startHp = Math.min(inp.levels.hitpoints, inp.currentHp ?? inp.levels.hitpoints);
  const buffer = Math.max(0, startHp - 2 * foe.maxHit);
  const net = (d: number) => Math.max(0, d - buffer);
  const heals = inp.food.heals;
  const food: Range = {
    low: Math.floor(net(damage.low) / (heals * USABLE[1])),
    mid: Math.round(net(damage.mid) / (heals * ((USABLE[0] + USABLE[1]) / 2))),
    high: Math.ceil(net(damage.high) / (heals * USABLE[0])),
  };
  const threat = Object.values(THREATS).find((t) => t.page === foe.name);
  const extra = (threat?.hits ?? []).filter((h) => h.n > foe.maxHit).map((h) => `${h.n}${h.label ? ` (${h.label})` : ''}`);
  if (extra.length) assumed.push(`its other attacks (${extra.join(', ')}) are not counted: the food is a lower bound`);
  return {
    foe, style: best.style, seconds, damage, food, foodName: inp.food.name, hitChance: best.chance, maxHit: best.max, foeHitChance: best.foeC,
    assumed: [...new Set(assumed)], extra,
  };
}

/**
 * Fights the route does not do in melee: a melee estimate would only mislead. The Lesser demon in Melzar's Maze is hit with Water Strike from the
 * safespot (S5-03); the Ancient Guardian is beaten by mining the four pillars (S3-04).
 */
export const OTHER_METHOD: Readonly<Record<string, string>> = {
  'Lesser demon': 'the route fights it from the safespot with Water Strike: it cannot reach you there',
  'Ancient Guardian': 'the route beats it by mining the four Structural pillars; it keeps attacking while you mine, so eat before each one',
};

/** The quest fights of a step: its foes and its threats, not the ones the route does another way. */
export function stepFightNames(step: Pick<Step, 'foes' | 'threats' | 'pacing'>): string[] {
  if (step.pacing) return [];
  return [...new Set([...(step.foes ?? []), ...(step.threats ?? [])])].filter((n) => !OTHER_METHOD[n]);
}

/** The quest fights of a step the table knows: the free version where there is one, else the members one (a members quest: Temple Guardian, Ghast). */
export function stepFightFoes(step: Pick<Step, 'foes' | 'threats' | 'pacing'>): CombatFoe[] {
  return stepFightNames(step).flatMap((n) => {
    const all = COMBAT_FOES.filter((f) => f.name === n);
    const free = all.filter((f) => !f.members);
    return (free.length ? free : all).slice(0, 1);
  });
}

/** The estimate for each quest fight of the step with the player's worn gear and levels; empty when the game has not given them. */
export function estimateStepFights(
  step: Pick<Step, 'foes' | 'threats' | 'pacing' | 'itemsRequired'>, stats: Partial<Record<string, number>> | null, gear: GearState | null,
  food?: { name: string; heals: number },
): FightEstimate[] {
  const foes = stepFightFoes(step);
  if (!foes.length || !stats || !gear?.equipment) return [];
  const need = (k: string) => (typeof stats[k] === 'number' && (stats[k] as number) >= 1 ? (stats[k] as number) : null);
  const lv = { attack: need('attack'), strength: need('strength'), defence: need('defence'), hitpoints: need('hitpoints') };
  if (Object.values(lv).some((v) => v === null)) return [];
  const eq = equippedBySlot(gear, gearData);
  if (eq.weapon && !eq.weapon.piece) return [];
  const armour = (['head', 'body', 'legs', 'shield'] as const).map((s) => eq[s]?.piece).filter((p): p is GearPiece => Boolean(p));
  const unknownPieces = SLOTS.filter((s) => s !== 'weapon' && eq[s] && !eq[s]!.piece).length;
  const stepFood = (step.itemsRequired ?? []).find((i) => typeof i.heals === 'number');
  const f = food ?? (stepFood ? { name: stepFood.nameEn, heals: stepFood.heals! } : { name: 'Trout', heals: 7 });
  const magic = need('magic');
  return foes.flatMap((foe) => {
    const e = estimateFight({
      foe, levels: { ...(lv as FightInput['levels']), ...(magic !== null ? { magic } : {}) }, weapon: eq.weapon?.piece ?? null, neck: eq.neck?.piece ?? null,
      armour, unknownPieces, food: f,
    });
    return e ? [e] : [];
  });
}

const sec = (s: number) => (s < 90 ? `${Math.round(s)} s` : `${Math.round(s / 60)} min`);

/** "Count Draynor: about 40 s on Aggressive; you take about 5 damage (up to 12); bring 2 Trout or more." */
export function fightLine(e: FightEstimate): string {
  const dmg = `you take about ${Math.round(e.damage.mid)} damage (up to ${Math.ceil(e.damage.high)})`;
  const food = e.food.high <= 0 ? 'your health covers it; carry a few pieces anyway' : `bring ${e.food.high} ${e.foodName} or more`;
  return `${foeLabel(e.foe)}: about ${sec(e.seconds.mid)} on ${STYLE_WORD[e.style]}; ${dmg}; ${food}.`;
}
