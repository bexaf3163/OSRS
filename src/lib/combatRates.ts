// What a combat training method gives this player per hour, from the same combat model the fight plans use (2.76, T10): one engine for melee, Ranged
// and Magic, so the Skills page and the route's steps never disagree about where to train.
//   melee  - combatEstimate.estimateCombat for the next few levels: the worn weapon, amulet and armour, eating, the spot's bank trips and respawns;
//   Ranged - the bow and arrows the starter kit uses (rangedLoadout), rangedAmmo.rangedHit against the opponent's ranged defence, the rapid style's
//            speed, picking the arrows up between kills; the arrows broken (one in five) are the cost;
//   Magic  - the strike spell the player will cast (magicPlan.strikeRecipe): since the wiki's tier rule every strike hits as hard as the highest one the
//            level unlocks (spells.json maxHit), accuracy against the opponent's magic level and defence, base XP per cast plus 2 per point of damage;
//            the runes the staff does not cover are the cost.
// The spot's own terms (a boss's respawn, healing, bank trips) come from the spot registry (combatRoute/spots.ts), and so does its loot: the drop worth
// selling is banked when it pays for its time (lootValue.ts, the same rule as the fight plans), and its pickups and bank trips slow the XP down. It never
// guesses: an unknown level,
// unread worn items, a weapon or bow the data does not know, an opponent without data, or a fight that is not safe - no rate, and the wiki's stays.

import spellsJson from '../data/spells.json';
import { allSteps } from '../data';
import { attacksToKill, estimateCombat, foeVariants, hitChance, unsafe, xpPerKill, type CombatFoe } from './combatEstimate';
import { spotsOf, termsFor, TRAINER_LEVELS } from './combatRoute/spots';
import { coinsPerMinute, dropValue, lootSecondsPerKill } from './lootValue';
import { methodFoe, rangedHit } from './rangedAmmo';
import { rangedNeeds } from './rangedLoadout';
import { STAFFS, strikeRecipe } from './magicPlan';
import { FOODS } from './foodAdvice';
import { levelOf, type PlayerState } from './playerState';
import { gearPieceByName } from '../services/gearAdvisor';
import { nameKey } from './checklist';
import { xpForLevel } from './xp';
import type { PriceView } from './funding/quotes';
import type { Market, ModelRate } from './methodRates';
import type { TrainingMethod } from './trainingRouter';
import type { GearPiece } from '../types';

const TICK = 0.6;
/** Seconds to the next target when the spot says nothing else (combatEstimate's BETWEEN_KILLS). */
const BETWEEN: [number, number] = [2, 6];
/** Picking up the arrows under a kill, seconds. */
const ARROW_PICKUP = 1.2;
/** The share of shots that destroy their arrow (rangedAmmo.ARROW_BREAK). */
const ARROW_BREAK = 0.2;
/** A standard spell is cast every 5 ticks. */
const SPELL_TICKS = 5;
/** The model's margin on the pace at the slow end: who swings first, misclicks, other players at the spot. */
const MARGIN = 0.15;
/** Levels ahead the melee estimate is made for: long enough to average the rolls, short enough to stay "now". */
const MELEE_LEVELS = 3;

const MAX_HIT = (spellsJson as unknown as { maxHit: Record<'strike' | 'bolt', [number, number][]> }).maxHit;

const MELEE = new Set(['attack', 'strength', 'defence']);

/** The rate of one combat method for this player in this skill, or null when the model has nothing honest to say (methodRates.ts dispatches here). */
export function combatRate(m: TrainingMethod, skill: string, state: PlayerState, market: Market = {}): ModelRate | null {
  if (m.kind !== 'method' || !m.npcNames?.length || state.equipmentKnown !== true) return null;
  if (MELEE.has(skill) && m.skills.includes(skill)) return withLoot(meleeRate(m.npcNames[0], skill as 'attack' | 'strength' | 'defence', state), m.npcNames[0], market);
  if (skill === 'ranged' && m.kit === 'f2p-bow') return withLoot(rangedRate(m, state, market.prices), methodFoe(m)?.name ?? m.npcNames[0], market);
  if (skill === 'magic' && m.kit === 'strike-spell') return magicRate(m, state, market.prices);
  return null;
}

