import type { Step } from '../types';
import type { QuestInstruction } from '../services/runeliteBridge';
import { nameKey } from './checklist';

export interface LoadoutPhase { id: string; index: number; confirmed: boolean }

function confirmedLine(step: Step, instruction: QuestInstruction | null) {
  if (!instruction || instruction.peeking || instruction.stepId !== step.id || !Number.isInteger(instruction.lineIndex)) return null;
  return step.questStages?.stages.find(stage => stage.at === instruction.stageAt)?.do[instruction.lineIndex] ?? null;
}

/** An explicitly recommended food becomes required at a confirmed entry guard, then returns to optional after that entry. */
export function entryFoodStep(step: Step, instruction: QuestInstruction | null = null): Step {
  if (step.type !== 'quest' || step.itemsRequired?.some(item => item.heals)) return step;
  const line = confirmedLine(step, instruction);
  const added = new Map<string, NonNullable<Step['itemsRequired']>[number]>();
  for (const pre of line?.pre ?? []) {
    const key = nameKey(pre.item);
    if (step.itemsRequired?.some(item => nameKey(item.nameEn) === key)) continue;
    const food = step.itemsRecommended?.find(item => item.heals && nameKey(item.nameEn) === key);
    if (!food) continue;
    const previous = added.get(key);
    const anyOf = previous ? (previous.anyOf ?? []).filter(name => pre.alt?.some(alt => nameKey(alt) === nameKey(name))) : pre.alt;
    added.set(key, { nameEn: pre.item, amount: Math.max(Number(previous?.amount ?? 0), pre.n ?? 1), heals: food.heals,
      howToGet: food.howToGet || pre.t || 'Withdraw food you own or buy the missing quantity before entering.',
      ...(pre.id !== undefined ? { wikiItemId: pre.id } : food.wikiItemId !== undefined ? { wikiItemId: food.wikiItemId } : {}),
      ...(food.iconUrl ? { iconUrl: food.iconUrl } : {}), ...(food.from ? { from: food.from } : {}), ...(anyOf?.length ? { anyOf: [...anyOf] } : {}),
    });
  }
  if (!added.size) return step;
  const food = [...added.values()];
  return { ...step, itemsRequired: [...(step.itemsRequired ?? []), ...food],
    itemsRecommended: step.itemsRecommended?.filter(item => !added.has(nameKey(item.nameEn))),
    ...(step.goalItemsRequired && !step.goalItemsRequired.some(item => item.heals)
      ? { goalItemsRequired: [...step.goalItemsRequired, ...food] } : {}),
  };
}

/** Use confirmed canonical line keys: a coarse quest var can cover several bank-to-bank phases. */
export function loadoutPhase(step: Step, instruction: QuestInstruction | null = null): LoadoutPhase | null {
  const loadouts = step.loadouts;
  if (!loadouts?.length) return null;
  const opening = { id: loadouts[0].id, index: 0, confirmed: false };
  const stages = step.questStages?.stages;
  if (!instruction || !confirmedLine(step, instruction)) return opening;
  const boundaries = loadouts.map((l, index) => {
    if (index === 0) return [-Infinity, 0];
    if (l.fromLine) {
      for (const stage of stages!) {
        const line = stage.do.findIndex(d => d.k === l.fromLine);
        if (line >= 0) return [stage.at, line];
      }
      return null;
    }
    return l.from !== undefined && Number.isFinite(l.from) && l.from >= 0 ? [l.from, 0] : null;
  });
  // Missing metadata cannot prove that a later phase has or has not started.
  if (boundaries.some(b => b === null)) return opening;
  if (boundaries.some((b, n) => n > 0 && (b![0] < boundaries[n - 1]![0] || (b![0] === boundaries[n - 1]![0] && b![1] <= boundaries[n - 1]![1])))) return opening;
  let index = 0;
  for (let n = 1; n < boundaries.length; n++) {
    const b = boundaries[n]!;
    if (instruction.stageAt > b[0] || (instruction.stageAt === b[0] && instruction.lineIndex >= b[1])) index = n;
  }
  return { id: loadouts[index].id, index, confirmed: true };
}

/** Current, a future bank visit, or a finished-only use. Unclassified requirements stay current. */
export function loadoutNeed(step: Step, name: string, sources: readonly { phase?: string }[], phase: LoadoutPhase | null): 'NOW' | 'SOON' | 'PAST' {
  if (!phase || !step.loadouts?.length) return 'NOW';
  const key = nameKey(name);
  const has = (index: number) => step.loadouts![index].take.some(t => nameKey(t.nameEn) === key);
  if (has(phase.index) || sources.some(s => s.phase === phase.id)) return 'NOW';
  if (step.loadouts.some((_, index) => index > phase.index && has(index)) || sources.some(s => s.phase && step.loadouts!.findIndex(l => l.id === s.phase) > phase.index)) return 'SOON';
  if (step.loadouts.some((_, index) => index < phase.index && has(index)) || (sources.length > 0 && sources.every(s => s.phase && step.loadouts!.findIndex(l => l.id === s.phase) >= 0 && step.loadouts!.findIndex(l => l.id === s.phase) < phase.index))) return 'PAST';
  // An unknown phase label is retained rather than hidden.
  return sources.length > 0 && sources.every(s => s.phase && step.loadouts!.some(l => l.id === s.phase)) ? 'SOON' : 'NOW';
}

/** Readiness checks this bank visit; Shopping and the watch list keep the whole quest. */
export function currentLoadoutStep(step: Step, instruction: QuestInstruction | null = null): Step {
  const phase = loadoutPhase(step, instruction);
  if (!phase) return step;
  return { ...step, itemsRequired: step.itemsRequired?.filter(i => loadoutNeed(step, i.nameEn, [i], phase) === 'NOW').map(i =>
    i.inStep && phase.confirmed && i.phase === phase.id ? { ...i, inStep: false } : i),
  };
}
