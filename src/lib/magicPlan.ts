// What it costs to bring Magic to a goal with strike combat spells (Wind/Water/Earth/Fire Strike) and whether the staff pays for itself.
// Pure logic: the prices come from outside (the exchange), the spells from spells.json (wiki cards).

import spellsJson from '../data/spells.json';
import { levelForXp, xpForLevel } from './xp';

export interface Spell { id: string; name: string; level: number; xp: number; runes: Record<string, number>; element: string }
export interface Staff { name: string; id: number }

export const SPELLS = spellsJson.spells as unknown as Spell[];
export const RUNE_IDS = spellsJson.runeIds as Record<string, number>;
export const STAFFS = spellsJson.staffs as Record<string, Staff>;
export const COWHIDE_ID = spellsJson.cowhideId;
export const SPELLS_CHECKED = spellsJson.checked;

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
    if (p === undefined) return null;
    sum += p * qty;
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
  const target = xpForLevel(toLevel);
  const pool = SPELLS.filter((s) => opt.spells.includes(s.id)).sort((a, b) => a.level - b.level);
  const staff = opt.staff ? STAFFS[opt.staff] : undefined;
  const staffPrice = staff ? prices.get(staff.id) : 0;
  if (staff && staffPrice === undefined && !ownsStaff) return null;
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
    casts += n;
    xp += n * spell.xp;
    const last = steps[steps.length - 1];
    if (last && last.spell.id === spell.id) last.casts += n; else steps.push({ spell, casts: n });
  }
  const staffCost = ownsStaff ? 0 : (staffPrice ?? 0);
  return { option: opt, casts, steps, runesCost: Math.round(runesCost), staffCost, total: Math.round(runesCost) + staffCost, xpNeeded: Math.max(0, target - Math.max(0, fromXp)) };
}

/** The staff pays for itself: how many spells are needed for the saved runes to cover its price; null means no prices. */
export function staffPayback(staffKey: string, spell: Spell, prices: PriceMap): { perCast: number; casts: number } | null {
  const staff = STAFFS[staffKey];
  const price = prices.get(staff.id);
  const rune = prices.get(RUNE_IDS[staffKey]);
  const qty = spell.runes[staffKey];
  if (price === undefined || rune === undefined || !qty) return null;
  const perCast = rune * qty;
  return perCast > 0 ? { perCast, casts: Math.ceil(price / perCast) } : null;
}

/** How many hides must be sold to cover the sum. */
export function hidesToCover(gp: number, prices: PriceMap): number | null {
  const p = prices.get(COWHIDE_ID);
  return p && p > 0 ? Math.ceil(gp / p) : null;
}
