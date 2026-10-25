// How many arrows a Ranged goal uses, for this player's bow, arrows and armour against the chosen opponent (T11).
//
// OSRS Wiki, "Damage per second/Ranged": effective level = Ranged + style (Accurate 3, Rapid and Longrange 0) + 8; max hit =
// floor(0.5 + effective × (ranged strength + 64) / 640); attack roll = effective × (ranged attack + 64); the opponent's roll =
// (Defence + 9) × (its standard ranged defence + 64) — arrows roll against "standard" (OSRS Wiki, Ranged). Prayers and boosts are left out:
// the count errs towards more arrows.
// From those, level by level: 4 Ranged XP per point of damage, so the damage the goal needs is exact; the shots per kill come from the same
// recursion as the melee estimate (combatEstimate.attacksToKill). One shot in five destroys its arrow (OSRS Wiki, Arrows); the others drop under
// the target and are lost only when left there.
// It never guesses: a bow or arrow without data, or an opponent without a ranged defence — no count.

import rangedGearJson from '../data/rangedGear.json';
import { attacksToKill, foeVariants, spread, type CombatFoe, type Range } from './combatEstimate';
import { rangedNeeds } from './rangedLoadout';
import type { PlayerState } from './playerState';
import type { TrainingMethod } from './trainingRouter';
import { gearData } from '../services/gearAdvisor';
import { nameKey } from './checklist';
import { levelForXp, xpForLevel } from './xp';

export interface RangedGearItem { name: string; slot: string; rangedAttack: number; rangedStrength: number; speed?: number }
export const RANGED_GEAR = (rangedGearJson as { items: RangedGearItem[] }).items;

export type RangedStyle = 'accurate' | 'rapid' | 'longrange';
const STYLE_BONUS: Record<RangedStyle, number> = { accurate: 3, rapid: 0, longrange: 0 };
/** The share of shots that destroy their arrow (OSRS Wiki, Arrows: 20% without an Ava's device). */
export const ARROW_BREAK = 0.2;
const XP_PER_DAMAGE = 4;
/** The model's margin on top of the luck of the rolls: who is attacked, overkill on a shared target, misclicks. */
const MARGIN = 0.15;

export interface AmmoInput {
  xp: number;
  goalLevel: number;
  bow: string;
  arrow: string;
  /** Worn items other than the bow and the arrows; their ranged attack bonus counts. */
  worn: string[];
  foe: CombatFoe;
  style?: RangedStyle;
}

export interface AmmoEstimate {
  shots: Range;
  /** Arrows destroyed when the rest are picked up between kills. */
  lostPickingUp: Range;
  kills: number;
  /** Worn items with no known ranged bonus: left out of the accuracy. */
  notCounted: string[];
}

const ranged = (name: string) => RANGED_GEAR.find((i) => nameKey(i.name) === nameKey(name));

/** A worn item's ranged attack bonus: the ranged table, else the melee gear's own ranged column; null when neither knows it. */
function rangedAttackOf(name: string): number | null {
  const r = ranged(name);
  if (r) return r.rangedAttack;
  const g = gearData.items.find((i) => nameKey(i.name) === nameKey(name));
  return g ? g.attack.ranged : null;
}

export interface RangedHit {
  maxHit: number;
  chance: number;
  /** Ticks between shots in the style used (rapid is a tick faster). */
  speedTicks: number;
  /** Worn items with no known ranged bonus: left out of the accuracy. */
  notCounted: string[];
}

/**
 * One shot at this Ranged level with this bow, arrows and worn items against the opponent: the max hit, the hit chance and the ticks between shots.
 * null - a bow or arrow without data, or an opponent without a ranged defence.
 */
export function rangedHit(level: number, bowName: string, arrowName: string, worn: readonly string[], foe: CombatFoe, styleName: RangedStyle = 'rapid'): RangedHit | null {
  const bow = ranged(bowName);
  const arrow = ranged(arrowName);
  const rdef = foe.defence.ranged;
  if (!bow || !arrow || rdef === undefined) return null;
  const notCounted: string[] = [];
  let armour = 0;
  for (const w of worn) {
    const b = rangedAttackOf(w);
    if (b === null) notCounted.push(w);
    else armour += b;
  }
  const effective = level + STYLE_BONUS[styleName] + 8;
  const maxHit = Math.floor(0.5 + (effective * (bow.rangedStrength + arrow.rangedStrength + 64)) / 640);
  const chance = hitChanceOf(effective * (bow.rangedAttack + arrow.rangedAttack + armour + 64), (foe.defenceLevel + 9) * (rdef + 64));
  // OSRS Wiki, Ranged: the rapid style shoots one tick faster.
  const speedTicks = Math.max(1, (bow.speed ?? 4) - (styleName === 'rapid' ? 1 : 0));
  return { maxHit, chance, speedTicks, notCounted };
}

