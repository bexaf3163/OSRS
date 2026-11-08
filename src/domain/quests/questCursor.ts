import type { Step } from '../../types';
import type { GearItem } from '../../services/runeliteBridge';
import { entryFoodStep } from './loadoutPhase';
import { isOutOfStage, stageScope } from './stageScope';

export interface QuestInstruction { stepId: string; stageAt: number; lineIndex: number; peeking: boolean }

export function parseQuestInstruction(raw: unknown): QuestInstruction | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.stepId !== 'string' || !value.stepId || value.stepId.length > 100 || !Number.isSafeInteger(value.stageAt)
    || !Number.isSafeInteger(value.lineIndex) || (value.stageAt as number) < 0 || (value.lineIndex as number) < 0 || typeof value.peeking !== 'boolean') return null;
  return { stepId: value.stepId, stageAt: value.stageAt as number, lineIndex: value.lineIndex as number, peeking: value.peeking };
}

/** A display peek or a coordinate outside authored execution content is not game-stage evidence. */
export function validatedQuestCursor(step: Step, raw: unknown): QuestInstruction | null {
  const cursor = parseQuestInstruction(raw);
  return cursor && !cursor.peeking && cursor.stepId === step.id
    && step.questStages?.stages.find(stage => stage.at === cursor.stageAt)?.do[cursor.lineIndex] ? cursor : null;
}

/** Branch-local proof only: a later numeric stage in another branch proves nothing about a partner or other manual requirement. */
export function questManualProof(step: Step, requirement: string, cursor: QuestInstruction | null, inventory: readonly GearItem[] | null): boolean {
  const validated = validatedQuestCursor(step, cursor);
  if (!validated || !inventory) return false;
  const key = step.questStages!.stages.find(stage => stage.at === validated.stageAt)!.do[validated.lineIndex].k;
  return !!key && !!step.questStages?.manualProofs?.some(proof => proof.requirement === requirement && !!proof.source && proof.atLines.includes(key)
    && inventory.some(item => item.id === proof.carriedId && !item.noted && Number.isSafeInteger(item.count ?? 1) && (item.count ?? 1) > 0));
}

/** Inherit current-line entry guards and consumed-item scoping without modifying authored IDs or the saved walkthrough. */
export function stepAtQuestCursor(step: Step, cursor: QuestInstruction | null): Step {
  if (!validatedQuestCursor(step, cursor)) return step;
  const entry = entryFoodStep(step, cursor), scope = stageScope(entry, cursor);
  const stillNeeded = (foe: string) => {
    const declarations = step.questStages!.encounters?.filter(encounter => encounter.foe === foe);
    if (!declarations?.length) return true; // Unclassified content is never silently made safe.
    return declarations.some(encounter => {
      const positions = step.questStages!.stages.flatMap(stage => stage.do.flatMap((line, index) => line.k === encounter.throughLine ? [{ at: stage.at, index }] : []));
      return !positions.length || positions.some(position => position.at > cursor!.stageAt || (position.at === cursor!.stageAt && position.index >= cursor!.lineIndex));
    });
  };
  const foes = entry.foes?.filter(stillNeeded), threats = entry.threats?.filter(stillNeeded);
  const changed = foes?.length !== entry.foes?.length || threats?.length !== entry.threats?.length;
  if (!scope && !changed) return entry;
  return { ...entry, ...(changed ? { foes, threats } : {}),
    ...(scope ? { itemsRequired: entry.itemsRequired?.filter(item => !isOutOfStage(scope, item.nameEn)),
      goalItemsRequired: entry.goalItemsRequired?.filter(item => !isOutOfStage(scope, item.nameEn)) } : {}) };
}
