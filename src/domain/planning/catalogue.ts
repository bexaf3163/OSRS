import { questFactsJson } from '../../data';
import type { Step } from '../../types';
import type { QuestInstruction } from '../../services/runeliteBridge';
import type { PlanningSnapshot, Projection, QuestEvidence } from './contracts';
import type { QuestObservation } from '../player/questObservation';
import { nameKey } from '../items/itemKey';
import { currentBankView } from '../player/playerState';
import type { PlayerState } from '../player/playerState';
import { consumeMaterialStock } from '../player/materialStock';
import type { Progress } from '../../types';
import { isClosed } from '../quests/next-step';

export interface QuestFact {
  id: string;
  stepIds: readonly string[];
  members: boolean;
  requirements: { skills: Readonly<Record<string, number>>; questPoints: number; quests: readonly string[]; text: string;
    manual?: readonly string[]; capabilities?: readonly string[]; unparsed?: string | null };
  rewards: { questPoints: number; xp: Readonly<Record<string, number>>;
    /** Direct immediate cash only; null/absent is unmodelled, never a chest, later claim or expected sale. */
    coins?: number | null };
  /** Reviewed physical inputs and guaranteed gifts, tied to this source revision. Unknown quests keep this null/absent. */
  resourceFlow?: {
    consumes: readonly { name: string; count: number; anyOf?: readonly string[] }[];
    receives: readonly { name: string; count: number; when: 'start' | 'complete' }[];
    /** Needed only when gathering the delivery locally, not when using owned/bought finished inputs. */
    acquisitionTools?: readonly string[];
    /** Potential returns are not counted as stock; only these item totals lose certainty. */
    uncertainReceipts?: readonly string[];
    /** Quest-local exchanges whose exact internal timing/quantities are not a reusable stock guarantee. */
    unknownItems?: readonly string[];
    /** A whole-quest boundary flow does not describe an arbitrary resumed stage. */
    fromStartOnly?: boolean;
    /** Without an observed remaining quantity, an in-progress partial hand-in has no exact remaining cost. */
    partialDelivery: boolean;
  } | null;
  length: string | null;
  source: { url: string; revision: number; retrievedAt: string };
}
export const questCatalogue = questFactsJson.items as unknown as readonly QuestFact[];

/** Sufficient physical stock for even the maximum remaining hand-in. Does not infer how much was already delivered. */
export function canSupplyQuestDelivery(quest: QuestFact, state: PlayerState): boolean {
  return Boolean(quest.resourceFlow && consumeMaterialStock(currentBankView(state), quest.resourceFlow.consumes) !== null);
}

/** Conditional quest points are shared by prerequisite and acquisition forecasts; never a replacement for observed QP. */
export function projectedQuestPoints(snapshot: PlanningSnapshot, projection: Projection, catalogue: readonly QuestFact[] = questCatalogue): number | null {
  if (!snapshot.questPoints.known) return null;
  return snapshot.questPoints.value + catalogue.filter(quest => projection.completed.has(quest.id) && snapshot.quests[quest.id]?.state !== 'COMPLETED')
    .reduce((total, quest) => total + quest.rewards.questPoints, 0);
}

/** Only validated game stage evidence removes earlier quest parts from future cost. */
/**
 * Optional quests the player closed in the route (its steps marked done or skipped: "the quest is green, or knowingly skipped"), that the
 * game does not count complete and no other unfinished quest needs (Shield of Arrav without a partner). They are not objectives; removing
 * the mark brings the quest back. Never a completion: quest points and prerequisites still come from the game.
 */
export function setAsideQuests(catalogue: readonly QuestFact[], steps: readonly Step[], progress: Progress, quests: Readonly<Record<string, Pick<QuestEvidence, 'state'>>>): Set<string> {
  const byId = new Map(steps.map(step => [step.id, step]));
  const open = catalogue.filter(quest => quests[quest.id]?.state !== 'COMPLETED');
  return new Set(open.filter(quest => quest.stepIds.length > 0 && quest.stepIds.every(id => byId.get(id)?.optional && isClosed(progress, id))
    && !open.some(other => other.requirements.quests.includes(quest.id))).map(quest => quest.id));
}

export function remainingQuestSteps(quest: QuestFact, steps: ReadonlyMap<string, Step>, evidence?: QuestEvidence): Step[] {
  const at = evidence?.state === 'IN_PROGRESS' && evidence.stepId ? quest.stepIds.indexOf(evidence.stepId) : 0;
  return quest.stepIds.slice(Math.max(0, at)).flatMap(id => { const step = steps.get(id); return step ? [step] : []; });
}

