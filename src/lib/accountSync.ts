// "Sync with the account": the game knows which quests are complete and which levels are reached, so the route steps
// with such an auto-tick can be closed at once, without waiting for the player to go through them with the plugin on.
// Steps where the auto-tick also needs items (a quest plus a bought Dragon scimitar) are left alone: a quest
// cannot tell that the item has been bought. A level goal is different: the levels prove the training was done,
// and the items listed with it (food, ore) are consumed or sold on the way, so they do not hold the step back.

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
    if (!t || (t.items?.length && t.type !== 'SKILL_LEVEL')) continue;
    if (t.type === 'QUEST_COMPLETED' && t.questName && done.has(questKey(t.questName))) {
      out.push({ step, why: `quest ${t.questName} complete` });
    } else if (t.type === 'SKILL_LEVEL' && levels && t.levels?.length && t.levels.every((l) => (levels[l.skill] ?? 0) >= l.level)) {
      out.push({ step, why: 'the required levels are already reached' });
    }
  }
  return out;
}

/**
 * Restoring a lost progress: a step the game confirms could only be reached through the steps it requires, so those
 * were done too — even the ones with no in-game signal. They come after the confirmed steps, in route order, and
 * only unclosed ones are returned.
 */
export function withRequired(steps: readonly Step[], confirmed: readonly SyncCandidate[], p: Progress): SyncCandidate[] {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const seen = new Set(confirmed.map((c) => c.step.id));
  const queue = confirmed.map((c) => c.step);
  const implied = new Map<string, SyncCandidate>();
  for (let step = queue.shift(); step; step = queue.shift()) {
    for (const id of step.requires) {
      const need = byId.get(id);
      if (!need || seen.has(id)) continue;
      seen.add(id);
      queue.push(need);
      if (!isClosed(p, id)) implied.set(id, { step: need, why: `required before ${step.id}, which the game confirms` });
    }
  }
  const order = new Map(steps.map((s, i) => [s.id, i]));
  return [...confirmed, ...[...implied.values()].sort((a, b) => (order.get(a.step.id) ?? 0) - (order.get(b.step.id) ?? 0))];
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
