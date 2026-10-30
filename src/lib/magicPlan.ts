// What it costs to bring Magic to a goal with strike combat spells (Wind/Water/Earth/Fire Strike) and whether the staff pays for itself.
// Pure logic: the prices come from outside (the exchange), the spells from spells.json (wiki cards).

import spellsJson from '../data/spells.json';
import { levelForXp, xpForLevel } from './xp';
import { heldExact, levelOf, questOf, wornItemsOf, type PlayerState } from './playerState';
import { countWorn } from './equipmentCount';
import type { MethodNeed } from './trainingRouter';
import { STYLE_GEAR, usableStyleOption } from './styleGear';
import { gearPieceByName } from '../services/gearAdvisor';
import type { GearPiece } from '../types';

export interface Spell { id: string; name: string; level: number; xp: number; runes: Record<string, number>; element: string }
export interface Staff { name: string; id: number }

export const SPELLS = spellsJson.spells as unknown as Spell[];
export const RUNE_IDS = spellsJson.runeIds as Record<string, number>;
export const STAFFS = spellsJson.staffs as Record<string, Staff>;
export const COWHIDE_ID = spellsJson.cowhideId;

export const SUPERHEAT_WATCH = ['Nature rune', 'Fire rune', 'Iron ore', STAFFS.fire.name];
export const STRIKE_WATCH = [...new Set(['Mind rune', 'Air rune', 'Water rune', 'Earth rune', 'Fire rune', ...Object.values(STAFFS).map(s => s.name), 'Trout', 'Salmon', 'Tuna', 'Lobster', 'Swordfish',
  ...Object.values(STYLE_GEAR.magic).flatMap(options => options.flatMap(option => option.names.filter(name => gearPieceByName(name) !== null))),
])];

/** Free, verified F2P clothing candidates; the combat model checks their actual food/XP trade-off. */
function ownedMagicClothing(state: PlayerState): MethodNeed[] {
  if (state.mode !== 'f2p' || !state.equipmentKnown) return [];
  return Object.entries(STYLE_GEAR.magic).flatMap(([slot, options]) => {
    if (slot === 'weapon') return [];
    const currentName = state.equipment[slot], current = currentName ? gearPieceByName(currentName) : null;
    // Unknown worn bonuses are not evidence that an ordinary replacement is better.
    if (currentName && !current) return [];
    const owned = options.filter(option => usableStyleOption(option, skill => levelOf(state, skill), quest => questOf(state, quest) === 'DONE'))
      .flatMap(option => option.names).map(gearPieceByName)
      .filter((piece): piece is GearPiece => piece !== null && !piece.members && !piece.reqUnverified && piece.slot === slot && (heldExact(state, piece.name).total ?? 0) > 0)
      .sort((a, b) => b.attack.magic - a.attack.magic)[0];
    return owned && owned.attack.magic > (current?.attack.magic ?? 0)
      ? [{ type: 'item', name: owned.name, count: 1, equip: true }] : [];
  });
}

/** Prefer a higher unlocked Strike only when its actual ingredients are already confirmed.
 * Otherwise Wind Strike is the inexpensive fallback; no unavailable price is treated as an affordable upgrade.
 */
