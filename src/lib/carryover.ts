// Route carryover: what a step keeps for a LATER step.
//
// Three different things were treated as one:
//   gameComplete  — the game says the objective is done (the quest is green, the level is reached);
//   routeComplete — the route step is closed (progress: done or skipped);
//   routeReady    — nothing the step was meant to leave behind for the route is missing.
// A step with carryover is game-complete before it is route-ready: Sheep Shearer is green, but the three balls of wool for Prince Ali Rescue
// are not in the bank yet. The auto-tick that goes to the game waits for them (the item condition goes on top of the quest, as it already may),
// and the step says why it is still open.

import type { CarryItem, CompletionTrigger, OwnedItem, Step } from '../types';
import { heldOf, type PlayerState } from './playerState';

export const carryoverOf = (step: Pick<Step, 'carryover'>): readonly CarryItem[] => step.carryover ?? [];

/** The auto-tick the game is given: the step's trigger and, on top of it, what must be kept. A trigger with "any of" is left alone. */
export function routeTrigger(step: Pick<Step, 'inGame' | 'carryover'>): CompletionTrigger | undefined {
  const t = step.inGame?.completionTrigger;
  const keep = carryoverOf(step);
  if (!t || !keep.length || t.anyOf) return t;
  if (t.type !== 'QUEST_COMPLETED' && t.type !== 'SKILL_LEVEL') return t;
  const have = new Set((t.items ?? []).flatMap((i) => i.names.map((n) => n.toLowerCase())));
  const extra: OwnedItem[] = keep.filter((c) => !have.has(c.item.toLowerCase())).map((c) => ({ names: [c.item], count: c.count }));
  return extra.length ? { ...t, items: [...(t.items ?? []), ...extra] } : t;
}

export type CarryState = 'OK' | 'MISSING' | 'UNKNOWN';

export interface CarryStatus {
  item: CarryItem;
  have: number | null;
  state: CarryState;
}

/** Each kept item against the player's state. Not seen is UNKNOWN: never "missing", because the bank may simply not have been opened. */
export function carryStatus(step: Pick<Step, 'carryover'>, state: Pick<PlayerState, 'owned' | 'equipment' | 'manual' | 'bankSeen'>): CarryStatus[] {
  return carryoverOf(step).map((item) => {
    const h = heldOf(state, item.item);
    if (h.presence === 'UNKNOWN') return { item, have: null, state: 'UNKNOWN' as const };
    const have = h.total ?? (h.bag ?? 0) + h.noted;
    return { item, have, state: have >= item.count ? ('OK' as const) : ('MISSING' as const) };
  });
}

/** What is still to be kept, as a short sentence for the step: null when there is nothing to keep or all of it is held. */
export function carryNote(statuses: readonly CarryStatus[]): string | null {
  const open = statuses.filter((s) => s.state !== 'OK');
  if (!open.length) return null;
  const names = open.map((s) => `${s.item.count > 1 ? `${s.item.count} × ` : ''}${s.item.item} (for ${s.item.forStep})`);
  const unknown = open.every((s) => s.state === 'UNKNOWN');
  return `${unknown ? 'Keep' : 'Still to keep'}: ${names.join(', ')}.`;
}
