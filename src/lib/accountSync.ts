// "Sync with the account": the game knows which quests are complete and which levels are reached, so the route steps
// with such an auto-tick can be closed at once, without waiting for the player to go through them with the plugin on.
// Steps where the auto-tick also needs items (a quest plus a bought Dragon scimitar) are left alone: a quest
// cannot tell that the item has been bought.

import type { PlayerStats, Progress, Step } from '../types';
import { isClosed } from './next-step';

export interface SyncCandidate {
  step: Step;
  /** Why it can be ticked: "quest complete", "all levels reached". */
  why: string;
}

/** The quest name as a comparison key: case, apostrophes and punctuation do not matter. */
export const questKey = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '');

export function syncCandidates(steps: readonly Step[], p: Progress, questsDone: readonly string[] | null, levels: PlayerStats | null): SyncCandidate[] {
  const done = new Set((questsDone ?? []).map(questKey));
  const out: SyncCandidate[] = [];
  for (const step of steps) {
    if (isClosed(p, step.id)) continue;
    const t = step.inGame?.completionTrigger;
    if (!t || t.items?.length) continue;
    if (t.type === 'QUEST_COMPLETED' && t.questName && done.has(questKey(t.questName))) {
      out.push({ step, why: `quest ${t.questName} complete` });
    } else if (t.type === 'SKILL_LEVEL' && levels && t.levels?.length && t.levels.every((l) => (levels[l.skill] ?? 0) >= l.level)) {
      out.push({ step, why: 'the required levels are already reached' });
    }
  }
  return out;
}
