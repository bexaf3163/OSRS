// The drop rule (domain/market/dropUse) with this player's levels, skill goals and sale prices, for training cards and Money.
import { useCallback, useMemo } from 'react';
import type { MethodEvaluation } from '../../domain/economy/funding/evaluate';
import { nameKey } from '../../domain/items/itemKey';
import { dropUse, type DropUse } from '../../domain/market/dropUse';
import { dropValue } from '../../domain/market/lootValue';
import { isRestrictedItem } from '../../domain/market/tradeRestriction';
import { levelOf } from '../../domain/player/playerState';
import { usePlannerSkillGoals } from '../decision';
import { useTrackedTraining } from '../readinessContext';
import { usePlayerState } from '../playerStateContext';
import { usePriceView } from './usePriceView';
import { useTracked } from './useTracked';
import { useTradeRestriction } from './useTradeRestriction';

/** processing: evaluated Money methods; the best eligible processing method that takes the item is weighed against a raw sale. */
export function useDropAdvice(): (item: string, processing?: readonly MethodEvaluation[]) => DropUse {
  const { state } = usePlayerState();
  const goals = usePlannerSkillGoals();
  const tracked = useTracked();
  const trade = useTradeRestriction();
  const prices = usePriceView(true);
  const followed = useTrackedTraining()?.advice;
  const method = (followed?.followed ?? followed?.best)?.method;
  const usedUp = useMemo(() => new Set([...(method?.needs ?? []).filter((n) => n.type === 'item').map((n) => nameKey(n.name)),
    ...(method?.consumables ?? []).map((c) => nameKey(c.name))]), [method]);
  return useCallback((item: string, processing: readonly MethodEvaluation[] = []) => {
    const key = nameKey(item);
    const coinsEach = dropValue(item, prices, trade.state);
    const extras = processing.filter((e) => e.eligible && e.method.family === 'processing').flatMap((e) => {
      const input = e.method.inputs.find((f) => nameKey(f.item.name) === key);
      return input ? [{ title: e.method.title, extraEach: e.perUnit.net / input.qty + (prices?.buy(item)?.price ?? 0) - (coinsEach ?? 0) }] : [];
    });
    const processed = extras.sort((a, b) => b.extraEach - a.extraEach)[0];
    return dropUse(item, {
    level: (skill) => levelOf(state, skill) ?? null,
    goal: (skill) => goals.get(skill)?.level ?? (tracked?.skill === skill ? tracked.target ?? null : null),
    coinsEach,
    noSale: trade.state === 'RESTRICTED' && isRestrictedItem(item) ? 'restricted' : prices?.sell(item)?.price ? undefined : 'unpriced',
    processed,
    keepFor: method && usedUp.has(key) ? method.name[0].toLowerCase() + method.name.slice(1) : undefined,
    saleOf: (name) => dropValue(name, prices, trade.state),
    });
  }, [state, goals, tracked, trade.state, prices, method, usedUp]);
}
