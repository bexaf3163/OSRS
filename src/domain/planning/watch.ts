// The items the planner needs counted. The plugin reports only the names it is asked about, and an uncounted item stays
// UNKNOWN, so every open step's items go to the plugin; otherwise no quest beyond the current step could be costed.
import type { Step } from '../../types';
import type { Progress } from '../../types';
import { isClosed } from '../quests/next-step';

/** The plugin's limit on a counted list (ShoppingPlan.MAX_ITEMS). */
export const WATCH_MAX = 200;

/** The item names (and their accepted alternatives) of every open step, at most WATCH_MAX. */
export function decisionWatch(steps: readonly Step[], progress: Progress): string[] {
  const names = new Set<string>();
  for (const step of steps) {
    if (isClosed(progress, step.id)) continue;
    for (const item of step.itemsRequired ?? []) for (const name of [item.nameEn, ...(item.anyOf ?? [])]) if (name) names.add(name);
  }
  return [...names].slice(0, WATCH_MAX);
}
