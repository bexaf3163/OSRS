// The food the player holds (bag, bank, worn alternatives) and how a step's food needs are covered from it.
import { heldExact, type Held, type PlayerState } from './playerState';
import type { OwnedItem } from '../items/checklist';
import { nameKey } from '../items/itemKey';
import { FOODS, type Food } from '../../data/threats';
import type { Step } from '../../types';

/** The step's own combat food: required when the player's estimate needs it, otherwise the recommended one (training, unestimated fights). */
export function stepFood(step: Pick<Step, 'itemsRequired' | 'itemsRecommended'>) {
  return (step.itemsRequired ?? []).find((i) => typeof i.heals === 'number') ?? (step.itemsRecommended ?? []).find((i) => typeof i.heals === 'number');
}

/** Only explicit combat food may use edible alternatives; a quest ingredient stays an exact item. */
export interface FoodRequirement { nameEn: string; heals: number; anyOf?: readonly string[] }
export interface FoodHolding extends Held { withYou: number | null; viaAlternatives: number; bankLower: number; parts: FoodPart[] }
export interface FoodCarry {
  /** Physical food to receive at a bank, including notes that must be unnoted. */
  take: { name: string; count: number; noted: boolean }[];
  /** Additional physical slots; any uncovered health is allowed for in the named food. */
  adding: number;
  missing: number;
}
/** A healing equivalent is not an inventory slot: select whole physical bites in the same order as allocation. */
export function foodCarry(stock: FoodHolding, units: number): FoodCarry {
  const unit = stock.parts.find(part => !part.alternative)?.heals ?? 1;
  let health = Math.max(0, units) * unit;
  const take: FoodCarry['take'] = [];
  for (const where of ['bag', 'noted', 'bank'] as const) {
    for (const part of stock.parts) {
      if (health <= 0) break;
      const count = Math.min(part.held[where] ?? 0, Math.ceil(health / part.heals));
      health = Math.max(0, health - count * part.heals);
      if (where !== 'bag' && count > 0) take.push({ name: part.name, count, noted: where === 'noted' });
    }
  }
  const missing = Math.ceil(health / unit);
  return { take, missing, adding: take.reduce((sum, item) => sum + item.count, 0) + missing };
}
/** Named-food equivalents, rounded after adding healing, with the same bank certainty as physical stock. */
export function heldFood(
  state: Pick<PlayerState, 'owned' | 'equipment' | 'manual' | 'bankSeen'>,
  food: FoodRequirement, manualKey?: string, hitpoints?: number, reserved?: ReadonlyMap<string, number>, reservePrimary = false,
): FoodHolding {
  const primary = nameKey(food.nameEn);
  const names = [...new Map([food.nameEn, ...(food.anyOf ?? [])].map(name => [nameKey(name), name])).values()];
  const unit = effectiveHeal(food, hitpoints);
  const parts = names.flatMap(name => {
    const heals = nameKey(name) === primary ? food.heals : FOODS.find(f => nameKey(f.name) === nameKey(name))?.heals;
    if (heals === undefined) return [];
    const original = heldExact(state, name, nameKey(name) === primary ? manualKey : undefined);
    const reserve = nameKey(name) === primary && !reservePrimary ? 0 : reserved?.get(nameKey(name)) ?? 0;
    let keep = reserve;
    const bank = original.bank === null ? null : Math.max(0, original.bank - keep);
    keep = Math.max(0, keep - (original.bank ?? 0));
    const noted = Math.max(0, original.noted - keep);
    keep = Math.max(0, keep - original.noted);
    const bag = original.bag === null ? null : Math.max(0, original.bag - keep);
    const total = original.total === null ? null : Math.max(0, original.total - reserve);
    return [{ name, held: { ...original, bank, noted, bag, total }, alternative: nameKey(name) !== primary, heals: effectiveHeal({ heals }, hitpoints) }];
  });
  const health = (where: 'bag' | 'noted' | 'bank' | 'total') => parts.reduce((n, p) => n + (p.held[where] ?? 0) * p.heals, 0);
  const bag = Math.floor(health('bag') / unit);
  const withYou = Math.floor((health('bag') + health('noted')) / unit);
  const bank = Math.floor((health('bag') + health('noted') + health('bank')) / unit) - withYou;
  const bankKnown = parts.every(p => p.held.bank !== null);
  const anyBag = parts.some(p => p.held.bag !== null);
  const anyStock = parts.some(p => p.held.presence === 'PRESENT');
  const allMissing = parts.every(p => p.held.presence === 'MISSING');
  const total = Math.floor(health('total') / unit);
  return {
    bag: anyBag ? bag : null,
    noted: withYou - bag,
    bank: bankKnown ? bank : null,
    total: anyStock || allMissing ? total : null,
    presence: anyStock ? 'PRESENT' : allMissing ? 'MISSING' : 'UNKNOWN',
    equipped: 0,
    source: parts.some(p => p.held.source === 'manual') ? 'manual' : parts.some(p => p.held.source === 'game') ? 'game' : 'none',
    withYou: anyBag ? withYou : null,
    viaAlternatives: Math.floor(parts.filter(p => p.alternative).reduce((n, p) => n + (p.held.total ?? 0) * p.heals, 0) / unit),
    bankLower: bank,
    parts,
  };
}
/** Allocate physical edible stock once, in demand order; another line's named ingredients stay reserved. */
export function allocateFoodStock(
  state: Pick<PlayerState, 'owned' | 'equipment' | 'manual' | 'bankSeen'>,
  lines: readonly { key: string; manualKey?: string; reservedCount?: number; nameEn: string; count: number; heals?: number; anyOf?: readonly string[] }[],
  hitpoints?: number, reservations?: ReadonlyMap<string, number>,
): Map<string, FoodHolding> {
  const foodLines = lines.filter(line => line.heals);
  if (!foodLines.length) return new Map();
  const names = new Set(foodLines.flatMap(line => [line.nameEn, ...(line.anyOf ?? [])]).map(nameKey));
  const items = new Map([...names].flatMap(key => {
    const item = state.owned?.items.get(key);
    return item ? [[key, { ...item }] as [string, OwnedItem]] : [];
  }));
  const pool = { ...state, manual: { ...state.manual }, owned: state.owned ? { ...state.owned, items } : null };
  const reserved = new Map(reservations);
  if (!reservations) for (const line of lines) reserved.set(nameKey(line.nameEn), (reserved.get(nameKey(line.nameEn)) ?? 0) + line.count);
  const out = new Map<string, FoodHolding>();
  for (const line of lines) {
    if (!line.heals) continue;
    const primary = nameKey(line.nameEn);
    reserved.set(primary, Math.max(0, (reserved.get(primary) ?? 0) - (line.reservedCount ?? line.count)));
    const held = heldFood(pool, { ...line, heals: line.heals }, line.manualKey ?? line.key, hitpoints, reserved, true);
    out.set(line.key, held);
    let health = Math.max(0, line.count) * effectiveHeal({ heals: line.heals }, hitpoints);
    let primaryUsed = 0;
    // Carried food is allocated before banknotes/bank stock so two lines cannot both claim the same ready bag.
    for (const where of ['bag', 'noted', 'bank'] as const) {
      for (const part of held.parts) {
        if (health <= 0) break;
        const record = pool.owned?.items.get(nameKey(part.name));
        if (!record) continue;
        const take = Math.min(part.held[where] ?? 0, Math.ceil(health / part.heals));
        const field = where === 'bag' ? 'carried' : where;
        record[field] = Math.max(0, (record[field] ?? 0) - take);
        if (!part.alternative) primaryUsed += take;
        health = Math.max(0, health - take * part.heals);
      }
    }
    const manualKey = line.manualKey ?? line.key;
    if (pool.manual[manualKey] !== undefined) {
      const primaryHeld = held.parts.find(part => !part.alternative);
      const extra = primaryHeld?.held.source === 'manual'
        ? Math.min(Math.max(0, (primaryHeld.held.total ?? 0) - primaryUsed), Math.ceil(health / effectiveHeal({ heals: line.heals }, hitpoints))) : 0;
      pool.manual[manualKey] = Math.max(0, pool.manual[manualKey] - primaryUsed - extra);
    }
  }
  return out;
}

/** Ordinary single-bite food cannot heal beyond the missing HP of a living player. */
export function effectiveHeal(food: Pick<Food, 'heals'>, hitpoints?: number): number {
  return hitpoints === undefined ? food.heals : Math.min(food.heals, Math.max(1, hitpoints - 1));
}
interface FoodPart { name: string; heals: number; held: Held; alternative: boolean }
