// Pure inputs of the gear advice: GE prices per gear ID, the fight step to compare against, melee hint scope and quest evidence.
// The hook that gathers them for the screen is src/state/hooks/useGearAdvice.ts.

import type { Progress, Step } from '../../types';
import { isClosed, isCompleted, questDependencyFacts } from '../quests/next-step';
import type { PriceView } from '../market/quotes';
import { itemPrice, type ItemPrice } from '../market/itemPrice';
import { gearData } from './gearAdvisor';

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
  const skills = [step.pacing?.skill, step.followsMethod,
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
