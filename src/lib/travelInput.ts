// The planner's input from the app's state, in one place: the "How to get there" card and the one-line tip on the step read it, so they never disagree.

import type { GameMode, PlayerStats } from '../types';
import type { GearState } from '../services/runeliteBridge';
import { nameKey, type OwnedItem, type OwnedState } from './checklist';
import type { Point, TravelInput } from './travel';

/** What the bank holds, by name key: the planner looks for tablets there before it suggests buying them. */
export function bankCounts(items: Iterable<Pick<OwnedItem, 'name' | 'bank'>>): Map<string, number> {
  const out = new Map<string, number>();
  for (const i of items) if ((i.bank ?? 0) > 0) out.set(nameKey(i.name), i.bank!);
  return out;
}

export interface TravelInputSources {
  from: Point;
  to: Point;
  /** The levels typed by hand; the ones from the game go over them. */
  levels: Readonly<Record<string, number | undefined>>;
  stats: PlayerStats | null;
  gear: GearState | null;
  owned: OwnedState | null | undefined;
  priceOf?: (name: string) => number | undefined;
  mode: GameMode;
  homeCooldownSec?: number | null;
}

export function travelInputOf(s: TravelInputSources): TravelInput {
  const carried = s.gear && (s.gear.equipment || s.gear.inventory) ? [...(s.gear.equipment ?? []), ...(s.gear.inventory ?? [])] : null;
  return {
    from: s.from, to: s.to, levels: { ...s.levels, ...(s.stats ?? {}) }, carried, bankSeen: Boolean(s.owned?.bankSeen),
    bank: s.owned?.bankSeen ? bankCounts(s.owned.items.values()) : null,
    priceOf: s.priceOf, members: s.mode === 'members', homeCooldownSec: s.homeCooldownSec ?? null,
  };
}