/** A rate with the spot's drop banked, when that pays for its pickups and bank trips (lootValue.ts); the rate as it was otherwise. */
function withLoot(r: (ModelRate & { secondsPerKill: number }) | null, foe: string, market: Market): ModelRate | null {
  if (!r) return null;
  const { secondsPerKill, ...rate } = r;
  const spot = spotsOf(allSteps).get(foe);
  const each = spot?.sell ? dropValue(spot.sell, market.prices, market.restriction) : null;
  const trip = termsOf(foe).tripMinutes;
  const extra = each !== null && spot?.sell ? lootSecondsPerKill(each, trip ? (trip[0] + trip[1]) / 2 : 4.5, coinsPerMinute(market.prices), market.objective) : null;
  if (extra === null || each === null) return rate;
  const slower = secondsPerKill / (secondsPerKill + extra);
  return { ...rate, xph: [rate.xph[0] * slower, rate.xph[1] * slower], lootPerHour: (3600 / (secondsPerKill + extra)) * each, loot: spot!.sell };
}

/** The worn items as gear pieces by slot; null when a worn weapon is unknown to the gear data (the model does not guess its hit). */
function worn(state: PlayerState): { weapon: GearPiece | null; neck: GearPiece | null; armour: GearPiece[]; unknown: number } | null {
  const e = state.equipment;
  const weapon = e.weapon ? gearPieceByName(e.weapon) : null;
  if (e.weapon && !weapon) return null;
  const armour: GearPiece[] = [];
  let unknown = 0;
  for (const slot of ['head', 'body', 'legs', 'shield'] as const) {
    if (!e[slot]) continue;
    const p = gearPieceByName(e[slot]);
    if (p) armour.push(p);
    else unknown++;
  }
  return { weapon, neck: e.neck ? gearPieceByName(e.neck) : null, armour, unknown };
}

/** The spot's terms for an opponent, from the route's spots. */
const termsOf = (foe: string) => termsFor(allSteps)[foe] ?? {};
const atLevels = (f: CombatFoe) => !TRAINER_LEVELS[f.name] || TRAINER_LEVELS[f.name].includes(f.combat);

function meleeRate(npc: string, skill: 'attack' | 'strength' | 'defence', state: PlayerState): (ModelRate & { secondsPerKill: number }) | null {
  const lv = { attack: levelOf(state, 'attack'), strength: levelOf(state, 'strength'), defence: levelOf(state, 'defence'), hitpoints: levelOf(state, 'hitpoints') };
  if (Object.values(lv).some((v) => v === undefined)) return null;
  const levels = lv as { attack: number; strength: number; defence: number; hitpoints: number };
  const gear = worn(state);
  const food = FOODS.find((f) => f.name === 'Salmon') ?? FOODS[0];
  if (!gear || !food || levels[skill] >= 99) return null;
  const terms = termsOf(npc);
  const from = xpForLevel(levels[skill]);
  const to = xpForLevel(Math.min(99, levels[skill] + MELEE_LEVELS));
  const best = foeVariants(npc).filter(atLevels).filter((f) => !unsafe(f, terms, levels.hitpoints)).flatMap((foe) => {
    const e = estimateCombat({
      foe, levels, goals: [{ skill, exp: to }], weapon: gear.weapon, neck: gear.neck, armour: gear.armour, unknownPieces: gear.unknown, food,
      xp: { [skill]: from }, ...terms,
    });
    return e ? [e] : [];
  }).sort((a, b) => a.totalMinutes.mid - b.totalMinutes.mid)[0];
  if (!best) return null;
  const xp = to - from;
  return {
    xph: [(xp * 60) / best.totalMinutes.high, (xp * 60) / Math.max(1e-6, best.totalMinutes.low)], costPerHour: null, basis: gear.weapon?.name ?? 'unarmed',
    secondsPerKill: (best.totalMinutes.mid * 60) / best.kills,
  };
}

