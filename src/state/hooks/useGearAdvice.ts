// The gear advice for the screen: gathers levels, worn and bag items, GE prices and the route's purchases for the pure adviseGear.
import { useMemo } from 'react';
import type { Step } from '../../types';
import { useStore } from '../store';
import { useBridge } from '../bridge';
import { isClosed } from '../../domain/quests/next-step';
import { usePriceView } from './usePriceView';
import { adviseGear, routeNeeds, stepFoes, type AdvisorInput, type GearAdvice } from '../../domain/combat/gearAdvisor';
import { gearMarketPrices, fightStepFor, gearQuestEvidence, meleeHintApplies } from '../../domain/combat/gearAdvice';

export interface GearAdviceView {
  advice: GearAdvice;
  input: AdvisorInput;
  /** The step whose opponents are in the comparison (or null for a cow). */
  fightStep: Step | null;
  /** The Grand Exchange prices are loaded; if not, purchases at the exchange have no price and do not count as "affordable". */
  pricesReady: boolean;
  pricesFailed: boolean;
}

export function useGearAdvice(step?: Step | null, opts: { reserve?: number; reserveUnknown?: boolean; strictContext?: boolean } = {}): GearAdviceView {
  const { progress, mode, steps } = useStore();
  const { gear, stats, owned, questsDone } = useBridge();
  const board = usePriceView(true);
  const prices = useMemo(() => gearMarketPrices(board), [board]);

  const fightStep = opts.strictContext ? step && meleeHintApplies(step) && stepFoes(step).length ? step : null : fightStepFor(steps, progress, step);
  const input = useMemo<AdvisorInput>(() => ({
    // Levels from the game win over manual ones: they are exact and fresh.
    levels: { ...progress.levels, ...(stats ?? {}) },
    gear,
    owned,
    mode: step?.bondBranch ? 'f2p' : mode,
    geQuotes: prices,
    ...gearQuestEvidence(steps, progress, questsDone),
    routeNeeds: routeNeeds(steps, (id) => isClosed(progress, id)),
    foes: fightStep ? stepFoes(fightStep) : [],
    ...(opts.reserve ? { reserve: opts.reserve } : {}),
    ...(opts.reserveUnknown ? { reserveUnknown: true } : {}),
  }), [progress, stats, gear, owned, mode, prices, steps, fightStep, opts.reserve, opts.reserveUnknown, questsDone, step?.bondBranch]);
  const advice = useMemo(() => adviseGear(input), [input]);
  return { advice, input, fightStep, pricesReady: [...prices.values()].some(p => p.unit !== null), pricesFailed: board.status === 'offline' || board.status === 'baked' };
}
