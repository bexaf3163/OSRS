// The gear analysis for the screen: levels (from the game, which win over manual ones), what is worn, the bag and bank from RuneLite,
// Grand Exchange prices, whether the Al Kharid gate is free, what the route will still buy and who the step fights. The analysis itself is a
// pure function adviseGear; here is only the gathering of inputs.

import { useMemo } from 'react';
import type { Progress, Step } from '../types';
import { useStore } from '../store';
import { useBridge } from '../bridge';
import { isClosed, isCompleted, questDependencyFacts } from './next-step';
import { usePriceView } from './funding/usePriceView';
import type { PriceView } from './funding/quotes';
import { itemPrice, type ItemPrice } from './itemPrice';
import { adviseGear, gearData, routeNeeds, stepFoes, type AdvisorInput, type GearAdvice } from '../services/gearAdvisor';

/** Keep quote certainty with each canonical gear ID; database planning values are not acquisition quotes. */
export function gearMarketPrices(board: PriceView): ReadonlyMap<number, ItemPrice> {
  return new Map(gearData.items.filter(i => i.tradeable).map(i => [i.id, itemPrice(board, i.name, i.id, 1)]));
}

/** Who to compare weapons against: a step with opponents uses its own; otherwise the nearest unfinished combat step; otherwise nobody (a cow). */
export function fightStepFor(steps: Step[], p: Progress, step?: Step | null): Step | null {
  if (step?.foes?.length) return step;
  return steps.find((s) => s.foes?.length && !isClosed(p, s.id)) ?? null;
}

/** Training outside melee must not borrow an unrelated upgrade from the future melee comparison. */
export function meleeHintApplies(step: Step): boolean {
  const trigger = step.inGame?.completionTrigger;
  const skills = [step.styleGear, step.magicPlan ? 'magic' : undefined, step.pacing?.skill, step.followsMethod,
    ...(trigger?.type === 'SKILL_LEVEL' ? trigger.levels?.map(g => g.skill) ?? [] : [])];
  return !skills.some(skill => skill && !['attack', 'strength', 'defence', 'hitpoints', 'slayer'].includes(skill));
}

/** Quest evidence passed to the existing gear advisor and shop routing. */
export function gearQuestEvidence(steps: Step[], progress: Progress, liveQuests: readonly string[] | null): { questsDone: Set<string>; freeToll: boolean } {
  const fact = questDependencyFacts(steps, liveQuests);
  const done = new Set(liveQuests ?? []);
  for (const step of steps) {
    const trigger = step.inGame?.completionTrigger;
    if (trigger?.type === 'QUEST_COMPLETED' && trigger.questName && (fact(step.id) ?? isCompleted(progress, step.id))) {
      done.add(trigger.questName);
    }
  }
  return { questsDone: done, freeToll: done.has('Prince Ali Rescue') };
}

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
