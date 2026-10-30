// Aggregate the shared staged forecast; this does not select recipes, grant stock or finance future purchases.
import { nameKey } from './checklist';
import { xpForLevel } from './xp';
import type { MethodNeed, PathLeg } from './trainingRouter';

type Item = Extract<MethodNeed, { type: 'item' }>;
const namesOf = (n: { name: string; anyOf?: string[] }) => [...new Set([n.name, ...n.anyOf ?? []].map(nameKey))].sort();
const keyOf = (n: { name: string; anyOf?: string[]; equip?: boolean }) => JSON.stringify([!!n.equip, namesOf(n)]);

/** Conditional expected ingredients plus reusable kit, or null for incomplete/unsupported forecasts. */
export function processingGoalNeeds(path: readonly PathLeg[], level: number, target: number, xp = xpForLevel(level)): MethodNeed[] | null {
  if (!path.length || !Number.isInteger(level) || !Number.isInteger(target) || !Number.isFinite(xp) || level < 1 || target > 99 || level >= target || xp < xpForLevel(level) || xp >= xpForLevel(level + 1)) return null;
  const materials = new Map<string, Item>();
  const tools = new Map<string, Item>();
  let end = level;
  for (const leg of path) {
    const { method } = leg;
    if (!Number.isInteger(leg.toLevel) || leg.fromLevel !== end || leg.toLevel <= end || leg.toLevel > target || !method.consumables?.length || !method.xpa || !Number.isFinite(method.xpa) || method.xpa <= 0) return null;
    const actions = leg.processingActions ?? (xpForLevel(leg.toLevel) - Math.max(xpForLevel(leg.fromLevel), xp)) / method.xpa;
    if (!Number.isFinite(actions) || actions < 0) return null;
    const consumed = new Set(method.consumables.flatMap(namesOf));
    for (const input of method.consumables) {
      if (!Number.isFinite(input.qty) || input.qty <= 0) return null;
      const need: Item = { type: 'item', name: input.name, count: Math.ceil(actions) * input.qty, ...(input.anyOf?.length ? { anyOf: [...input.anyOf] } : {}) };
      const key = keyOf(need);
      const old = materials.get(key);
      materials.set(key, { ...need, count: (old?.count ?? 0) + need.count! });
    }
    for (const need of leg.needs ?? method.needs) {
      if (need.type !== 'item' || namesOf(need).some(n => consumed.has(n))) continue;
      const key = keyOf(need);
      const old = tools.get(key);
      tools.set(key, { ...need, count: Math.max(old?.count ?? 0, need.count ?? 1) });
    }
    end = leg.toLevel;
  }
  if (end !== target) return null;
  const result = [...tools.values(), ...materials.values()].map(n => ({ ...n, count: Math.ceil(n.count ?? 1) }));
  const allocated = new Set<string>();
  for (const need of result) {
    // Overlapping, non-identical alternatives need an allocation plan, not a guessed full-goal total.
    const names = namesOf(need);
    if (!Number.isSafeInteger(need.count) || need.count <= 0 || names.some(n => allocated.has(n))) return null;
    names.forEach(n => allocated.add(n));
  }
  return result;
}