export function strikeRecipe(state: PlayerState, preparedWeapon?: string): { spell: Spell; needs: MethodNeed[] } {
  const worn = wornItemsOf(state);
  const staves = Object.entries(STAFFS);
  // An evaluated purchase must use that weapon's rune substitution without pretending it is already owned/worn.
  const staff = preparedWeapon !== undefined ? staves.find(([, s]) => s.name.toLowerCase() === preparedWeapon.toLowerCase())
    : staves.find(([, s]) => countWorn(worn, n => n.toLowerCase() === s.name.toLowerCase()).count > 0)
      ?? staves.find(([, s]) => (heldExact(state, s.name).total ?? 0) > 0);
  const pool = SPELLS.filter(s => s.id.endsWith('-strike') && s.level <= (levelOf(state, 'magic') ?? 1));
  const spent = (s: Spell) => Object.entries(s.runes).filter(([element]) => element !== staff?.[0]);
  const spell = [...pool].reverse().find(s => spent(s).every(([element, qty]) => (heldExact(state, `${element[0].toUpperCase()}${element.slice(1)} rune`).total ?? 0) >= qty * 20)) ?? pool[0];
  const batch = spent(spell).every(([element, qty]) => (heldExact(state, `${element[0].toUpperCase()}${element.slice(1)} rune`).total ?? 0) >= qty * 20) ? 20 : 100;
  const foods = ['Trout', 'Salmon', 'Tuna', 'Lobster', 'Swordfish'];
  const foodCount = foods.some(name => (heldExact(state, name).bag ?? 0) > 0) ? 1 : 5;
  return { spell, needs: [
    { type: 'skill', skill: 'magic', min: spell.level },
    ...spent(spell).map(([element, qty]): MethodNeed => ({ type: 'item', name: `${element[0].toUpperCase()}${element.slice(1)} rune`, count: qty * batch })),
    ...(staff ? [{ type: 'item' as const, name: staff[1].name, equip: true }] : []),
    ...ownedMagicClothing(state),
    { type: 'item', name: foods[0], count: foodCount, refill: 5, anyOf: foods.slice(1) },
  ] };
}

/** A physical starter bag: 25 unnoted iron ore + two rune stacks fit in 28 slots.
 * OSRS Wiki: Superheat Item uses one nature/four fire per ore, Magic43/Smithing15.
 * Owned fire staff only substitutes runes when preparation also requires it worn.
 */
export function superheatNeeds(state: PlayerState): MethodNeed[] {
  const fireStaff = STAFFS.fire.name;
  const hasStaff = countWorn(wornItemsOf(state), name => name.toLowerCase() === fireStaff.toLowerCase()).count > 0
    || (heldExact(state, fireStaff).total ?? 0) > 0;
  // Finish a castable bag before asking for a new starter batch; spending one rune/ore must not flip the method after every cast.
  const inBag = Math.min(25, heldExact(state, 'Iron ore').bag ?? 0, heldExact(state, 'Nature rune').bag ?? 0,
    hasStaff ? 25 : Math.floor((heldExact(state, 'Fire rune').bag ?? 0) / 4));
  const batch = inBag > 0 ? inBag : 25;
  return [
    { type: 'skill', skill: 'magic', min: 43 },
    { type: 'skill', skill: 'smithing', min: 15 },
    { type: 'item', name: 'Nature rune', count: batch },
    { type: 'item', name: 'Iron ore', count: batch },
    hasStaff ? { type: 'item', name: fireStaff, equip: true } : { type: 'item', name: 'Fire rune', count: batch * 4 },
  ];
}

/** Prices by item ID (the exchange, instant buy). */
export type PriceMap = ReadonlyMap<number, number>;

/** All the IDs whose prices the plan needs. */
export const PLAN_PRICE_IDS: number[] = [...Object.values(RUNE_IDS), ...Object.values(STAFFS).map((s) => s.id), COWHIDE_ID];

export interface PlanOption {
  id: string;
  label: string;
  /** Which spells are allowed (id); the best by XP of the open ones is taken. */
  spells: string[];
  /** An elemental staff: runes of this element are not spent. */
  staff?: string;
}

export const OPTIONS: PlanOption[] = [
  { id: 'wind', label: 'Wind Strike only', spells: ['wind-strike'] },
  { id: 'wind-staff', label: 'Wind Strike + Staff of air', spells: ['wind-strike'], staff: 'air' },
  { id: 'best', label: 'The best strike for the level (Earth, then Fire)', spells: ['wind-strike', 'water-strike', 'earth-strike', 'fire-strike'] },
  { id: 'best-fire', label: 'The best strike + Staff of fire', spells: ['wind-strike', 'water-strike', 'earth-strike', 'fire-strike'], staff: 'fire' },
  // From level 25: teleports give three times more XP per cast, but each costs a law rune.
  { id: 'tele', label: 'Varrock → Lumbridge teleports', spells: ['varrock-teleport', 'lumbridge-teleport'] },
  { id: 'tele-air', label: 'Teleports + Staff of air', spells: ['varrock-teleport', 'lumbridge-teleport'], staff: 'air' },
];

