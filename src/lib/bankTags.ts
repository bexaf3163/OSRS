// The stage's items for the bank: the OSRS Path Bridge plugin softly highlights them in the main RuneLite bank window
// (POST /bank-tags) while the stage's step is shown in the game. There is no separate tab and no import string: the highlight
// arrives by itself and changes with the stage, whereas a string would have to be copied and pasted again at every stage.

import type { GameMode, Step } from '../types';
import { itemById, stepsFor } from '../data';

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

/**
 * The stage's items for the bank: from all the stage's steps in the chosen mode, without repeats.
 * Members items are left out of F2P, by the wiki item database.
 */
export function stageBankItemIds(stage: number, mode: GameMode = 'f2p', steps: Step[] = stepsFor(mode)): number[] {
  const ids = uniqueIds(steps.filter((s) => s.stage === stage).flatMap(stepBankItemIds));
  return mode === 'members' ? ids : ids.filter((id) => itemById.get(id)?.members !== true);
}
