// The exchange prices for the funding screens. One shared board (quoteStore.ts) serves every screen; a screen that does not need prices passes `false` and
// does not subscribe. A missing market quote stays missing; static guide prices never become runtime acquisition or profit estimates.

import { useMemo, useSyncExternalStore } from 'react';
import { buildPriceView, type BakedPrice, type PriceView } from './quotes';
import { quoteStore } from './quoteStore';

const NO_PLANNING_FALLBACK: ReadonlyMap<string, BakedPrice> = new Map();

// A subscribe that is the same function every time (useSyncExternalStore resubscribes when it changes) and does nothing.
const idleSubscribe = () => () => undefined;

export function usePriceView(enabled: boolean): PriceView {
  const state = useSyncExternalStore(enabled ? quoteStore.subscribe : idleSubscribe, quoteStore.getState, quoteStore.getState);
  return useMemo(
    () => buildPriceView({ board: state.board, mapping: state.mapping, baked: NO_PLANNING_FALLBACK, now: Date.now() }),
    [state.board, state.mapping],
  );
}
