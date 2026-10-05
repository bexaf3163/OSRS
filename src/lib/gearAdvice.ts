// The gear analysis for the screen: levels (from the game, which win over manual ones), what is worn, the bag and bank from RuneLite,
// Grand Exchange prices, whether the Al Kharid gate is free, what the route will still buy and who the step fights. The analysis itself is a
// pure function adviseGear; here is only the gathering of inputs.

import { useEffect, useMemo, useState } from 'react';
import type { Progress, Step } from '../types';
import { useStore } from '../store';
import { useBridge } from '../bridge';
import { isClosed } from './next-step';
import { getGePrice } from '../services/pricesApi';
import { adviseGear, gearData, routeNeeds, stepFoes, type AdvisorInput, type GearAdvice } from '../services/gearAdvisor';

/** The Grand Exchange prices of all gear items. The price service downloads them as one file and keeps them for 5 minutes. */
async function loadGearPrices(): Promise<Map<number, number>> {
  const rows = await Promise.all(gearData.items.filter((i) => i.tradeable).map(async (i) => [i.id, (await getGePrice(i.id))?.buyPrice] as const));
  return new Map(rows.filter((r): r is readonly [number, number] => typeof r[1] === 'number' && r[1] > 0));
}

/** Who to compare weapons against: a step with opponents uses its own; otherwise the nearest unfinished combat step; otherwise nobody (a cow). */
export function fightStepFor(steps: Step[], p: Progress, step?: Step | null): Step | null {
  if (step?.foes?.length) return step;
  return steps.find((s) => s.foes?.length && !isClosed(p, s.id)) ?? null;
}

/** Quests marked done on the way (a step's quest auto-tick): they unlock, for example, the Rune platebody. */
function questsDone(steps: Step[], p: Progress): Set<string> {
  return new Set(steps.flatMap((s) => {
    const t = s.inGame?.completionTrigger;
    return t?.type === 'QUEST_COMPLETED' && t.questName && p.steps[s.id] === 'done' ? [t.questName] : [];
  }));
}

/** Passage into Al Kharid is free after Prince Ali Rescue: by name, not by step code. */
function freeToll(steps: Step[], p: Progress): boolean {
  const quest = steps.find((s) => s.title === 'Prince Ali Rescue');
  return Boolean(quest && isClosed(p, quest.id));
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

export function useGearAdvice(step?: Step | null): GearAdviceView {
  const { progress, mode, steps } = useStore();
  const { gear, stats, owned } = useBridge();
  const [prices, setPrices] = useState<ReadonlyMap<number, number>>(new Map());
  const [pricesFailed, setPricesFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    loadGearPrices()
      .then((m) => { if (alive) { setPrices(m); setPricesFailed(false); } })
      .catch(() => { if (alive) setPricesFailed(true); });
    return () => { alive = false; };
  }, []);

  const fightStep = fightStepFor(steps, progress, step);
  const input = useMemo<AdvisorInput>(() => ({
    // Levels from the game win over manual ones: they are exact and fresh.
    levels: { ...progress.levels, ...(stats ?? {}) },
    gear,
    owned,
    mode,
    gePrices: prices,
    freeToll: freeToll(steps, progress),
    routeNeeds: routeNeeds(steps, (id) => isClosed(progress, id)),
    foes: fightStep ? stepFoes(fightStep) : [],
    questsDone: questsDone(steps, progress),
  }), [progress, stats, gear, owned, mode, prices, steps, fightStep]);
  const advice = useMemo(() => adviseGear(input), [input]);
  return { advice, input, fightStep, pricesReady: prices.size > 0, pricesFailed };
}