function rangedRate(m: TrainingMethod, state: PlayerState, prices?: PriceView | null): (ModelRate & { secondsPerKill: number }) | null {
  const level = levelOf(state, 'ranged');
  const hp = levelOf(state, 'hitpoints');
  const foe = methodFoe(m);
  if (level === undefined || !foe || level >= 99) return null;
  const terms = termsOf(foe.name);
  if (hp !== undefined && unsafe(foe, terms, hp)) return null;
  const kit = rangedNeeds(state).filter((n) => n.type === 'item');
  const [bow, arrow] = [kit[0]?.name, kit[1]?.name];
  if (!bow || !arrow) return null;
  const skip = new Set([nameKey(bow), nameKey(arrow)]);
  const hit = rangedHit(level, bow, arrow, Object.values(state.equipment).filter((n) => !skip.has(nameKey(n))), foe);
  if (!hit) return null;
  const shots = attacksToKill(foe.hitpoints, hit.maxHit, hit.chance).mean;
  if (!Number.isFinite(shots)) return null;
  const between = terms.betweenKills ?? BETWEEN;
  const fight = shots * hit.speedTicks * TICK;
  const fast = fight + between[0] + ARROW_PICKUP;
  const slow = fight * (1 + MARGIN) + between[1] + ARROW_PICKUP;
  const perKill = xpPerKill(foe);
  const price = prices?.buy(arrow)?.price ?? null;
  const shotsPerHour = (3600 / ((fast + slow) / 2)) * shots;
  return {
    xph: [(3600 * perKill) / slow, (3600 * perKill) / fast],
    costPerHour: price === null ? null : shotsPerHour * ARROW_BREAK * price,
    basis: `${bow}, ${arrow}`,
    secondsPerKill: (fast + slow) / 2,
  };
}

function magicRate(m: TrainingMethod, state: PlayerState, prices?: PriceView | null): ModelRate | null {
  const level = levelOf(state, 'magic');
  const foe = methodFoe(m);
  if (level === undefined || !foe || level >= 99) return null;
  const { spell } = strikeRecipe(state);
  const maxHit = [...MAX_HIT.strike].reverse().find(([from]) => from <= level)?.[1];
  if (!maxHit) return null;
  // The magic attack bonus of what is worn; an item the gear data does not know counts as 0.
  const bonus = Object.values(state.equipment).reduce((a, n) => a + (gearPieceByName(n)?.attack.magic ?? 0), 0);
  const chance = hitChance((level + 8) * (bonus + 64), (foe.magicLevel + 9) * (foe.defence.magic + 64));
  const casts = attacksToKill(foe.hitpoints, maxHit, chance, false).mean;
  if (!Number.isFinite(casts)) return null;
  const between = termsOf(foe.name).betweenKills ?? BETWEEN;
  const fight = casts * SPELL_TICKS * TICK;
  const fast = fight + between[0];
  const slow = fight * (1 + MARGIN) + between[1];
  // Base XP for every cast, a splash too, and 2 per point of damage: a kill is its hit points of damage.
  const perKill = casts * spell.xp + 2 * foe.hitpoints;
  const staff = Object.entries(STAFFS).find(([, s]) => Object.values(state.equipment).some((n) => nameKey(n) === nameKey(s.name)))?.[0];
  const runes = Object.entries(spell.runes).filter(([element]) => element !== staff);
  const perCast = runes.reduce<number | null>((a, [element, qty]) => {
    const p = prices?.buy(`${element[0].toUpperCase()}${element.slice(1)} rune`)?.price;
    return a === null || p === undefined ? null : a + p * qty;
  }, 0);
  const castsPerHour = (3600 / ((fast + slow) / 2)) * casts;
  return {
    xph: [(3600 * perKill) / slow, (3600 * perKill) / fast],
    costPerHour: perCast === null || !prices ? null : castsPerHour * perCast,
    basis: spell.name,
  };
}
