import { nameKey } from './itemKey';
import type { MethodNeed } from '../training/trainingRouter';

/** Expected input use and a one-time allowance for an unread partially used first unit. */
export interface Consumption { qty: number; initialReserve?: number }

export function validConsumption(input: Consumption): boolean {
  return Number.isFinite(input.qty) && input.qty > 0 && Number.isFinite(input.initialReserve ?? 0)
    && (input.initialReserve ?? 0) >= 0 && (input.initialReserve ?? 0) < 1;
}

/** Actual item requirements are whole units; average prices still use qty per action. */
export function quantityForActions(input: Consumption, actions: number): number {
  return actions > 0 ? Math.ceil(actions * input.qty + (input.initialReserve ?? 0)) : 0;
}

/** Confirm only actions supported even if the first observed unit has minimal uses left. */
export function actionsForQuantity(input: Consumption, count: number): number {
  if (!validConsumption(input) || !Number.isFinite(count) || count <= 0) return 0;
  const actions = Math.max(0, Math.floor((count - (input.initialReserve ?? 0)) / input.qty));
  // Recover a boundary lost to fractional floating-point subtraction, checked against physical stock.
  if (quantityForActions(input, actions) > count) return Math.max(0, actions - 1);
  return quantityForActions(input, actions + 1) <= count ? actions + 1 : actions;
}

export const namesOf = (n: { name: string; anyOf?: string[] }) => [...new Set([n.name, ...n.anyOf ?? []].map(nameKey))].sort();
const keyOf = (n: { name: string; anyOf?: string[]; equip?: boolean }) => JSON.stringify([!!n.equip, namesOf(n)]);
/** Shared aggregation: consumed stacks add, reusable kit and preparation buffers use their maximum. */
export function mergeGoalNeeds(materials: readonly Item[], kit: readonly Item[], buffers: readonly Item[] = []): MethodNeed[] | null {
  const consumed = new Map<string, Item>();
  const reusable = new Map<string, Item>();
  for (const need of materials) {
    if (!Number.isFinite(need.count) || need.count! < 0) return null;
    const key = keyOf(need), old = consumed.get(key);
    consumed.set(key, { ...need, count: (old?.count ?? 0) + need.count! });
  }
  for (const need of buffers) {
    if (!Number.isFinite(need.count ?? 1) || (need.count ?? 1) <= 0) return null;
    const key = keyOf({ ...need, equip: false }), old = consumed.get(key);
    if (old) consumed.set(key, { ...old, count: Math.max(old.count ?? 0, need.count ?? 1) });
  }
  for (const need of kit) {
    if (!Number.isFinite(need.count ?? 1) || (need.count ?? 1) <= 0) return null;
    const key = keyOf(need), old = reusable.get(key);
    reusable.set(key, { ...need, count: Math.max(old?.count ?? 0, need.count ?? 1) });
  }
  const result = [...reusable.values(), ...consumed.values()].filter(n => n.count! > 0).map(n => ({ ...n, count: Math.ceil(n.count!) }));
  const allocated = new Set<string>();
  for (const need of result) {
    const names = namesOf(need);
    if (!Number.isSafeInteger(need.count) || names.some(n => allocated.has(n))) return null;
    names.forEach(n => allocated.add(n));
  }
  return result;
}

export type Item = Extract<MethodNeed, { type: 'item' }>;
