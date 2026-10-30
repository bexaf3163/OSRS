import { bankTrip } from './bankTrip';
import { matchStrict } from '../services/locationResolver';
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
import { attacksToKill, combatMargin, combatRecovery, counterDamage, estimateCombat, foeVariants, hitChance, unsafe, xpPerKill, type CombatFoe } from './combatEstimate';
import { spotsOf, termsFor, TRAINER_LEVELS } from './combatRoute/spots';
import { coinsPerMinute, dropValue, lootSecondsPerKill } from './lootValue';
import { ARROW_BREAK, goalArrows, methodFoe, rangedKitOf, rangedHit, RANGED_GEAR, trainingRangedStyle } from './rangedAmmo';
import { rangedEquipment, rangedNeeds } from './rangedLoadout';
import { STAFFS, strikeRecipe } from './magicPlan';
import { FOODS } from './foodAdvice';
import { mergeGoalNeeds } from './processingGoal';
import { heldOf, levelOf, questOf, wornItemsOf, type PlayerState } from './playerState';
import { STYLE_GEAR, usableStyleOption } from './styleGear';
import { gearPieceByName, trainingWeapons, type Levels } from '../services/gearAdvisor';
import { nameKey } from './checklist';
import { supplyPrice } from './sourceRouter';
import { xpForLevel } from './xp';
import type { PriceView } from './funding/quotes';
import type { Market, ModelRate } from './methodRates';
import type { MethodNeed, TrainingMethod } from './trainingRouter';
import type { GearPiece } from '../types';

const TICK = 0.6;
/** Seconds to the next target when the spot says nothing else (combatEstimate's BETWEEN_KILLS). */
const BETWEEN: [number, number] = [2, 6];
/** Picking up the arrows under a kill, seconds. */
const ARROW_PICKUP = 1.2;
/** A standard spell is cast every 5 ticks. */
const SPELL_TICKS = 5;
/** Levels ahead the melee estimate is made for: long enough to average the rolls, short enough to stay "now". */
const MELEE_LEVELS = 3;

const MAX_HIT = (spellsJson as unknown as { maxHit: Record<'strike' | 'bolt', [number, number][]> }).maxHit;

const MELEE = new Set(['attack', 'strength', 'defence']);

