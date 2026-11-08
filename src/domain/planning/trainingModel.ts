import { levelOf } from '../player/playerState';
import { xpForLevel } from '../player/xp';
import type { TrackedSkill } from '../training/skillTrack';
import type { CandidateAction, ExpectedEffect, Minutes, ObjectiveEvaluation, PlannerModel, PlanningSnapshot, Projection, ResourceChange } from './contracts';
import { noTime, totalCost } from './cost';
import { acceptsDecision } from './scope';
import { createTrainingCost, prerequisiteTraining } from './training';
import type { TrainingCandidate, TrainingOptions } from './training';

export interface TrainingModelAdapters {
  /** Current tactical action plus the whole goal's remaining acquisition/setup; repeated modelled bank cycles are already in training time. */
  prepare(candidate: TrainingCandidate, projection: Projection): {
    action: CandidateAction | null; minutes: Minutes | null; resources: readonly ResourceChange[] | null;
  };
  /** Initial/setup journeys only; never add the training engine's repeated bank cycles again. */
  travel(candidate: TrainingCandidate, projection: Projection): Minutes | null;
}

/** An explicit skill goal uses the same decision contract, preparation pipeline and training engine as quest prerequisites. */
export function createTrainingModel(snapshot: PlanningSnapshot, selection: TrackedSkill, adapters: TrainingModelAdapters,
  options: Omit<TrainingOptions, 'selection'> = {}): PlannerModel {
  const id = `training:${selection.skill}:${selection.target ?? 'checkpoint'}`;
  const candidate = prerequisiteTraining({ ...options, snapshot, goalId: id, skill: selection.skill, selection });
  const cost = createTrainingCost(snapshot, { ...options, selection });
  const cache = new WeakMap<Projection, ObjectiveEvaluation | null>();
  const valid = (p: Projection) => Boolean(p.scope && acceptsDecision(snapshot.scope, p.scope) && !p.invalidResources);
  const reached = (p: Projection) => candidate?.target != null && ((p.levels?.[selection.skill] ?? levelOf(snapshot.player, selection.skill) ?? -1) >= candidate.target
    || (p.xp[selection.skill] !== undefined && p.xp[selection.skill] >= xpForLevel(candidate.target)));
  function evaluate(objective: string, projection: Projection): ObjectiveEvaluation | null {
    if (objective !== id || !valid(projection) || !candidate || reached(projection)) return null;
    if (cache.has(projection)) return cache.get(projection)!;
    let result: ObjectiveEvaluation;
    if (!candidate.step || candidate.target === null) {
      result = { objectiveId: id, activeAction: candidate.action, effects: [], confidence: 'UNKNOWN', hardBlocked: false,
        cost: { prepare: null, travel: noTime(), work: noTime(), banking: noTime(), exchange: noTime(), switching: noTime() } };
    } else {
      const prepared = adapters.prepare(candidate, projection), travel = adapters.travel(candidate, projection);
      const work = cost(selection.skill, candidate.target, projection);
      const action = prepared.action ?? { ...candidate.action, feasibility: 'READY' as const };
      const waiting = action.kind === 'VERIFY' || action.kind === 'MANUAL_WAIT';
      const effects: ExpectedEffect[] = [{ kind: 'skill-floor', skill: selection.skill, level: candidate.target, afterSuccessOnly: true },
        ...(prepared.resources == null ? [{ kind: 'resources-unknown' as const, source: 'Shared training goal forecast', afterSuccessOnly: true as const }]
          : prepared.resources.map(change => ({ kind: 'resources' as const, change, afterSuccessOnly: true as const }))),
        // The whole goal's own consumption, after its acquisition: unmodelled consumption cannot leave balances to later objectives.
        ...(candidate.consumption ? [{ kind: 'resources' as const, change: candidate.consumption, afterSuccessOnly: true as const }]
          : prepared.resources === null ? [] : [{ kind: 'resources-unknown' as const, source: 'Training consumption is not modelled for this method', afterSuccessOnly: true as const }])];
      result = { objectiveId: id, activeAction: action, effects: waiting ? [] : effects,
        confidence: waiting ? 'UNKNOWN' : prepared.minutes && travel && work ? 'MEDIUM' : 'LOW', hardBlocked: false,
        cost: { prepare: waiting ? null : prepared.minutes, travel, work, banking: noTime(), exchange: noTime(), switching: noTime() } };
    }
    cache.set(projection, result);
    return result;
  }
  return { objectiveIds: candidate ? [id] : [], evaluate,
    remaining(projection) {
      if (!valid(projection)) return null;
      if (!candidate || reached(projection)) return noTime();
      const value = evaluate(id, projection);
      return value ? totalCost(value.cost) : null;
    } };
}
