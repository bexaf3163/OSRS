// Which route step a quest is counted at: the step whose in-game completion trigger names that quest. The one resolver for every feature that
// speaks of a quest by name (cleanup after a quest, quest-gated training spots, gear requirements), so no feature keeps its own quest -> step table.

import type { Step } from '../types';

/** The step where a quest is counted (the auto-tick QUEST_COMPLETED by the quest name). */
export function questStepOf(steps: readonly Step[], quest: string): Step | undefined {
  return steps.find((s) => s.inGame?.completionTrigger?.type === 'QUEST_COMPLETED' && s.inGame.completionTrigger.questName === quest);
}
