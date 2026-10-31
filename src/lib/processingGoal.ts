// Aggregate the shared staged forecast; this does not select recipes, grant stock or finance future purchases.
import { nameKey } from './checklist';
import { xpForLevel } from './xp';
import { validConsumption } from './consumption';
import type { MethodNeed, PathLeg } from './trainingRouter';

type Item = Extract<MethodNeed, { type: 'item' }>;
const namesOf = (n: { name: string; anyOf?: string[] }) => [...new Set([n.name, ...n.anyOf ?? []].map(nameKey))].sort();
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

/** Conditional expected ingredients plus reusable kit, or null for incomplete/unsupported forecasts. */
export function processingGoalNeeds(path: readonly PathLeg[], level: number, target: number, xp = xpForLevel(level)): MethodNeed[] | null {
  if (!path.length || !Number.isInteger(level) || !Number.isInteger(target) || !Number.isFinite(xp) || level < 1 || target > 99 || level >= target || xp < xpForLevel(level) || xp >= xpForLevel(level + 1)) return null;
  const materials: Item[] = [], tools: Item[] = [];
  let end = level;
  for (const leg of path) {
    const { method } = leg;
    if (!Number.isInteger(leg.toLevel) || leg.fromLevel !== end || leg.toLevel <= end || leg.toLevel > target || !method.consumables?.length || !method.xpa || !Number.isFinite(method.xpa) || method.xpa <= 0) return null;
    const actions = leg.processingActions ?? (xpForLevel(leg.toLevel) - Math.max(xpForLevel(leg.fromLevel), xp)) / method.xpa;
    if (!Number.isFinite(actions) || actions <= 0) return null;
    const consumed = new Set(method.consumables.flatMap(namesOf));
    for (const input of method.consumables) {
      if (!validConsumption(input)) return null;
      materials.push({ type: 'item', name: input.name, count: Math.ceil(actions) * input.qty + (input.initialReserve ?? 0), ...(input.anyOf?.length ? { anyOf: [...input.anyOf] } : {}) });
    }
    for (const need of leg.needs ?? method.needs) {
      if (need.type !== 'item') continue;
      if (!namesOf(need).some(n => consumed.has(n))) tools.push(need);
    }
    end = leg.toLevel;
  }
  return end === target ? mergeGoalNeeds(materials, tools) : null;
}
