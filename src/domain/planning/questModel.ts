import type { Step } from '../../types';
import type { QuestFact } from './catalogue';
import { canSupplyQuestDelivery, projectedQuestPoints, questSkillTargets, remainingQuestSteps } from './catalogue';
import type { ActionCost, CandidateAction, CostExpression, ExpectedEffect, Minutes, ObjectiveEvaluation, PlannerModel, PlanningSnapshot, Projection, QuestEvidence, ResourceChange } from './contracts';
import { noTime, sumExpressions, sumMinutes } from './cost';
import { xpForLevel } from '../player/xp';
import { levelOf } from '../player/playerState';
import { prerequisiteFrontier, questGraph } from './questGraph';
import { acceptsDecision } from './scope';
import { questManualProof } from '../quests/questCursor';

export interface QuestModelAdapters {
  /** Shared pipeline: one current subaction plus ALL remaining non-training preparation time for this quest. */
  prepare(step: Step, goal: QuestFact, snapshot: PlanningSnapshot, projection: Projection): {
    action: CandidateAction | null; minutes: Minutes | null;
    capabilities: Readonly<Record<string, 'met' | 'missing' | 'unknown'>>;
    /** Full physical flow: null is unmodelled; [] explicitly proves no flow. Direct quest cash follows these costs; nothing is observed success. */
    resources: readonly ResourceChange[] | null;
    executionStep?: Step;
    reasons?: readonly string[];
    uncertain?: boolean;
  };
  /** Remaining quest work and actual route cost are separate, each included once. Unknown remains null. */
  work(step: Step, goal: QuestFact, projection: Projection): Minutes | null;
  /** Source-backed, order-independent work only. Unknown combat/recovery time must not be labelled constant. */
  sharedUnmeasuredWork?(step: Step, goal: QuestFact): string | null;
  travel(step: Step, goal: QuestFact, projection: Projection): Minutes | null;
  /** Existing training estimator at observed stats, with hypothetical XP kept in the cost branch only. */
  training(skill: string, target: number, projection: Projection): Minutes | null;
  /** One joint stock/budget allocation for the remaining goals, including procurement and bank/GE cycles, excluding training. */
  remainingPreparation(goals: readonly QuestFact[], projection: Projection): Minutes | null;
  /** One quest's preparation from the current facts alone (not the projection). When present it replaces the joint term per quest. */
  preparationOf?(goal: QuestFact): Minutes | null;
}

function effectsOf(quest: QuestFact): ExpectedEffect[] {
  const coins = quest.rewards.coins;
  return [{ kind: 'quest', questId: quest.id, afterSuccessOnly: true },
    ...Object.entries(quest.rewards.xp).map(([skill, amount]) => ({ kind: 'xp' as const, skill, amount, afterSuccessOnly: true as const })),
    ...(coins != null && Number.isSafeInteger(coins) && coins > 0 ? [{ kind: 'resources' as const, afterSuccessOnly: true as const,
      change: { items: [], gp: coins, source: quest.source.url } }] : [])];
}