/** Rate only the selected trainer's eligible weapon purchases; reuse Gear eligibility and the complete fight model. */
export function combatUpgrades(m: TrainingMethod, skill: string, state: PlayerState, market: Market = {}): NonNullable<ModelRate['upgrades']> {
  if (state.equipmentKnown !== true || !m.npcNames?.length || (!MELEE.has(skill) && !(skill === 'ranged' && m.kit === 'f2p-bow') && !(skill === 'magic' && m.kit === 'strike-spell'))) return [];
  const weapon = state.equipment.weapon;
  if (weapon && skill === 'magic' && !gearPieceByName(weapon)) return [];
  if (weapon && skill === 'ranged' && state.mode === 'members' && !RANGED_GEAR.some((g) => nameKey(g.name) === nameKey(weapon) && g.speed)) return [];
  const levels = Object.fromEntries(Object.entries(state.levels).flatMap(([k, v]) => v.known ? [[k, v.value]] : []));
  if ((MELEE.has(skill) ? ['attack', 'strength', 'defence', 'hitpoints'] : [skill, 'hitpoints']).some((k) => levels[k] === undefined)) return [];
  const before = combatRate(m, skill, state, market);
  if (!before) return [];
  const quests = state.quests.known ? new Set(state.quests.value) : undefined;
  // The style registry and bow model are the F2P starter kit's verified weapon list, shared with rangedNeeds.
  const weapons: Pick<GearPiece, 'name' | 'twoHanded'>[] = skill === 'ranged' || skill === 'magic'
    ? STYLE_GEAR[skill].weapon.filter((o) => usableStyleOption(o, (s) => levelOf(state, s), (q) => questOf(state, q) === 'DONE'))
      .flatMap((o) => o.names.flatMap((name): Pick<GearPiece, 'name' | 'twoHanded'>[] => {
        const p = gearPieceByName(name);
        // Unmodelled special staves cannot acquire a made-up zero Magic bonus.
        return skill === 'ranged' ? [{ name, twoHanded: true }] : p && !p.reqUnverified && !(p.members && state.mode === 'f2p') ? [p] : [];
      }))
    : trainingWeapons(levels as unknown as Levels, state.mode, quests);
  const rateWith = (p: Pick<GearPiece, 'name' | 'twoHanded'>) => {
    const equipment: Record<string, string> = { ...state.equipment, weapon: p.name };
    if (p.twoHanded) delete equipment.shield;
    const removed = new Set([state.equipment.weapon, ...(p.twoHanded ? [state.equipment.shield] : [])].filter(Boolean).map(nameKey));
    const equipmentItems = [...(wornItemsOf(state) ?? []).filter((it) => !removed.has(nameKey(it.name))), { name: p.name, count: 1 }];
    return combatRate(m, skill, { ...state, equipment, equipmentItems }, market);
  };
  const improves = (rate: ModelRate | null) => rate !== null && rate.xph[0] + rate.xph[1] >= before.xph[0] + before.xph[1]
    && (rate.xph[0] + rate.xph[1] > before.xph[0] + before.xph[1]
      || (rate.costPerHour !== null && before.costPerHour !== null && rate.costPerHour < before.costPerHour));
  // Gear already offers free equipment changes. Do not send the player shopping before using a better owned weapon.
  if (weapons.some((p) => {
    if (nameKey(p.name) === nameKey(state.equipment.weapon ?? '') || (heldOf(state, p.name).total ?? 0) <= 0) return false;
    const rate = rateWith(p);
    return improves(rate);
  })) return [];
  return weapons.flatMap((p) => {
    // Unread stock must not become an instruction to buy an item that may already be in the bank.
    const held = heldOf(state, p.name);
    if (held.total === null || held.total > 0) return [];
    const price = supplyPrice(p.name, market.prices, state.mode);
    if (price === null || !Number.isFinite(price) || price <= 0) return [];
    const after = rateWith(p);
    if (!after || !improves(after)) return [];
    return [{ tool: p.name, price, xph: after.xph, costPerHour: after.costPerHour }];
  });
}

/** The rate of one combat method for this player in this skill, or null when the model has nothing honest to say (methodRates.ts dispatches here). */
export function combatRate(m: TrainingMethod, skill: string, state: PlayerState, market: Market = {}): ModelRate | null {
  if (m.kind !== 'method' || !m.skills.includes(skill) || (m.members && state.mode !== 'members') || !m.npcNames?.length || state.equipmentKnown !== true) return null;
  if (MELEE.has(skill) && m.skills.includes(skill)) return withLoot(meleeRate(m.npcNames[0], skill as 'attack' | 'strength' | 'defence', state, market.prices), m.npcNames[0], market);
  if (skill === 'ranged' && m.kit === 'f2p-bow') return withLoot(rangedRate(m, state, market.prices), methodFoe(m)?.name ?? m.npcNames[0], market);
  if (skill === 'magic' && m.kit === 'strike-spell') return withLoot(magicRate(m, state, market.prices), methodFoe(m)?.name ?? m.npcNames[0], market);
  return null;
}

