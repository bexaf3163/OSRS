// The exchange prices for the funding screens. One shared board (quoteStore.ts) serves every screen; a screen that does not need prices passes `false` and
// does not subscribe. A missing market quote stays missing; static guide prices never become runtime acquisition or profit estimates.

import { useMemo, useSyncExternalStore } from 'react';
import { buildPriceView, type BakedPrice, type PriceView } from '../../domain/market/quotes';
import { quoteStore } from '../../services/quoteStore';

const NO_PLANNING_FALLBACK: ReadonlyMap<string, BakedPrice> = new Map();

// A subscribe that is the same function every time (useSyncExternalStore resubscribes when it changes) and does nothing.
const idleSubscribe = () => () => undefined;

// Screens that ask within a minute of the same board get one view, so the training engine's rate cache (keyed by
// the view) serves the Skills goal and the training card together instead of rating every method twice.
const SHARE_MS = 60_000;
let shared: { board: unknown; mapping: unknown; at: number; view: PriceView } | null = null;

export function usePriceView(enabled: boolean): PriceView {
  const state = useSyncExternalStore(enabled ? quoteStore.subscribe : idleSubscribe, quoteStore.getState, quoteStore.getState);
  return useMemo(() => {
    const now = Date.now();
    if (shared?.board !== state.board || shared.mapping !== state.mapping || now - shared.at > SHARE_MS)
      shared = { board: state.board, mapping: state.mapping, at: now, view: buildPriceView({ board: state.board, mapping: state.mapping, baked: NO_PLANNING_FALLBACK, now }) };
    return shared.view;
  }, [state.board, state.mapping]);
}
