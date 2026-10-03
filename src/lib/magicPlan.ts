// Сколько стоит довести Magic до цели боевыми заклинаниями-ударами (Wind/Water/Earth/Fire Strike) и окупается ли посох.
// Чистая логика: цены приходят снаружи (биржа), заклинания — из spells.json (карточки вики).

import spellsJson from '../data/spells.json';
import { levelForXp, xpForLevel } from './xp';

export interface Spell { id: string; name: string; level: number; xp: number; runes: Record<string, number>; element: string }
export interface Staff { name: string; nameRu: string; id: number }

export const SPELLS = spellsJson.spells as unknown as Spell[];
export const RUNE_IDS = spellsJson.runeIds as Record<string, number>;
export const STAFFS = spellsJson.staffs as Record<string, Staff>;
export const COWHIDE_ID = spellsJson.cowhideId;
export const SPELLS_CHECKED = spellsJson.checked;

/** Цены по ID предмета (биржа, мгновенная покупка). */
export type PriceMap = ReadonlyMap<number, number>;

/** Все ID, цены которых нужны плану. */
export const PLAN_PRICE_IDS: number[] = [...Object.values(RUNE_IDS), ...Object.values(STAFFS).map((s) => s.id), COWHIDE_ID];

export interface PlanOption {
  id: string;
  label: string;
  /** Какие заклинания разрешены (id); берётся самое выгодное по опыту из открытых. */
  spells: string[];
  /** Посох стихии: руны этого элемента не тратятся. */
  staff?: string;
}

export const OPTIONS: PlanOption[] = [
  { id: 'wind', label: 'Только Wind Strike', spells: ['wind-strike'] },
  { id: 'wind-staff', label: 'Wind Strike + посох воздуха', spells: ['wind-strike'], staff: 'air' },
  { id: 'best', label: 'Лучший удар по уровню (Earth, потом Fire)', spells: ['wind-strike', 'water-strike', 'earth-strike', 'fire-strike'] },
  { id: 'best-fire', label: 'Лучший удар + посох огня', spells: ['wind-strike', 'water-strike', 'earth-strike', 'fire-strike'], staff: 'fire' },
];

/** Цена одного заклинания; null — цены какой-то нужной руны нет. Руны стихии посоха не считаются. */
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
 * Считает путь от опыта fromXp до уровня toLevel: на каждом уровне — выгодное по опыту открытое заклинание из списка
 * варианта. null — нет цены какой-то руны (или посоха) либо нечем бить.
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
    // Сколько таких заклинаний до следующего уровня или до цели, что раньше.
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

/** Посох окупается: сколько заклинаний нужно, чтобы сэкономленные руны покрыли его цену; null — нет цен. */
export function staffPayback(staffKey: string, spell: Spell, prices: PriceMap): { perCast: number; casts: number } | null {
  const staff = STAFFS[staffKey];
  const price = prices.get(staff.id);
  const rune = prices.get(RUNE_IDS[staffKey]);
  const qty = spell.runes[staffKey];
  if (price === undefined || rune === undefined || !qty) return null;
  const perCast = rune * qty;
  return perCast > 0 ? { perCast, casts: Math.ceil(price / perCast) } : null;
}

/** Сколько шкур надо продать, чтобы покрыть сумму. */
export function hidesToCover(gp: number, prices: PriceMap): number | null {
  const p = prices.get(COWHIDE_ID);
  return p && p > 0 ? Math.ceil(gp / p) : null;
}
