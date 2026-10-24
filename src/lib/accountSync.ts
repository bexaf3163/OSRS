// Account sync only offers goals directly proved by current quest/level facts.
// Ownership and carryover goals need separate evidence and remain unverified here.

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
    if (!t || t.items?.length || (t.type === 'SKILL_LEVEL' && step.carryover?.length)) continue;
    const levelsMet = (goals: NonNullable<typeof t.levels>) => !!levels && goals.every(l =>
      Number.isFinite(levels[l.skill]) && levels[l.skill] >= l.level);
    if (t.type === 'QUEST_COMPLETED' && t.questName && done.has(questKey(t.questName))) {
      // A quest that also names a level (the lamp used on Prayer) is closed only when the level proves it.
      if (t.levels?.length && !levelsMet(t.levels)) continue;
      out.push({ step, why: `quest ${t.questName} complete` });
    } else if (t.type === 'SKILL_LEVEL' && t.levels?.length && levelsMet(t.levels)) {
      out.push({ step, why: 'the required levels are already reached' });
    }
  }
  return out;
}

/**
 * Steps BEFORE the furthest step that is closed or confirmed by the game and that the game can neither confirm nor deny:
 * no in-game signal (setting up the client, banking, buying) or only items (they were used or sold on the way). They are
 * offered separately and honestly labelled as unverified. A step whose quest or levels the game says are NOT done is never
 * offered: the game contradicts it.
 */
export function earlierUnverified(
  steps: readonly Step[],
  p: Progress,
  confirmed: readonly SyncCandidate[],
  questsDone: readonly string[] | null,
  levels: PlayerStats | null,
): SyncCandidate[] {
  if (questsDone === null) return [];
  const taken = new Set(confirmed.map((c) => c.step.id));
  let frontier = -1;
  steps.forEach((s, i) => { if (taken.has(s.id) || isClosed(p, s.id)) frontier = i; });
  const done = new Set(questsDone.map(questKey));
  const out: SyncCandidate[] = [];
  steps.forEach((step, i) => {
    if (i >= frontier || taken.has(step.id) || isClosed(p, step.id)) return;
    const t = step.inGame?.completionTrigger;
    if (t?.type === 'QUEST_COMPLETED' && t.questName && !done.has(questKey(t.questName))) return;
    if (t?.type === 'SKILL_LEVEL' && t.levels?.length && levels && !t.levels.every((l) => (levels[l.skill] ?? 0) >= l.level)) return;
    out.push({ step, why: 'the game has no signal for it, and you are already past it' });
  });
  return out;
}
