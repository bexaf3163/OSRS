import type { Step } from '../../types';
import type { QuestFact } from './catalogue';
import { questExecutionSteps } from './catalogue';
import type { CommittedDecision, PlannerModel, PlanningSnapshot } from './contracts';
import { noTime } from './cost';
import { decide } from './decision';
import type { PlanningIntent } from './intent';
import { createQuestModel } from './questModel';
import type { QuestModelAdapters } from './questModel';
import { createTrainingModel } from './trainingModel';
import type { TrainingModelAdapters } from './trainingModel';
import { createTrainingCost } from './training';
import type { TrainingOptions } from './training';

export interface PlannerInput {
  snapshot: PlanningSnapshot;
  /** null means the saved intent is unread/protected, never permission to silently select another objective. */
  intent: PlanningIntent | null;
  previous?: CommittedDecision | null;
  quests: { catalogue: readonly QuestFact[]; steps: readonly Step[]; adapters: Omit<QuestModelAdapters, 'training'> };
  training: { adapters: TrainingModelAdapters; options?: Omit<TrainingOptions, 'selection'> };
}

/** One deterministic entry point for automatic quest strategy and explicit owner goals. Pages never choose a competing model. */
export function planIntent(input: PlannerInput): CommittedDecision | null {
  const { snapshot, intent, previous } = input;
  if (!intent) return verify('saved-goal', 'Restore or confirm your saved goal before planning');
  if (intent.kind === 'training') return decide(snapshot,
    createTrainingModel(snapshot, intent.training, input.training.adapters, input.training.options), { previous });
  const available = input.quests.catalogue.filter(quest => snapshot.scope.mode === 'members' || !quest.members);
  if (!available.length) return verify('quest-data', 'Load verified quest data for the selected account mode');
  if (intent.kind === 'quest') {
    if (!available.some(quest => quest.id === intent.questId)) return verify('selected-quest', `Verify access and source data for ${intent.questId}`);
    if (snapshot.quests[intent.questId]?.state === 'COMPLETED') return null; // Keep the saved goal; no unrelated automatic fallback.
  }
  const steps = questExecutionSteps(input.quests.steps, available, snapshot.quests);
  const model = createQuestModel(snapshot, available, steps, { ...input.quests.adapters,
    training: createTrainingCost(snapshot, input.training.options) });
  return decide(snapshot, model, { previous, ...(intent.kind === 'quest' ? { lockedObjectiveId: intent.questId } : {}) });

  function verify(id: string, title: string): CommittedDecision | null {
    const model: PlannerModel = { objectiveIds: [id], remaining: () => null, evaluate: () => ({ objectiveId: id,
      activeAction: { id: `${id}:VERIFY`, kind: 'VERIFY', goalId: id, title, feasibility: 'UNKNOWN', prerequisites: [],
        completionEvidence: [{ source: 'Planning input', snapshotRevision: snapshot.scope.snapshotRevision, predicate: title }],
        expectedEffects: [], time: null, gpCost: null, sourceIds: ['planningIntent', 'questCatalogue'], reasons: [title] },
      effects: [], confidence: 'UNKNOWN', hardBlocked: false,
      cost: { prepare: null, work: noTime(), travel: noTime(), banking: noTime(), exchange: noTime(), switching: noTime() } }) };
    return decide(snapshot, model, { previous });
  }
}
