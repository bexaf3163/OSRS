// The Magic data and the engine's spell rules: the spell table and staffs from spells.json (wiki cards), the hit of a spell, Superheat and the
// strike recipes. The costs a goal takes are the training engine's (trainingRouter), with the market's prices.

import { spellsJson } from '../../data';
import { heldExact, levelOf, questOf, wornItemsOf, type PlayerState } from '../player/playerState';
import { countWorn } from '../items/equipmentCount';
import type { MethodNeed } from '../training/trainingRouter';
import { STYLE_GEAR, usableStyleOption } from './styleGear';
import { gearPieceByName } from './gearAdvisor';
import type { GearPiece } from '../../types';
import { hitChance, type CombatFoe } from './combatEstimate';

export interface Spell { id: string; name: string; level: number; xp: number; runes: Record<string, number>; element: string }
export interface Staff { name: string; id: number }

export const SPELLS = spellsJson.spells as unknown as Spell[];
/** The elemental combat spells: Strike, Bolt and Blast. */
export const isCombatSpell = (s: Spell): boolean => /-(strike|bolt|blast)$/.test(s.id);
export const STAFFS = spellsJson.staffs as Record<string, Staff>;
const TIERS = (spellsJson as unknown as { maxHit: Record<string, [number, number][]> }).maxHit;

/** One cast against an opponent: the max hit of the spell's tier at this Magic level (every spell of a tier hits as hard as the highest one
 * the level unlocks, spells.json), accuracy from the worn magic attack bonus against its magic level and defence, and its elemental
 * weakness (OSRS Wiki Elemental weakness: that many percent more accuracy, and that share of the base max hit added). Null below the spell. */
export function spellHit(spell: Spell, level: number, bonus: number, foe: CombatFoe): { maxHit: number; chance: number } | null {
  const base = [...(TIERS[spell.id.slice(spell.id.lastIndexOf('-') + 1)] ?? [])].reverse().find(([from]) => from <= level)?.[1];
  if (!base || level < spell.level) return null;
  const weak = foe.weakness?.element === spell.element ? foe.weakness.percent : 0;
  const roll = Math.floor(Math.max(0, (level + 8) * (bonus + 64)) * (100 + weak) / 100);
  return { maxHit: base + Math.floor((base * weak) / 100), chance: hitChance(roll, (foe.magicLevel + 9) * (foe.defence.magic + 64)) };
}

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
  const pool = SPELLS.filter((s) => isCombatSpell(s) && s.level <= (levelOf(state, 'magic') ?? 1));
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