/** Generate quest and prerequisite candidates from facts; authored array positions never rank objectives. */
export function createQuestModel(snapshot: PlanningSnapshot, catalogue: readonly QuestFact[], steps: readonly Step[], adapters: QuestModelAdapters): PlannerModel {
  const facts = catalogue.filter(q => snapshot.scope.mode === 'members' || !q.members);
  const graph = questGraph(facts.map(q => ({ id: q.id, requires: q.requirements.quests })));
  const byId = new Map(facts.map(q => [q.id, q])), byStep = new Map(steps.map(step => [step.id, step]));
  // Projection objects are immutable search branches; identity avoids serializing the entire bank per candidate.
  const cache = new WeakMap<Projection, Map<string, ObjectiveEvaluation | null>>();
  const remainingCache = new WeakMap<Projection, CostExpression | null>();
  const branchIds = new WeakMap<Projection, number>();
  let sequence = 0;
  function branch(p: Projection) {
    if (!branchIds.has(p)) branchIds.set(p, ++sequence);
    return branchIds.get(p)!;
  }
  const term = (time: Minutes | null, key: string): CostExpression => ({ known: time ?? noTime(), unresolved: time ? [] : [key] });
  const workKey = (quest: QuestFact, projection: Projection, step?: Step) => {
    const shared = step && adapters.sharedUnmeasuredWork?.(step, quest);
    return shared ? `shared-quest-work:${quest.id}:${step.id}:${shared}` : `quest-work:${quest.id}:branch${branch(projection)}`;
  };
  const level = (p: Projection, skill: string) => Math.max(p.levels?.[skill] ?? -1, levelOf(snapshot.player, skill) ?? -1);
  const points = (p: Projection) => projectedQuestPoints(snapshot, p, facts);

  function checkAction(quest: QuestFact, kind: 'VERIFY' | 'MANUAL_WAIT', title: string, predicate: string, stepId?: string): CandidateAction {
    return { id: `${quest.id}:${kind}:${predicate}`, goalId: quest.id, kind, title, feasibility: kind === 'VERIFY' ? 'UNKNOWN' : 'PREP_REQUIRED', ...(stepId ? { stepId } : {}),
      prerequisites: [], completionEvidence: [{ source: quest.source.url, snapshotRevision: snapshot.scope.snapshotRevision, predicate }],
      expectedEffects: [], time: null, gpCost: null, sourceIds: [quest.source.url], reasons: [title] };
  }
  const emptyCost = (): ActionCost => ({ prepare: noTime(), travel: noTime(), work: noTime(), banking: noTime(), exchange: noTime(), switching: noTime() });
  function check(quest: QuestFact, kind: 'VERIFY' | 'MANUAL_WAIT', title: string, predicate: string, stepId?: string): ObjectiveEvaluation {
    return { objectiveId: quest.id, activeAction: checkAction(quest, kind, title, predicate, stepId), cost: { ...emptyCost(), work: null },
      effects: [], confidence: 'UNKNOWN', hardBlocked: false };
  }
  /** The quest's manual requirements (Shield of Arrav's partner) neither confirmed by the player nor proven by the current stage. */
  const unconfirmed = (quest: QuestFact, evidence: QuestEvidence) => (quest.requirements.manual ?? []).filter(key => snapshot.manual[`${quest.id}:${key}`] !== true
    && !(snapshot.player.connected && evidence.state === 'IN_PROGRESS' && evidence.stepId && byStep.has(evidence.stepId)
      && questManualProof(byStep.get(evidence.stepId)!, key, snapshot.instruction ?? null, snapshot.combat?.gear?.inventory ?? null)));
  function evaluate(id: string, projection: Projection): ObjectiveEvaluation | null {
    if (!projection.scope || !acceptsDecision(snapshot.scope, projection.scope)) return null;
    const cached = cache.get(projection);
    if (cached?.has(id)) return cached.get(id)!;
    const quest = byId.get(id);
    if (!quest || projection.completed.has(id) || projection.invalidResources) return null;
    const evidence = snapshot.quests[id];
    let result: ObjectiveEvaluation;
    if (!evidence || evidence.state === 'UNKNOWN') {
      result = check(quest, 'VERIFY', `Read ${quest.id} in the quest journal`, `Quest state for ${quest.id} is verified`);
    } else if (evidence.state === 'IN_PROGRESS' && !evidence.stepId) {
      // A one-step quest's check points the game at that step: the plugin reads the stage there (questStages var) and the check resolves.
      result = check(quest, 'VERIFY', `Verify the current stage of ${quest.id}`, `Validated stage evidence for ${quest.id}`,
        quest.stepIds.length === 1 ? quest.stepIds[0] : undefined);
    } else if (evidence.state === 'IN_PROGRESS' && quest.resourceFlow?.partialDelivery && !canSupplyQuestDelivery(quest, snapshot.player)) {
      result = check(quest, 'VERIFY', `Verify the remaining deliveries for ${quest.id}`, 'Observed remaining hand-in quantity; never repurchase an unknown full delivery');
    } else if (quest.requirements.unparsed) {
      result = check(quest, 'VERIFY', `Review the source prerequisites of ${quest.id}`, 'Unmodelled source requirement verified');
    } else if (unconfirmed(quest, evidence).length) {
      result = check(quest, 'MANUAL_WAIT', `Confirm the ${unconfirmed(quest, evidence).join(' and ')} for ${quest.id}`, 'Manual quest requirement confirmed');
    } else if (quest.requirements.quests.some(id => !projection.completed.has(id))) {
      // Predecessors are their own macro candidates. No route mark or skip proves a quest prerequisite.
      const frontier = prerequisiteFrontier(graph, id, projection.completed);
      result = check(quest, 'MANUAL_WAIT', `Complete ${frontier.join(', ')} first`, `Quest prerequisites of ${id} completed`);
    } else if (quest.requirements.questPoints && !snapshot.questPoints.known) {
      result = check(quest, 'VERIFY', 'Read your quest points', 'Observed quest-point total');
    } else if (points(projection) !== null && quest.requirements.questPoints > points(projection)!) {
      result = check(quest, 'MANUAL_WAIT', `More quest points are needed for ${id}`, `Quest points >= ${quest.requirements.questPoints}`);
    } else {
      const at = evidence.stepId ? quest.stepIds.indexOf(evidence.stepId) : 0;
      const remaining = at < 0 ? [] : quest.stepIds.slice(at);
      const step = byStep.get(remaining[0]);
      result = step && remaining.every(id => byStep.has(id)) ? evaluateStep(quest, step, projection)
        : check(quest, 'VERIFY', 'The authored quest stage needs review', `Execution content for ${id} is available`);
    }
    const evaluations = cached ?? new Map<string, ObjectiveEvaluation | null>();
    evaluations.set(id, result);
    cache.set(projection, evaluations);
    return result;
  }

  function evaluateStep(quest: QuestFact, step: Step, projection: Projection): ObjectiveEvaluation {
    const targets = questSkillTargets(quest, remainingQuestSteps(quest, byStep, snapshot.quests[quest.id]));
    const hardTargets = { ...quest.requirements.skills };
    for (const skill of Object.keys(hardTargets)) {
      const declarations = step.requirements?.filter(r => r.type === 'skill' && r.skill === skill) ?? [];
      if (declarations.length && declarations.every(r => r.type === 'skill' && r.when === 'during')) delete hardTargets[skill];
    }
    for (const requirement of step.requirements ?? []) if (requirement.type === 'skill' && requirement.when !== 'during') {
      hardTargets[requirement.skill] = Math.max(hardTargets[requirement.skill] ?? 0, requirement.min);
    }
    const unknownSkill = Object.keys(hardTargets).find(skill => levelOf(snapshot.player, skill) === undefined);
    if (unknownSkill) return check(quest, 'VERIFY', `Read your ${unknownSkill} level`, `Observed ${unknownSkill} level`);
    const training = Object.entries(targets).map(([skill, target]) => {
      const current = projection.xp[skill];
      const met = level(projection, skill) >= target || (current !== undefined && current >= xpForLevel(target));
      return met ? noTime() : adapters.training(skill, target, projection);
    });
    const prepared = adapters.prepare(step, quest, snapshot, projection);
    const unchecked = quest.requirements.capabilities?.find(key => prepared.capabilities[key] !== 'met');
    if (unchecked && !prepared.action) return check(quest, 'VERIFY', `Verify ${unchecked} readiness for ${quest.id}`, `${unchecked} capability verified`);
    const missingSkills = Object.entries(hardTargets).filter(([skill, target]) => level(projection, skill) < target
      && (projection.xp[skill] === undefined || projection.xp[skill] < xpForLevel(target)));
    if (missingSkills.length && !prepared.action) return check(quest, 'VERIFY', `Prepare ${missingSkills.map(([skill, target]) => `${skill} ${target}`).join(', ')}`, 'A supported prerequisite training action is available');
    // Preparation may start while a capability is unverified, but its time is then unknown (the fight may need training), never cheap.
    const work = adapters.work(step, quest, projection), travel = adapters.travel(step, quest, projection), prepare = unchecked ? null : sumMinutes([prepared.minutes, ...training]);
    const action = prepared.action ?? {
      id: `${quest.id}:QUEST:${step.id}`, kind: 'QUEST' as const, goalId: quest.id, title: step.title, stepId: step.id,
      ...(prepared.executionStep ? { executionStep: prepared.executionStep } : {}),
      feasibility: 'READY' as const, prerequisites: [], completionEvidence: [{ source: 'RuneLite quest state', snapshotRevision: snapshot.scope.snapshotRevision,
        predicate: `Quest ${quest.id} completed in game` }], expectedEffects: effectsOf(quest), time: work,
      gpCost: null, sourceIds: [quest.source.url], reasons: [`Advance ${quest.id} toward the F2P quest objective`, ...prepared.reasons ?? []],
      ...(step.mapLocation ? { destination: { x: step.mapLocation.x, y: step.mapLocation.y, plane: step.mapLocation.plane } } : {}),
    };
    // Completing this macro also entails its prerequisite training. Later quests must not train that gap twice.
    const effects: ExpectedEffect[] = [...Object.entries(targets).map(([skill, level]) => ({ kind: 'skill-floor' as const, skill, level, afterSuccessOnly: true as const })),
      ...(prepared.resources == null ? [{ kind: 'resources-unknown' as const, source: quest.source.url, afterSuccessOnly: true as const }]
        : prepared.resources.map(change => ({ kind: 'resources' as const, change, afterSuccessOnly: true as const }))), ...effectsOf(quest)];
    const comparisonCost = sumExpressions([term(prepare, `prepare:${quest.id}:branch${branch(projection)}`),
      term(travel, `travel:${quest.id}:branch${branch(projection)}`), term(work, workKey(quest, projection, step))]);
    return { objectiveId: quest.id, activeAction: action,
      cost: { prepare, travel, work,
        banking: noTime(), exchange: noTime(), switching: noTime() }, effects,
      ...(comparisonCost ? { comparisonCost } : {}),
      confidence: prepare && travel && work && !prepared.uncertain ? 'MEDIUM' : 'LOW', hardBlocked: false };
  }

  function remainingExpression(projection: Projection): CostExpression | null {
    if (!projection.scope || !acceptsDecision(snapshot.scope, projection.scope) || projection.invalidResources) return null;
    if (remainingCache.has(projection)) return remainingCache.get(projection)!;
    const unfinished = facts.filter(q => !projection.completed.has(q.id));
    const maximum = new Map<string, number>();
    for (const q of unfinished) for (const [skill, target] of Object.entries(questSkillTargets(q, remainingQuestSteps(q, byStep, snapshot.quests[q.id])))) {
      maximum.set(skill, Math.max(maximum.get(skill) ?? 0, target));
    }
    const terms = unfinished.flatMap(q => {
      const id = snapshot.quests[q.id]?.stepId ?? q.stepIds[0], step = byStep.get(id);
      return [term(step ? adapters.work(step, q, projection) : null, workKey(q, projection, step)),
        term(step ? adapters.travel(step, q, projection) : null, `remaining-travel:${q.id}:branch${branch(projection)}`)];
    });
    // A per-quest estimate from the current facts is the same in every branch, so a quest whose preparation is unknown cancels between alternatives.
    if (adapters.preparationOf) for (const q of unfinished) terms.push(term(adapters.preparationOf(q), `preparation:${q.id}`));
    else terms.push(term(adapters.remainingPreparation(unfinished, projection), `joint-preparation:branch${branch(projection)}`));
    for (const [skill, target] of maximum) {
      const xp = projection.xp[skill];
      const time = level(projection, skill) >= target || (xp !== undefined && xp >= xpForLevel(target)) ? noTime() : adapters.training(skill, target, projection);
      terms.push(term(time, `training:${skill}:${target}:branch${branch(projection)}`));
    }
    const expression = sumExpressions(terms);
    remainingCache.set(projection, expression);
    return expression;
  }

  return { objectiveIds: facts.map(q => q.id), evaluate,
    prerequisitesFor(id, projection) {
      const quest = byId.get(id);
      if (!quest) return [];
      const frontier = prerequisiteFrontier(graph, id, projection.completed);
      if (!frontier.includes(id)) return frontier;
      const qp = points(projection);
      if (qp !== null && quest.requirements.questPoints > qp) {
        return facts.filter(q => q.id !== id && !projection.completed.has(q.id) && q.rewards.questPoints > 0).map(q => q.id);
      }
      return [id];
    },
    remaining(projection) {
      const result = remainingExpression(projection);
      return result && !result.unresolved.length ? result.known : null;
    }, remainingExpression };
}
