// The inventory cleanup advice for the bag the game reports now: one hook for the Shopping page card and for the game (CleanupSync), so both say
// the same thing. The engine is lib/cleanup.ts; prices and the tradeable list come from the exchange price service (cached there).

import { useEffect, useMemo, useState } from 'react';
import { useBridge } from '../bridge';
import { useStore } from '../store';
import { stepsFor } from '../data';
import { nameKey } from './checklist';
import { isClosed } from './next-step';
import { cleanupAdvice, type AccountKind, type CleanupPrefs, type CleanupResult } from './cleanup';
import { useCleanupPrefs } from './cleanupPrefs';
import { buildPriceBook, type PriceBook } from './priceBook';
import { useTradeRestriction } from './useTradeRestriction';
import { getAllPrices, getMapping } from '../services/pricesApi';
import type { GearItem } from '../services/runeliteBridge';

const NO_PRICES: PriceBook = { priceOf: () => undefined, source: 'baked', at: null };

export interface CleanupState {
  result: CleanupResult;
  prefs: CleanupPrefs;
  update: (f: (p: CleanupPrefs) => CleanupPrefs) => void;
  account: AccountKind | null;
  /** The game is connected and reported the bag: without it nothing is judged. */
  live: boolean;
  bag: GearItem[] | null;
  player: string | null;
}

export function useCleanupAdvice(): CleanupState {
  const { gear, player, accountType, state } = useBridge();
  const { progress, mode } = useStore();
  const trade = useTradeRestriction();
  const { prefs, update } = useCleanupPrefs(player ?? null);
  const [tradeable, setTradeable] = useState<Set<string> | null>(null);
  const [book, setBook] = useState<PriceBook>(NO_PRICES);

  useEffect(() => {
    let alive = true;
    Promise.all([getMapping(), getAllPrices()])
      .then(([mapping, live]) => {
        if (!alive) return;
        setTradeable(new Set([...mapping.values()].map((m) => nameKey(m.name))));
        setBook(buildPriceBook(live, mapping, new Map()));
      })
      .catch(() => { /* no network: nothing is known to be sellable, so nothing is advised for sale */ });
    return () => { alive = false; };
  }, []);

  const bag = gear?.inventory ?? null;
  const online = state === 'online';
  const account: AccountKind | null = accountType ?? prefs.account ?? null;
  const { openSteps, closedSteps } = useMemo(() => {
    const all = stepsFor(mode);
    return { openSteps: all.filter((s) => !isClosed(progress, s.id)), closedSteps: new Set(all.filter((s) => isClosed(progress, s.id)).map((s) => s.id)) };
  }, [mode, progress]);
  const result = useMemo(
    () => cleanupAdvice({
      bag: online && bag ? bag.map((b) => ({ id: b.id, name: b.name, count: b.count ?? 1, noted: b.noted })) : null,
      worn: (gear?.equipment ?? []).map((e) => e.name),
      openSteps, closedSteps,
      bankSeen: gear?.bankCoins !== null && gear?.bankCoins !== undefined,
      account,
      restriction: trade.state,
      price: (n) => book.priceOf(n) ?? null,
      tradeable: (n) => (tradeable ? tradeable.has(nameKey(n)) : null),
      prefs,
    }),
    [online, bag, gear?.equipment, gear?.bankCoins, openSteps, closedSteps, account, trade.state, book, tradeable, prefs],
  );
  return { result, prefs, update, account, live: online && !!bag, bag, player: player ?? null };
}