/** A rate with the spot's drop banked, when that pays for its pickups and bank trips (lootValue.ts); the rate as it was otherwise. */
function withLoot(r: (ModelRate & { secondsPerKill: number }) | null, foe: string, market: Market): ModelRate | null {
  if (!r) return null;
  const { secondsPerKill, ...rate } = r;
  // The method's own catalogue entry decides who may train there (members flag); here only the spot's facts are read.
  const spot = spotsOf(allSteps, true).get(foe);
  const each = spot?.sell ? dropValue(spot.sell, market.prices, market.restriction) : null;
  const trip = termsOf(foe).tripMinutes;
  const extra = each !== null && spot?.sell ? lootSecondsPerKill(each, trip ? (trip[0] + trip[1]) / 2 : 4.5, coinsPerMinute(market.prices), market.objective) : null;
  if (extra === null || each === null) return rate;
  const slower = secondsPerKill / (secondsPerKill + extra);
  return { ...rate, xph: [rate.xph[0] * slower, rate.xph[1] * slower], costPerHour: rate.costPerHour === null ? null : rate.costPerHour * slower,
    lootPerHour: (3600 / (secondsPerKill + extra)) * each, loot: spot!.sell };
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

function meleeRate(npc: string, skill: 'attack' | 'strength' | 'defence', state: PlayerState, prices?: PriceView | null): (ModelRate & { secondsPerKill: number }) | null {
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
  // The food eaten is the cost (owned food is used up too): none eaten is 0; eaten without a known price is unknown, never free.
  const foodPrice = supplyPrice(food.name, prices, state.mode);
  const costPerHour = best.food.mid <= 0 ? 0 : foodPrice === null ? null : (best.food.mid * foodPrice * 60) / Math.max(1e-6, best.totalMinutes.mid);
  return {
    xph: [(xp * 60) / best.totalMinutes.high, (xp * 60) / Math.max(1e-6, best.totalMinutes.low)], costPerHour, ...(best.food.mid > 0 ? { costName: food.name.toLowerCase() } : {}),
    basis: gear.weapon?.name ?? 'unarmed',
    secondsPerKill: (best.totalMinutes.mid * 60) / best.kills,
  };
}

/** All styles use the same incoming-hit, eating, free-heal and bank-trip model. A safespot is never inferred from a method's prose. */
function styleRecovery(m: TrainingMethod, level: number, state: PlayerState, foe: CombatFoe,
  hit: { maxHit: number; chance: number; speedTicks: number }, perKillXp: number, prices?: PriceView | null,
  needs: MethodNeed[] = m.needs, pickupSeconds = 0, zeroIsOne = true, goalKills?: number) {
  const hp = levelOf(state, 'hitpoints');
  const defence = levelOf(state, 'defence');
  const declared = termsOf(foe.name);
  const place = m.place ? matchStrict(m.place) : null;
  const fallbackTrip = !declared.tripMinutes && place ? bankTrip({ place }) : null;
  const terms = { ...declared, ...(fallbackTrip ? { tripMinutes: fallbackTrip.minutes } : {}) };
  if (hp === undefined || unsafe(foe, terms, hp) || (foe.maxHit > 0 && defence === undefined)) return null;
  // The shared incoming melee roll is not a substitute for an unmodelled magic/ranged defence formula.
  if (foe.maxHit > 0 && !['stab', 'slash', 'crush'].includes(foe.attackStyle)) return null;
  const a = attacksToKill(foe.hitpoints, hit.maxHit, hit.chance, zeroIsOne);
  if (!Number.isFinite(a.mean) || !(perKillXp > 0)) return null;
  const foodNeed = needs.find((n) => n.type === 'item' && FOODS.some((f) => f.name === n.name));
  const food = FOODS.find((f) => f.name === (foodNeed?.type === 'item' ? foodNeed.name : 'Salmon'))!;
  const pieces = Object.entries(state.equipment).filter(([slot]) => ['weapon', 'head', 'body', 'legs', 'shield', 'feet', 'hands', 'neck', 'cape'].includes(slot));
  const unknown = pieces.some(([slot, name]) => !gearPieceByName(name) && !(slot === 'weapon' && RANGED_GEAR.some((g) => nameKey(g.name) === nameKey(name) && g.speed)));
  const bonus = pieces.reduce((sum, [, name]) => sum + (gearPieceByName(name)?.defence[foe.attackStyle as 'stab' | 'slash' | 'crush'] ?? 0), 0);
  const incoming = counterDamage(foe, hit.maxHit, hit.chance, hit.speedTicks, defence ?? 1, bonus, zeroIsOne);
  if (!Number.isFinite(incoming.mean) || !Number.isFinite(incoming.variance)) return null;
  const kills = goalKills === undefined ? Math.max(1, Math.ceil((xpForLevel(Math.min(99, level + MELEE_LEVELS)) - xpForLevel(level)) / perKillXp)) : Math.max(1, Math.ceil(goalKills));
  const between = terms.betweenKills ?? BETWEEN;
  const recovery = combatRecovery({ ...terms, foe, hitpoints: hp, food,
    foodSlots: foodNeed?.type === 'item' ? Math.max(1, Math.min(26, foodNeed.count ?? 26)) : 26,
    kills, fightMean: kills * a.mean * hit.speedTicks * TICK, fightVar: kills * a.variance * (hit.speedTicks * TICK) ** 2,
    damageMean: kills * incoming.mean, damageVar: kills * incoming.variance,
    margin: combatMargin(unknown ? 'basic' : 'formula', Boolean(foe.aggressive || terms.groupAggro)),
    betweenKills: [between[0] + pickupSeconds, between[1] + pickupSeconds],
  });
  const price = supplyPrice(food.name, prices, state.mode);
  const foodCost = recovery.food.mid === 0 ? 0 : price === null ? null : recovery.food.mid * price;
  const hours = recovery.totalMinutes.mid / 60;
  return { recovery, kills, hours, foodCost, food: food.name,
    warning: unknown ? 'Some worn defence bonuses are unknown; food and time are approximate.' : undefined };
}

/** Complete F2P bow-path demand using the existing arrow and recovery models; never grant a projected kit. */
export function rangedGoalNeeds(legs: readonly { method: TrainingMethod; fromLevel: number; toLevel: number; needs?: MethodNeed[] }[], state: PlayerState, xp: number, target: number, prices?: PriceView | null): MethodNeed[] | null {
  const level = levelOf(state, 'ranged');
  if (state.mode !== 'f2p' || level === undefined || !Number.isInteger(target) || target <= level || target > 99 || !legs.length || !Number.isFinite(xp) || xp < xpForLevel(level) || xp >= xpForLevel(level + 1)) return null;
  type Item = Extract<MethodNeed, { type: 'item' }>;
  const materials: Item[] = [], kit: Item[] = [], buffers: Item[] = [];
  let end = level;
  for (const leg of legs) {
    if (leg.method.kit !== 'f2p-bow' || !leg.needs || leg.fromLevel !== end || !Number.isInteger(leg.toLevel) || leg.toLevel <= end || leg.toLevel > 99) return null;
    const selected = rangedKitOf(leg.needs, state.equipment), foe = methodFoe(leg.method);
    const ammo = goalArrows([leg], state, Math.max(xp, xpForLevel(leg.fromLevel)), prices);
    if (!selected || !foe || !ammo) return null;
    const hit = rangedHit(leg.fromLevel, selected.bow, selected.arrow, selected.worn, foe, trainingRangedStyle(leg.fromLevel));
    if (!hit) return null;
    // Full leg horizon: do not repeatedly give the character a fresh HP pool for every three-level rate sample.
    const perKill = xpPerKill(foe);
    const kills = Math.ceil((xpForLevel(leg.toLevel) - Math.max(xp, xpForLevel(leg.fromLevel))) / perKill);
    const sustained = styleRecovery(leg.method, leg.fromLevel, { ...state, equipment: selected.equipment }, foe, hit, perKill, prices, leg.needs, ARROW_PICKUP, true, kills);
    if (!sustained) return null;
    const food = leg.needs.find((n): n is Item => n.type === 'item' && FOODS.some(f => f.name === n.name));
    if (sustained.recovery.food.high > 0 && (!food || !Number.isFinite(food.count) || food.count! <= 0)) return null; // A missing food declaration is not a funded/safe complete kit.
    materials.push({ type: 'item', name: selected.arrow, count: Math.ceil(ammo.lostPickingUp.high) });
    if (food) materials.push({ ...food, equip: undefined, count: Math.ceil(sustained.recovery.food.high) });
    for (const n of leg.needs) {
      if (n.type !== 'item') continue;
      if (n.name === selected.arrow || FOODS.some(f => f.name === n.name)) buffers.push(n);
      else kit.push(n);
    }
    end = leg.toLevel;
  }
  return end === target ? mergeGoalNeeds(materials, kit, buffers) : null;
}

function rangedRate(m: TrainingMethod, state: PlayerState, prices?: PriceView | null): (ModelRate & { secondsPerKill: number }) | null {
  const level = levelOf(state, 'ranged');
  const foe = methodFoe(m);
  if (level === undefined || !foe || level >= 99) return null;
  const kit = rangedNeeds(state, prices).filter((n) => n.type === 'item');
  const [bow, arrow] = [kit[0]?.name, kit[1]?.name];
  if (!bow || !arrow) return null;
  const equipment = rangedEquipment(state.equipment, kit);
  const armour = Object.entries(equipment).filter(([slot]) => slot !== 'weapon' && slot !== 'ammo').map(([, name]) => name);
  const hit = rangedHit(level, bow, arrow, armour, foe, trainingRangedStyle(level));
  if (!hit) return null;
  const shots = attacksToKill(foe.hitpoints, hit.maxHit, hit.chance).mean;
  if (!Number.isFinite(shots)) return null;
  const perKill = xpPerKill(foe);
  const sustained = styleRecovery(m, level, { ...state, equipment }, foe, hit, perKill, prices, m.needs, ARROW_PICKUP);
  if (!sustained) return null;
  const { recovery, kills, hours, foodCost } = sustained;
  const price = supplyPrice(arrow, prices, state.mode);
  const ammoCost = price === null ? null : kills * shots * ARROW_BREAK * price;
  return {
    xph: [(kills * perKill * 60) / recovery.totalMinutes.high, (kills * perKill * 60) / recovery.totalMinutes.low],
    costPerHour: ammoCost === null || foodCost === null ? null : (ammoCost + foodCost) / hours,
    costName: recovery.food.mid > 0 ? `arrows and ${sustained.food.toLowerCase()}` : 'arrows',
    basis: `${bow}, ${arrow}`,
    secondsPerKill: (recovery.totalMinutes.mid * 60) / kills,
    ...(sustained.warning ? { warning: sustained.warning } : {}),
  };
}

function magicRate(m: TrainingMethod, state: PlayerState, prices?: PriceView | null): (ModelRate & { secondsPerKill: number }) | null {
  const level = levelOf(state, 'magic');
  const foe = methodFoe(m);
  if (level === undefined || !foe || level >= 99) return null;
  const { spell, needs } = strikeRecipe(state);
  const staff = Object.entries(STAFFS).find(([, s]) => needs.some((n) => n.type === 'item' && n.equip && nameKey(n.name) === nameKey(s.name)));
  const equipment = { ...state.equipment, ...(staff ? { weapon: staff[1].name } : {}) };
  if (equipment.weapon && !gearPieceByName(equipment.weapon)) return null;
  const maxHit = [...MAX_HIT.strike].reverse().find(([from]) => from <= level)?.[1];
  if (!maxHit) return null;
  // The magic attack bonus of what is worn; an item the gear data does not know counts as 0.
  const bonus = Object.values(equipment).reduce((a, n) => a + (gearPieceByName(n)?.attack.magic ?? 0), 0);
  const chance = hitChance(Math.max(0, (level + 8) * (bonus + 64)), (foe.magicLevel + 9) * (foe.defence.magic + 64));
  const casts = attacksToKill(foe.hitpoints, maxHit, chance, false).mean;
  if (!Number.isFinite(casts)) return null;
  // Base XP for every cast, a splash too, and 2 per point of damage: a kill is its hit points of damage.
  const perKill = casts * spell.xp + 2 * foe.hitpoints;
  const sustained = styleRecovery(m, level, { ...state, equipment }, foe, { maxHit, chance, speedTicks: SPELL_TICKS }, perKill, prices, needs, 0, false);
  if (!sustained) return null;
  const { recovery, kills, hours, foodCost } = sustained;
  const runes = Object.entries(spell.runes).filter(([element]) => element !== staff?.[0]);
  const perCast = runes.reduce<number | null>((a, [element, qty]) => {
    const p = supplyPrice(`${element[0].toUpperCase()}${element.slice(1)} rune`, prices, state.mode);
    return a === null || p === null ? null : a + p * qty;
  }, 0);
  return {
    xph: [(kills * perKill * 60) / recovery.totalMinutes.high, (kills * perKill * 60) / recovery.totalMinutes.low],
    costPerHour: perCast === null || foodCost === null ? null : (kills * casts * perCast + foodCost) / hours,
    costName: recovery.food.mid > 0 ? `runes and ${sustained.food.toLowerCase()}` : 'runes',
    basis: spell.name,
    secondsPerKill: (recovery.totalMinutes.mid * 60) / kills,
    ...(sustained.warning ? { warning: sustained.warning } : {}),
  };
}
