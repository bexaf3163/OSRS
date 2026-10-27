// "Food for combat": how hard the step's opponent hits and when to eat. The numbers come from the wiki (threats.json, build-threats): max hit,
// speed, food healing. The only thing of our own is the threshold rule: eat while HP has not dropped below two max hits.

import threatsJson from '../data/threats.json';
import type { GameMode, Step } from '../types';
import type { PriceView } from './funding/quotes';
import { supplyPrice } from './sourceRouter';
import { heldExact, type Held, type PlayerState } from './playerState';
import { nameKey, type OwnedItem } from './checklist';

export interface Hit { n: number; label: string }
export interface Threat { page: string; version?: string; hits: Hit[]; speedTicks: number; hitpoints: number; combat: number }
export interface Food { name: string; heals: number; members: boolean }

export const THREATS = threatsJson.threats as unknown as Record<string, Threat>;
export const FOODS = threatsJson.foods as Food[];

/** The names of the step's opponents: foes and threats; those with no wiki data (a cow) are skipped. */
export function threatKeys(step: Pick<Step, 'foes' | 'threats'>): string[] {
  return [...new Set([...(step.foes ?? []), ...(step.threats ?? [])])].filter((k) => THREATS[k]);
}

/**
 * The usual max hit: "unprotected" hits (dragonfire without a shield) are not counted in the threshold, they are
 * warned about separately in text. It also returns the strongest hit and a flag that it was excluded.
 */
export function typicalHit(t: Threat): { typical: number; worst: number; excluded: Hit | null } {
  const isUnprotected = (h: Hit) => /dragonfire/i.test(h.label) && !/with/i.test(h.label);
  const kept = t.hits.filter((h) => !isUnprotected(h));
  const typical = Math.max(...(kept.length ? kept : t.hits).map((h) => h.n));
  const worst = Math.max(...t.hits.map((h) => h.n));
  return { typical, worst, excluded: t.hits.find(isUnprotected) ?? null };
}

/** The strongest usual hit of the step's opponents for the HUD; 0 means the step has no opponents with wiki data. */
export function stepMaxHit(step: Pick<Step, 'foes' | 'threats'>): number {
  return Math.max(0, ...threatKeys(step).map((k) => typicalHit(THREATS[k]).typical));
}

export interface FoodView {
  key: string;
  threat: Threat;
  typical: number;
  worst: number;
  excluded: Hit | null;
  /** Seconds between hits. */
  everySeconds: number;
  /** Eat when health is below this. */
  eatBelow: number;
  /** How many max hits in a row the current health will take; null means health is unknown. */
  survives: number | null;
}

export function viewThreat(key: string, hp: number | undefined): FoodView {
  const threat = THREATS[key];
  const { typical, worst, excluded } = typicalHit(threat);
  return {
    key, threat, typical, worst, excluded,
    everySeconds: Math.round(threat.speedTicks * 0.6 * 10) / 10,
    eatBelow: typical * 2,
    survives: hp ? Math.max(0, Math.ceil(hp / typical) - 1) : null,
  };
}

/** Food from the bag by name (counting the quantity), the best healing on top. */
export function foodInBag(items: readonly { name: string; count?: number }[] | null, mode?: GameMode): { food: Food; count: number }[] {
  if (!items) return [];
  return FOODS.flatMap((f) => {
    if (mode && !foodAllowed(f, mode)) return [];
    const count = items.filter((i) => i.name === f.name).reduce((s, i) => s + (i.count ?? 1), 0);
    return count > 0 ? [{ food: f, count }] : [];
  }).sort((a, b) => b.food.heals - a.food.heals);
}

/** Unknown membership is never evidence that a food is usable. */
export function foodAllowed(food: Food, mode: GameMode): boolean {
  return food.members === false || (food.members === true && mode === 'members');
}

/** Ordinary single-bite food cannot heal beyond the missing HP of a living player. */
export function effectiveHeal(food: Pick<Food, 'heals'>, hitpoints?: number): number {
  return hitpoints === undefined ? food.heals : Math.min(food.heals, Math.max(1, hitpoints - 1));
}

/** Only explicit combat food may use edible alternatives; a quest ingredient stays an exact item. */
export interface FoodRequirement { nameEn: string; heals: number; anyOf?: readonly string[] }

interface FoodPart { name: string; heals: number; held: Held; alternative: boolean }
export interface FoodHolding extends Held { withYou: number | null; viaAlternatives: number; bankLower: number; parts: FoodPart[] }

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
  const sum = (where: 'bag' | 'bank' | 'total') => Math.floor(parts.reduce((n, p) => n + (p.held[where] ?? 0) * p.heals, 0) / unit);
  const bankKnown = parts.every(p => p.held.bank !== null);
  const anyBag = parts.some(p => p.held.bag !== null);
  const anyStock = parts.some(p => p.held.presence === 'PRESENT');
  const allMissing = parts.every(p => p.held.presence === 'MISSING');
  const total = sum('total');
  return {
    bag: anyBag ? sum('bag') : null,
    noted: Math.floor(parts.reduce((n, p) => n + p.held.noted * p.heals, 0) / unit),
    bank: bankKnown ? sum('bank') : null,
    total: anyStock || allMissing ? total : null,
    presence: anyStock ? 'PRESENT' : allMissing ? 'MISSING' : 'UNKNOWN',
    equipped: 0,
    source: parts.some(p => p.held.source === 'manual') ? 'manual' : parts.some(p => p.held.source === 'game') ? 'game' : 'none',
    withYou: anyBag ? Math.floor(parts.reduce((n, p) => n + ((p.held.bag ?? 0) + p.held.noted) * p.heals, 0) / unit) : null,
    viaAlternatives: Math.floor(parts.filter(p => p.alternative).reduce((n, p) => n + (p.held.total ?? 0) * p.heals, 0) / unit),
    bankLower: sum('bank'),
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

/** Eligible food that covers one max hit; priced choices rank by cost per effective HP, never by an invented free price. */
export function foodsCovering(hit: number, mode: GameMode = 'f2p', hitpoints?: number, prices?: PriceView | null): Food[] {
  return FOODS.filter((f) => foodAllowed(f, mode) && effectiveHeal(f, hitpoints) >= hit)
    .map((food) => ({ food, price: supplyPrice(food.name, prices, mode) }))
    .sort((a, b) => {
      if (a.price === null || b.price === null) return (a.price === null ? 1 : 0) - (b.price === null ? 1 : 0) || a.food.heals - b.food.heals;
      return a.price / effectiveHeal(a.food, hitpoints) - b.price / effectiveHeal(b.food, hitpoints) || a.food.heals - b.food.heals;
    }).map(({ food }) => food);
}
