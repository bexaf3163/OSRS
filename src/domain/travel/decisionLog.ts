// Detour decisions of the travel planner: to the caller's log, the debug sink and, with the debug switch, the console.
import { STORAGE_KEYS } from '../persistence/storageKeys';

/** Why a fetch-first suggestion was dropped (or kept with a caveat). The same reasons are used for the purchase detours in detours.ts. */
export type DetourRejection = 'exceeds_detour_limit' | 'insufficient_savings' | 'price_unknown' | 'missing_coins' | 'not_whitelisted' | 'price_too_high' | 'no_source';
export interface DetourDecision {
  /** What was judged: an item name, or the stop for a group of items. */
  subject: string;
  outcome: 'offered' | 'rejected';
  reason?: DetourRejection;
  /** An offered suggestion with a caveat: the price is unknown, or the coins in the bag do not cover it. */
  caveat?: 'price_unknown' | 'missing_coins';
  /** The numbers behind the verdict, in tiles unless said otherwise. */
  detail: Record<string, number | string | null>;
}
const decisionSink: { log: ((d: DetourDecision) => void) | null } = { log: null };
/** The debug sink: set it to see every verdict (tests, the developer console). */
export function setDetourLog(fn: ((d: DetourDecision) => void) | null): void {
  decisionSink.log = fn;
}
/** Record a verdict: to the caller's callback, to the debug sink, and to the console when localStorage STORAGE_KEYS.debugFetch is "1". */
export function emitDecision(d: DetourDecision, extra?: (d: DetourDecision) => void): void {
  extra?.(d);
  decisionSink.log?.(d);
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEYS.debugFetch) === '1') console.debug('[fetch-first]', JSON.stringify(d));
  } catch { /* no storage */ }
}
