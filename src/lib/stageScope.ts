// What a quest stage asks for. The quest has one item list for the whole quest; every stage may carry its own list ("what is needed in this very stage":
// no field means the quest's list, [] means nothing). The game guide already shows only the current stage's list. The desktop did not, so at the last
// stage of Below Ice Mountain it still said "Beer, Cooked meat, Bread, Knife: missing" for things the quest had used up long ago.
//
// The scope is known only when the game confirms the line the player is on; with no link nothing is hidden (a doubtful value means "show").

import type { Step } from '../types';
import type { QuestInstruction } from '../services/runeliteBridge';
import { nameKey } from './checklist';
import type { RequirementStatus, StepReadiness } from './readiness';

export interface StageScope {
  stageAt: number;
  /** The quest's own items (nameKey) that this stage does not ask for any more. */
  out: ReadonlySet<string>;
}

/**
 * The scope of the stage the confirmed quest cursor is in, or null when it cannot be told.
 * An item is out when the data places it in an earlier stage only, or when the stage is past every stage that asks for any item
 * (nothing is needed from the quest's list any more). An item that no stage lists at all stays until then: it is bought or found inside a line
 * ("buy an ale for Burntof"), so its absence from a stage's list proves nothing.
 */
export function stageScope(step: Step, instruction: QuestInstruction | null): StageScope | null {
  if (!instruction || instruction.stepId !== step.id || !step.questStages) return null;
  const stages = step.questStages.stages;
  const current = stages.find((s) => s.at === instruction.stageAt);
  if (!current || !Array.isArray(current.items)) return null;
  const keep = new Set(current.items.map((i) => nameKey(i.name)));
  const later = new Set<string>();
  const earlier = new Set<string>();
  let lastWithItems = -1;
  for (const s of stages) {
    if (!s.items?.length) continue;
    lastWithItems = Math.max(lastWithItems, s.at);
    const into = s.at > current.at ? later : s.at < current.at ? earlier : null;
    if (into) for (const i of s.items) into.add(nameKey(i.name));
  }
  const out = new Set<string>();
  for (const k of earlier) if (!keep.has(k) && !later.has(k)) out.add(k);
  if (current.at > lastWithItems) {
    for (const i of step.itemsRequired ?? []) {
      const k = nameKey(i.nameEn);
      if (!keep.has(k)) out.add(k);
    }
  }
  return out.size ? { stageAt: current.at, out } : null;
}

export function isOutOfStage(scope: StageScope | null, name: string): boolean {
  return !!scope && scope.out.has(nameKey(name));
}

/** "Done out of what can be checked" for the lines the stage still asks for (the engine's score counts the whole quest list). */
export function scopedPercent(lines: readonly { name: string; where: string; timing: string }[], scope: StageScope | null, fallback: number | null): number | null {
  if (!scope) return fallback;
  const mine = lines.filter((l) => l.timing === 'NOW' && !scope.out.has(nameKey(l.name)));
  if (!mine.length) return 100;
  const checkable = mine.filter((l) => l.where !== 'UNKNOWN');
  if (!checkable.length) return null;
  return Math.round((100 * checkable.filter((l) => l.where === 'INVENTORY' || l.where === 'EQUIPPED').length) / checkable.length);
}

/** The readiness without the quest items this stage no longer asks for; the same object when nothing is dropped. */
export function scopeReadiness(r: StepReadiness, scope: StageScope | null): StepReadiness {
  if (!scope) return r;
  const drop = (x: RequirementStatus) => x.kind === 'item' && !!x.item && scope.out.has(nameKey(x.item));
  const problems = r.problems.filter((x) => !drop(x));
  const unknown = r.unknown.filter((x) => !drop(x));
  const dropped = r.problems.length - problems.length + r.unknown.length - unknown.length;
  if (!dropped) return r;
  const status = problems.length === 0 ? (unknown.length ? 'UNKNOWN' : 'READY') : r.status;
  return { ...r, problems, unknown, requirements: r.requirements.filter((x) => !drop(x)), status };
}
