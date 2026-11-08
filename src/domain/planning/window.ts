import type { Step } from '../../types';
import type { QuestFact } from './catalogue';
import { remainingQuestSteps } from './catalogue';
import type { CommittedDecision, PlanningSnapshot } from './contracts';
import { acceptsDecision } from './scope';

export const PLANNING_WINDOW_SIZE = 3;

/** Project the committed choice into current+next2 kits. Never take successors from the obsolete global route or rank again. */
export function planningWindow(input: {
  snapshot: PlanningSnapshot; decision: CommittedDecision; current: Step;
  catalogue: readonly QuestFact[]; steps: readonly Step[];
}): Step[] {
  const { snapshot, decision, current } = input;
  if (!acceptsDecision(snapshot.scope, decision) || decision.activeAction.stepId !== current.id) return [];
  const result = [current], byId = new Map(input.steps.map(step => [step.id, step]));
  const added = new Set<string>();
  const objectiveIds = [...new Set([decision.objectiveId, decision.followingObjectiveId].filter((id): id is string => id !== undefined))];
  for (const id of objectiveIds) {
    const quest = input.catalogue.find(quest => quest.id === id), evidence = snapshot.quests[id];
    if (!quest || !evidence || evidence.state === 'COMPLETED' || evidence.state === 'UNKNOWN'
      || (evidence.state === 'IN_PROGRESS' && (!evidence.stepId || !quest.stepIds.includes(evidence.stepId)))) continue;
    const remaining = remainingQuestSteps(quest, byId, evidence);
    // Missing authored content is not a licence to jump past it to another part.
    const at = evidence.state === 'IN_PROGRESS' ? quest.stepIds.indexOf(evidence.stepId!) : 0;
    if (remaining.length !== quest.stepIds.length - at) return result;
    if (id === decision.objectiveId && current.type === 'quest' && current.id !== remaining[0]?.id) return [];
    for (const step of remaining) {
      if (added.has(step.id)) continue;
      added.add(step.id);
      // A funding/preparation phase can reuse its parent quest ID with a different kit. Preserve both physical demands.
      if (step.id === current.id && step.type === current.type) continue;
      result.push(step);
      if (result.length === PLANNING_WINDOW_SIZE) return result;
    }
  }
  return result;
}