/** Wiki minima plus the selected execution strategy; a low article minimum cannot erase a pillar/tool strategy. */
export function questSkillTargets(quest: QuestFact, remaining: readonly Step[]): Readonly<Record<string, number>> {
  const targets = { ...quest.requirements.skills };
  for (const step of remaining) for (const requirement of step.requirements ?? []) if (requirement.type === 'skill') {
    targets[requirement.skill] = Math.max(targets[requirement.skill] ?? 0, requirement.min);
  }
  return targets;
}

/** Reviewed deliveries replace a historical gathering strategy's spare quantities and entry kit, not its walkthrough or IDs. */
export function questPreparationSteps(steps: readonly Step[], quest: QuestFact, evidence?: QuestEvidence): Step[] {
  const flow = quest.resourceFlow;
  if (!flow || !steps.length || (flow.fromStartOnly && evidence?.state === 'IN_PROGRESS')) return [...steps];
  const consumed = new Set(flow.consumes.map(item => nameKey(item.name)));
  const tools = new Set(flow.acquisitionTools?.map(nameKey));
  const declared = steps.flatMap(step => step.itemsRequired ?? []);
  const result: Step[] = steps.map(step => ({ ...step,
    itemsRequired: step.itemsRequired?.filter(item => !consumed.has(nameKey(item.nameEn)) && !tools.has(nameKey(item.nameEn))), goalItemsRequired: undefined }));
  result[0] = { ...result[0], itemsRequired: [...result[0].itemsRequired ?? [], ...flow.consumes.map(item => {
    const original = declared.find(row => nameKey(row.nameEn) === nameKey(item.name));
    return { ...original, nameEn: item.name, amount: item.count, howToGet: original?.howToGet ?? '', inStep: false,
      anyOf: item.anyOf ? [...item.anyOf] : undefined, heals: undefined, equip: undefined, totalAmount: undefined };
  })] };
  return result;
}

/** Retain authored intra-quest order/content, replace only inferred global shopping/training/quest order. */
export function questExecutionSteps(steps: readonly Step[], catalogue: readonly QuestFact[] = questCatalogue, evidence?: PlanningSnapshot['quests']): Step[] {
  const byId = new Map(steps.map(step => [step.id, step]));
  const prepared = new Map(catalogue.flatMap(quest => questPreparationSteps(quest.stepIds.flatMap(id => byId.get(id) ?? []), quest, evidence?.[quest.id])).map(step => [step.id, step]));
  const questForStep = new Map(catalogue.flatMap(q => q.stepIds.map((id, index) => [id, { quest: q, index }] as const)));
  const completion = new Map(catalogue.map(q => [q.id, q.stepIds[q.stepIds.length - 1]]));
  return steps.map(original => {
    const step = prepared.get(original.id) ?? original;
    const entry = questForStep.get(step.id);
    if (!entry) return step;
    const { quest, index } = entry;
    const requires = index ? [quest.stepIds[index - 1]] : quest.requirements.quests.map(id => completion.get(id)).filter((id): id is string => !!id);
    const requirements = [...step.requirements ?? []];
    for (const [skill, min] of Object.entries(quest.requirements.skills)) {
      if (!requirements.some(r => r.type === 'skill' && r.skill === skill && r.min >= min)) requirements.push({ type: 'skill', skill, min });
    }
    for (const requiredQuest of quest.requirements.quests) if (!requirements.some(r => r.type === 'quest' && r.quest === requiredQuest)) requirements.push({ type: 'quest', quest: requiredQuest });
    return { ...step, requires, minQp: quest.requirements.questPoints,
      requirements };
  });
}

/** Completion, global started state and validated local cursor are separate facts. */
export function questEvidence(catalogue: readonly QuestFact[], observation: QuestObservation | null,
  completed: readonly string[] | null, instruction: QuestInstruction | null): Record<string, QuestEvidence> {
  const done = completed ? new Set(completed.map(nameKey)) : null;
  const states = new Map(Object.entries(observation?.states ?? {}).map(([id, state]) => [nameKey(id), state]));
  return Object.fromEntries(catalogue.map(quest => {
    const state = states.get(nameKey(quest.id)) ?? (done?.has(nameKey(quest.id)) ? 'COMPLETED' : 'UNKNOWN');
    const cursor = state === 'IN_PROGRESS' && instruction && !instruction.peeking && quest.stepIds.includes(instruction.stepId) ? instruction.stepId : undefined;
    return [quest.id, { state, source: observation ? `RuneLite quest observation ${observation.sessionId}:${observation.revision}` : 'RuneLite completed-quest list',
      ...(cursor ? { stepId: cursor } : {}) }];
  }));
}
