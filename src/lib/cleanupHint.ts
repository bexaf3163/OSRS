// The inventory cleanup advice for the game (snapshot part "cleanup", plugin 2.61.0 and later): the lines to act on, in a few words, for the bank,
// merchant and exchange card and the guide's Advice tab. The plugin only shows them; it sells, drops and destroys nothing. Pure: built from the
// result of cleanupAdvice, the same advice the Shopping page shows.

import { OBSOLETE, type CleanupRec, type CleanupResult } from './cleanup';
import { clipText } from './prepEnvelope';

export type CleanupHintAction = 'sell' | 'drop' | 'destroy' | 'review';

export interface CleanupHintLine {
  name: string;
  /** The bag stack's item id (a banknote has its own): the plugin finds the slot by it and hides the line once the stack is gone. */
  id: number;
  qty: number;
  noted?: boolean;
  action: CleanupHintAction;
  /** A few words: "no use ahead", "its quest is done, no other use". */
  why: string;
  /** The estimated sale in gp, before the exchange tax; absent when there is no price. */
  proceeds?: number;
}

export interface CleanupHintPayload {
  /** The character the advice was made for: the plugin shows it only while that character is logged in. */
  player: string;
  lines: CleanupHintLine[];
}

/** As CleanupHint.MAX_LINES in the plugin. */
export const MAX_CLEANUP_LINES = 16;

function line(r: CleanupRec): CleanupHintLine {
  const action: CleanupHintAction = r.action === 'drop' ? (OBSOLETE[r.key]?.action ?? 'drop') : (r.action as CleanupHintAction);
  return {
    name: clipText(r.name, 60),
    id: r.id!,
    qty: Math.min(r.qty, 2_147_483_647),
    ...(r.noted ? { noted: true } : {}),
    action,
    why: clipText([r.priceLabel, r.short || r.reason].filter(Boolean).join(' · '), 60),
    ...(r.action === 'sell' && r.proceeds !== null && r.proceeds > 0 ? { proceeds: Math.round(r.proceeds) } : {}),
  };
}

/**
 * The part for the snapshot, or null: no character, nothing to act on. Lines without an item id are left out (the plugin could not tell whether the
 * item is still in the bag). Keep lines never go: the game shows only what can be done.
 */
export function cleanupHintPayload(result: CleanupResult, player: string | null | undefined): CleanupHintPayload | null {
  const who = (player ?? '').trim();
  if (!who) return null;
  const lines = result.recs
    .filter((r) => r.action !== 'keep' && r.id !== undefined && r.id > 0 && r.qty > 0)
    .slice(0, MAX_CLEANUP_LINES)
    .map(line);
  return lines.length ? { player: clipText(who, 30), lines } : null;
}