export function arrowsForGoal(inp: AmmoInput): AmmoEstimate | null {
  if (!rangedHit(1, inp.bow, inp.arrow, inp.worn, inp.foe, inp.style) || inp.foe.hitpoints <= 0) return null;
  const goalXp = xpForLevel(inp.goalLevel);
  if (inp.xp >= goalXp) return { shots: { low: 0, mid: 0, high: 0 }, lostPickingUp: { low: 0, mid: 0, high: 0 }, kills: 0, notCounted: [] };
  const hp = inp.foe.hitpoints;
  let mean = 0;
  let variance = 0;
  let kills = 0;
  let notCounted: string[] = [];
  for (let xp = inp.xp; xp < goalXp;) {
    const level = levelForXp(xp);
    const until = Math.min(goalXp, xpForLevel(level + 1));
    const hit = rangedHit(level, inp.bow, inp.arrow, inp.worn, inp.foe, inp.style)!;
    notCounted = hit.notCounted;
    const per = attacksToKill(hp, hit.maxHit, hit.chance);
    if (!Number.isFinite(per.mean)) return null;
    const k = (until - xp) / XP_PER_DAMAGE / hp;
    kills += k;
    mean += k * per.mean;
    variance += k * per.variance;
    xp = until;
  }
  const shots = spread(mean, variance, MARGIN);
  const round = (r: Range): Range => ({ low: Math.round(r.low), mid: Math.round(r.mid), high: Math.round(r.high) });
  return {
    shots: round(shots),
    lostPickingUp: round({ low: shots.low * ARROW_BREAK, mid: shots.mid * ARROW_BREAK, high: shots.high * ARROW_BREAK }),
    kills: Math.round(kills), notCounted,
  };
}

/** OSRS accuracy (the same formula as combatEstimate.hitChance; kept local so a negative bonus sum cannot go below 0). */
function hitChanceOf(attRoll: number, defRoll: number): number {
  const a = Math.max(0, attRoll);
  return a > defRoll ? 1 - (defRoll + 2) / (2 * (a + 1)) : a / (2 * (defRoll + 1));
}

/** The opponent of a ranged method: its first NPC, the version the "where" text names ("the level 3 Seagulls"), else the first free one. */
export function methodFoe(m: Pick<TrainingMethod, 'npcNames' | 'where'>): CombatFoe | null {
  const variants = m.npcNames?.length ? foeVariants(m.npcNames[0]) : [];
  const level = /level (\d+)/i.exec(m.where ?? '')?.[1];
  return variants.find((f) => level !== undefined && f.combat === Number(level)) ?? variants[0] ?? null;
}

export interface GoalArrows extends AmmoEstimate { bow: string; arrow: string; goalLevel: number }

/**
 * The arrows for the whole goal along the advice's path (each leg against its own opponent), with the bow and arrows the starter kit picks
 * now (rangedLoadout.rangedNeeds). null when a leg is not a bow method or lacks data, or the Ranged XP is unknown.
 */
export function goalArrows(legs: readonly { method: TrainingMethod; fromLevel: number; toLevel: number }[], state: PlayerState, xp: number | null): GoalArrows | null {
  if (xp === null || !legs.length || legs.some((l) => l.method.kit !== 'f2p-bow')) return null;
  const kit = rangedNeeds(state).filter((n) => n.type === 'item');
  const [bow, arrow] = [kit[0]?.name, kit[1]?.name];
  if (!bow || !arrow) return null;
  const skip = new Set([nameKey(bow), nameKey(arrow)]);
  const worn = Object.values(state.equipment).filter((n) => !skip.has(nameKey(n)));
  const sum: AmmoEstimate = { shots: { low: 0, mid: 0, high: 0 }, lostPickingUp: { low: 0, mid: 0, high: 0 }, kills: 0, notCounted: [] };
  for (const leg of legs) {
    const foe = methodFoe(leg.method);
    const e = foe && arrowsForGoal({ xp: Math.max(xp, xpForLevel(leg.fromLevel)), goalLevel: leg.toLevel, bow, arrow, worn, foe });
    if (!e) return null;
    for (const k of ['low', 'mid', 'high'] as const) {
      sum.shots[k] += e.shots[k];
      sum.lostPickingUp[k] += e.lostPickingUp[k];
    }
    sum.kills += e.kills;
    for (const n of e.notCounted) if (!sum.notCounted.includes(n)) sum.notCounted.push(n);
  }
  return { ...sum, bow, arrow, goalLevel: legs[legs.length - 1].toLevel };
}
