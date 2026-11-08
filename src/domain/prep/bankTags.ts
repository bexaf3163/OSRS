// The road's items for the bank: the OSRS Path Bridge plugin softly highlights them in the main RuneLite bank window
// (POST /bank-tags, or the snapshot) while the step is shown in the game. The highlight follows the planner's road.

import type { GameMode, Step } from '../../types';
import { itemById } from '../../data';

/** IDs without repeats and junk, in the original order. */
export function uniqueIds(ids: Iterable<number>): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const id of ids) {
    if (Number.isInteger(id) && id > 0 && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** The step's items taken from the bank (not the ones handed out or picked up during the step). */
export function stepBankItemIds(step: Step): number[] {
  const items = [...(step.itemsRequired ?? []), ...(step.itemsRecommended ?? [])];
  return items.filter((i) => !i.inStep && i.wikiItemId).map((i) => i.wikiItemId!);
}

/** The items of the planner's road (the step in the game and the Decision's next steps) for the bank highlight; the old guide's
 * stage no longer chooses them (2.82.3). Members items are left out of F2P, by the wiki item database. */
export function roadBankItemIds(road: readonly Step[], mode: GameMode = 'f2p'): number[] {
  const ids = uniqueIds(road.flatMap(stepBankItemIds));
  return mode === 'members' ? ids : ids.filter((id) => itemById.get(id)?.members !== true);
}