/** The price of one spell; null means the price of some needed rune is missing. The runes of the staff's element are not counted. */
export function castCost(spell: Spell, staff: string | undefined, prices: PriceMap): number | null {
  let sum = 0;
  for (const [rune, qty] of Object.entries(spell.runes)) {
    if (staff && rune === staff) continue;
    const p = prices.get(RUNE_IDS[rune]);
    if (p === undefined || !Number.isSafeInteger(p) || p < 0) return null;
    sum += p * qty;
    if (!Number.isSafeInteger(sum)) return null;
  }
  return sum;
}

export interface PlanStep { spell: Spell; casts: number }
export interface PlanResult {
  option: PlanOption;
  casts: number;
  steps: PlanStep[];
  runesCost: number;
  staffCost: number;
  total: number;
  xpNeeded: number;
}

/**
 * Counts the path from XP fromXp to level toLevel: at every level, the open spell that is best by XP from the list of the
 * variant. null means a price of some rune (or the staff) is missing or there is nothing to hit with.
 */
export function planFor(opt: PlanOption, fromXp: number, toLevel: number, prices: PriceMap, ownsStaff = false): PlanResult | null {
  if (!Number.isFinite(fromXp) || !Number.isInteger(toLevel) || toLevel < 1 || toLevel > 99) return null;
  const target = xpForLevel(toLevel);
  const pool = SPELLS.filter((s) => opt.spells.includes(s.id)).sort((a, b) => a.level - b.level);
  const staff = opt.staff ? STAFFS[opt.staff] : undefined;
  const staffPrice = staff ? prices.get(staff.id) : 0;
  if (staff && staffPrice === undefined && !ownsStaff) return null;
  if (!ownsStaff && staffPrice !== undefined && (!Number.isSafeInteger(staffPrice) || staffPrice < 0)) return null;
  let xp = Math.max(0, fromXp);
  const steps: PlanStep[] = [];
  let runesCost = 0;
  let casts = 0;
  while (xp < target) {
    const level = levelForXp(xp);
    const open = pool.filter((s) => s.level <= level);
    if (!open.length) return null;
    const spell = open.reduce((a, b) => (b.xp > a.xp ? b : a));
    // How many such spells to the next level or to the goal, whichever is sooner.
    const nextXp = Math.min(target, xpForLevel(level + 1));
    const n = Math.max(1, Math.ceil((nextXp - xp) / spell.xp));
    const c = castCost(spell, opt.staff, prices);
    if (c === null) return null;
    runesCost += c * n;
    if (!Number.isSafeInteger(runesCost)) return null;
    casts += n;
    xp += n * spell.xp;
    const last = steps[steps.length - 1];
    if (last && last.spell.id === spell.id) last.casts += n; else steps.push({ spell, casts: n });
  }
  const staffCost = ownsStaff ? 0 : (staffPrice ?? 0);
  if (!Number.isSafeInteger(runesCost + staffCost)) return null;
  return { option: opt, casts, steps, runesCost: Math.round(runesCost), staffCost, total: Math.round(runesCost) + staffCost, xpNeeded: Math.max(0, target - Math.max(0, fromXp)) };
}

/** The staff pays for itself: how many spells are needed for the saved runes to cover its price; null means no prices. */
export function staffPayback(staffKey: string, spell: Spell, prices: PriceMap): { perCast: number; casts: number } | null {
  const staff = STAFFS[staffKey];
  const price = prices.get(staff.id);
  const rune = prices.get(RUNE_IDS[staffKey]);
  const qty = spell.runes[staffKey];
  if (price === undefined || rune === undefined || !Number.isSafeInteger(price) || price < 0 || !Number.isSafeInteger(rune) || rune < 0 || !qty) return null;
  const perCast = rune * qty;
  return Number.isSafeInteger(perCast) && perCast > 0 ? { perCast, casts: Math.ceil(price / perCast) } : null;
}

/** How many hides must be sold to cover the sum. */
export function hidesToCover(gp: number, prices: PriceMap): number | null {
  const p = prices.get(COWHIDE_ID);
  return p && p > 0 ? Math.ceil(gp / p) : null;
}
