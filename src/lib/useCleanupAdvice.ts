// The inventory cleanup advice for the bag the game reports now: one hook for the Shopping page card and for the game (CleanupSync), so both say
// the same thing. The engine is lib/cleanup.ts; prices and the tradeable list come from the exchange price service (cached there).

import { useMemo } from 'react';
import { useBridge } from '../bridge';
import { useReadinessEngine } from '../readinessContext';
import { useStore } from '../store';
import { usePlayerState } from '../playerStateContext';
import { protectionsFor } from './funding/snapshot';
import { stepsFor } from '../data';
import { isClosed, isCompleted, questDependencyFacts } from './next-step';
import { cleanupAdvice, type AccountKind, type CleanupPrefs, type CleanupResult } from './cleanup';
import { useCleanupPrefs } from './cleanupPrefs';
import { buildPriceBook } from './priceBook';
import { usePriceView } from './funding/usePriceView';
import { findLocalItem } from '../services/wikiService';
import { useTradeRestriction } from './useTradeRestriction';
import type { GearItem } from '../services/runeliteBridge';

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

export function useCleanupAdvice(enabled = true): CleanupState {
  const { state: playerState } = usePlayerState();
  const { gear, player, accountType, state, questsDone } = useBridge();
  const { progress, mode } = useStore();
  const steps = useReadinessEngine().ctx.steps;
  const trade = useTradeRestriction();
  const { prefs, update } = useCleanupPrefs(player ?? null);
  const board = usePriceView(enabled && state === 'online' && gear?.inventory !== null);
  const book = useMemo(() => buildPriceBook(board, name => findLocalItem(name)?.id), [board]);

  const bag = gear?.inventory ?? null;
  const online = state === 'online';
  const account: AccountKind | null = accountType ?? prefs.account ?? null;
  const { openSteps, closedSteps } = useMemo(() => {
    if (!enabled) return { openSteps: [], closedSteps: new Set<string>() };
    const selected = new Map(steps.map(s => [s.id, s]));
    // Runtime training steps reserve their kit too; a funding detour must not sell the equipment it is preparing.
    const all = [...new Map([...stepsFor(mode), ...selected.values()].map(s => [s.id, s])).values()];
    const fact = questDependencyFacts(all, questsDone);
    return { openSteps: all.filter((s) => !isClosed(progress, s.id)), closedSteps: new Set(all.filter((s) => fact(s.id) ?? isCompleted(progress, s.id)).map((s) => s.id)) };
  }, [enabled, mode, progress, steps, questsDone]);
  const reserves = useMemo(() => enabled ? protectionsFor(openSteps, playerState) : new Map(), [enabled, openSteps, playerState]);
  const result = useMemo(
    () => cleanupAdvice({
      bag: enabled && online && bag ? bag.map((b) => ({ id: b.id, name: b.name, count: b.count ?? 1, noted: b.noted })) : null,
      worn: (gear?.equipment ?? []).map((e) => e.name),
      openSteps, closedSteps, reserves,
      bankSeen: gear?.bankCoins !== null && gear?.bankCoins !== undefined,
      account,
      restriction: trade.state,
      price: (n) => book.priceOf(n) ?? null,
      priceLabel: n => book.quoteOf(n).label,
      tradeable: n => board.idOf(n) !== undefined || findLocalItem(n)?.gePrice ? true : null,
      prefs,
    }),
    [enabled, online, bag, gear?.equipment, gear?.bankCoins, openSteps, closedSteps, reserves, account, trade.state, book, board, prefs],
  );
  return { result, prefs, update, account, live: enabled && online && !!bag, bag, player: player ?? null };
}
