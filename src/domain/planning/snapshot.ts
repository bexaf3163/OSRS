import type { PlayerStats, Step } from '../../types';
import type { GearState, QuestInstruction } from '../../services/runeliteBridge';
import type { PlayerState } from '../player/playerState';
import { currentBankView, levelOf, unknown } from '../player/playerState';
import { coherentSkillXp } from '../player/xp';
import type { QuestObservation } from '../player/questObservation';
import { nameKey } from '../items/itemKey';
import { questEvidence } from './catalogue';
import type { QuestFact } from './catalogue';
import type { DecisionScope, PlanningSnapshot } from './contracts';
import { validatedQuestCursor } from '../quests/questCursor';

/** Only admitted game facts enter prerequisites; historical route marks and derived route QP are not inputs. */
export function buildPlanningSnapshot(input: {
  scope: DecisionScope; player: PlayerState; catalogue: readonly QuestFact[]; observation: QuestObservation | null;
  xp: PlayerStats | null; questPoints: number | null; instruction: QuestInstruction | null;
  gear?: GearState | null;
  steps?: readonly Step[];
  manual?: Readonly<Record<string, boolean | undefined>>;
}): PlanningSnapshot | null {
  const { scope, player: observed } = input;
  const current = observed.connected;
  const observation = current && observed.player && input.observation && input.observation.sessionId === scope.gameSessionId
    && nameKey(input.observation.player) === nameKey(observed.player) ? input.observation : null;
  if (current && (!observed.player || (input.observation && !observation))) return null;
  const step = observation && input.instruction ? input.steps?.find(step => step.id === input.instruction!.stepId) : null;
  const candidateCursor = step ? validatedQuestCursor(step, input.instruction) : null;
  const quests = questEvidence(input.catalogue, observation, current && observed.quests.known ? observed.quests.value : null, candidateCursor);
  const instruction = candidateCursor && Object.values(quests).some(quest => quest.state === 'IN_PROGRESS' && quest.stepId === candidateCursor.stepId) ? candidateCursor : null;
  const xp = Object.fromEntries(Object.entries(current ? input.xp ?? {} : {}).flatMap(([skill, value]) =>
    coherentSkillXp(value, levelOf(observed, skill)) ? [[skill, { known: true as const, value, source: 'game' as const }]] : []));
  const points = current && Number.isInteger(input.questPoints) && input.questPoints! >= 0 && input.questPoints! <= 500
    ? { known: true as const, value: input.questPoints!, source: 'game' as const } : unknown;
  return { scope, player: currentBankView(observed), xp, questPoints: points, manual: input.manual ?? {}, instruction,
    combat: { gear: current ? input.gear ?? null : null,
      stats: current ? Object.fromEntries(Object.entries(observed.levels).flatMap(([name, level]) => level.known && level.source === 'game' ? [[name, level.value]] : [])) : null },
    quests,
    bankRead: observed.owned?.bankSavedAt != null ? { kind: 'remembered', at: observed.owned.bankSavedAt }
      : observed.bankSeen ? { kind: 'current' } : { kind: 'unread' } };
}

/** Where the owner's word for a quest's manual requirement is kept: a task tick on the quest's first step (Progress.tasksDone). */
export const manualTaskKey = (quest: Pick<QuestFact, 'stepIds'>, key: string) => `${quest.stepIds[0]}:manual-${key}`;

/** The planner's manual marks (`<quest>:<key>`) from the owner's ticks; an untouched requirement stays unconfirmed. */
export function manualMarks(catalogue: readonly QuestFact[], tasksDone: Readonly<Record<string, true>> | undefined): Record<string, boolean> {
  return Object.fromEntries(catalogue.flatMap(quest => (quest.requirements.manual ?? [])
    .filter(key => tasksDone?.[manualTaskKey(quest, key)] === true).map(key => [`${quest.id}:${key}`, true])));
}
