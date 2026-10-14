import { useMemo } from 'react';
import { useBridge } from '../bridge';
import { useStore } from '../store';
import { totalLevelOf, tradeRestriction, type TradeRestriction } from './tradeRestriction';

/**
 * Whether a new account's Grand Exchange sale restrictions still apply: from the game's quest points and total level (the total also from the levels
 * of the game and the profile, when all of them are known); the player's word (progress.sellRestrictions) wins over both.
 */
export function useTradeRestriction(): TradeRestriction {
  const { questPoints, totalLevel, stats } = useBridge();
  const { progress } = useStore();
  const override = progress.sellRestrictions;
  const levels = progress.levels;
  return useMemo(
    () => tradeRestriction({
      questPoints,
      totalLevel: totalLevel ?? totalLevelOf({ ...levels, ...(stats ?? {}) }),
      override,
    }),
    [questPoints, totalLevel, stats, override, levels],
  );
}
