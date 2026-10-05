// Bag cleanup: what is in the bag that no step of the preparation window asks for, so it can stay in the bank and free slots.
// Slots, not weight (weight.ts already advises on heavy things): twenty-eight slots run out on quests with many items.
//
// Conservative on purpose. Unknown is not "nothing": without the bag from the game there is no advice. Money, food, runes, staffs, teleports and jewellery
// are never advised away (they are needed on the way even if no step names them), and neither is anything the plan names for this step or the nearest ones.
// The app only advises: it does not touch the bag.

import { nameKey } from './checklist';
import { FOODS } from './foodAdvice';
import type { PlayerState } from './playerState';
import { BAG_SLOTS, stacks, type PrepPlan } from './prepPlan';

const FOOD_KEYS = new Set(FOODS.map((f) => nameKey(f.name)));
/** Needed on the way though no step names them. */
const KEEP = /(^coins$|\brunes?\b|\bstaff\b|\bteleport\b|^chronicle$|\bring\b|\bamulet\b|\bnecklace\b|\bbracelet\b|\bcape\b|\bpouch\b)/i;

/** Advice shows up when the bag is tight or at least this many slots can be freed. */
export const MIN_SLOTS_TO_ADVISE = 3;
const MAX_LISTED = 8;

export interface CleanupItem {
  name: string;
  count: number;
  /** Bag slots it takes (a stack takes one). */
  slots: number;
  /** later: a later step asks for it, but not the nearest ones; unused: no step of the window names it. */
  reason: 'later' | 'unused';
}

export interface CleanupAdvice {
  items: CleanupItem[];
  /** Slots that would be freed by all the listed items. */
  slotsFreed: number;
  /** The things to take do not fit now: the advice is urgent. */
  tight: boolean;
}

export function bagCleanup(plan: Pick<PrepPlan, 'lines' | 'later' | 'slots'>, state: PlayerState): CleanupAdvice | null {
  if (!state.bagItems.known) return null;
  // Everything the nearest steps name, wherever the thing is now: nothing of it is advised away.
  const needed = new Set(plan.lines.filter((l) => !plan.later.some((x) => x.key === l.key)).map((l) => nameKey(l.name)));
  const later = new Set(plan.later.map((l) => nameKey(l.name)));
  const items: CleanupItem[] = [];
  for (const b of state.bagItems.value) {
    const key = nameKey(b.name);
    if (b.count <= 0 || needed.has(key) || KEEP.test(b.name) || FOOD_KEYS.has(key)) continue;
    items.push({ name: b.name, count: b.count, slots: stacks(b.name) ? 1 : b.count, reason: later.has(key) ? 'later' : 'unused' });
  }
  items.sort((a, b) => b.slots - a.slots || a.name.localeCompare(b.name));
  const slotsFreed = items.reduce((s, i) => s + i.slots, 0);
  const used = plan.slots.used;
  const tight = plan.slots.over > 0 || (used !== null && used + plan.slots.adding > BAG_SLOTS);
  if (!items.length || (!tight && slotsFreed < MIN_SLOTS_TO_ADVISE)) return null;
  return { items: items.slice(0, MAX_LISTED), slotsFreed, tight };
}

/** "Mithril scimitar ×2 (2 slots)" for one line of the advice. */
export function cleanupLine(i: CleanupItem): string {
  return `${i.name}${i.count > 1 ? ` ×${i.count}` : ''}${i.slots > 1 ? ` (${i.slots} slots)` : ''}${i.reason === 'later' ? ' — needed in a later step' : ''}`;
}
