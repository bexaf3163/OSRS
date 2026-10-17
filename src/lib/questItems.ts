// The items a quest's own steps check for (Quest Helper's requirements in src/data/questMachines.json): a quest still open in the route
// needs them even when no shopping list names them, such as the relic, key or doll it hands over mid-quest.

import machinesRaw from '../data/questMachines.json';
import type { Step } from '../types';
import { nameKey } from './checklist';

interface Req { o?: string; nm?: string; ids?: number[] }

/** By route step id: the item ids and name keys its quest checks for. */
const BY_STEP: ReadonlyMap<string, { ids: ReadonlySet<number>; keys: ReadonlySet<string> }> = new Map(
  Object.entries((machinesRaw as unknown as { quests: Record<string, { reqs?: Record<string, Req> }> }).quests).map(([stepId, q]) => {
    const items = Object.values(q.reqs ?? {}).filter((r) => r.o === 'item');
    return [stepId, { ids: new Set(items.flatMap((r) => r.ids ?? [])), keys: new Set(items.flatMap((r) => (r.nm ? [nameKey(r.nm)] : []))) }];
  }),
);

/** The first of the open steps whose quest checks for the item (by id, else by name), or null. */
export function questUsing(openSteps: readonly Step[], item: { id?: number; name: string }): Step | null {
  const key = nameKey(item.name);
  return openSteps.find((s) => {
    const q = BY_STEP.get(s.id);
    return Boolean(q && ((item.id !== undefined && q.ids.has(item.id)) || q.keys.has(key)));
  }) ?? null;
}

/** The name keys of everything the steps' quests check for. */
export function questItemKeys(steps: readonly Step[]): string[] {
  return steps.flatMap((s) => [...(BY_STEP.get(s.id)?.keys ?? [])]);
}
