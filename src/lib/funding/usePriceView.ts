// The exchange prices for the funding screens. One shared board (quoteStore.ts) serves every screen; a screen that does not need prices passes `false` and
// does not subscribe, so nothing is fetched for a step that costs no coins. The view reads the project database prices only while the board has nothing.

import { useMemo, useSyncExternalStore } from 'react';
import { items } from '../../data';
import { nameKey } from '../checklist';
import { buildPriceView, type BakedPrice, type PriceView } from './quotes';
import { quoteStore } from './quoteStore';

const BAKED = new Map<string, BakedPrice>(
  items.flatMap((i) => (i.gePrice ? [[nameKey(i.nameEn), { buy: i.gePrice.buyPrice, sell: i.gePrice.sellPrice }] as [string, BakedPrice]] : [])),
);

// A subscribe that is the same function every time (useSyncExternalStore resubscribes when it changes) and does nothing.
const idleSubscribe = () => () => undefined;

export function usePriceView(enabled: boolean): PriceView {
  const state = useSyncExternalStore(enabled ? quoteStore.subscribe : idleSubscribe, quoteStore.getState, quoteStore.getState);
  return useMemo(
    () => buildPriceView({ board: state.board, mapping: state.mapping, baked: BAKED, now: Date.now() }),
    [state.board, state.mapping],
  );
}
