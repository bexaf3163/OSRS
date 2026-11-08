// Aggregate the shared staged forecast; this does not select recipes, grant stock or finance future purchases.
import { xpForLevel } from '../player/xp';
import { validConsumption, namesOf, mergeGoalNeeds, type Item } from '../items/consumption';
import type { MethodNeed, PathLeg } from './trainingRouter';

/** The whole goal's expected ingredients (consumed) and reusable kit (kept), or null for incomplete/unsupported forecasts. */
export function processingGoalFlows(path: readonly PathLeg[], level: number, target: number, xp = xpForLevel(level)): { materials: Item[]; tools: Item[] } | null {
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
  return end === target ? { materials, tools } : null;
}

/** Conditional expected ingredients plus reusable kit, or null for incomplete/unsupported forecasts. */
export function processingGoalNeeds(path: readonly PathLeg[], level: number, target: number, xp = xpForLevel(level)): MethodNeed[] | null {
  const flows = processingGoalFlows(path, level, target, xp);
  return flows ? mergeGoalNeeds(flows.materials, flows.tools) : null;
}
