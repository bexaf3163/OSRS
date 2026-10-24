// Step availability and the choice of "What to do now".

import type { Progress, Step } from '../types';
import { nameKey } from './checklist';

export function isClosed(p: Progress, id: string): boolean {
  return p.steps[id] === 'done' || p.steps[id] === 'skipped';
}

/** A deliberate skip closes the queue only; it is not evidence that a hard prerequisite was completed. */
export function isCompleted(p: Progress, id: string): boolean {
  return p.steps[id] === 'done';
}

/** Known game facts override route marks; undefined leaves the explicit done mark as the manual fallback. */
export type DependencyFact = (id: string, consumer?: Step) => boolean | undefined;

/** Only actual quest completion is inferred here; a partial varbit milestone is not a finished quest. */
export function questDependencyFacts(steps: readonly Step[], quests: readonly string[] | null): DependencyFact {
  const done = quests === null ? null : new Set(quests.map(nameKey));
  const names = new Map(steps.flatMap((s) => {
    const t = s.inGame?.completionTrigger;
    return t?.type === 'QUEST_COMPLETED' && t.questName ? [[s.id, t.questName] as const] : [];
  }));
  return (id) => {
    const name = names.get(id);
    return done && name ? done.has(nameKey(name)) : undefined;
  };
}

/** How many of an item the game confirms the player owns (bag, notes, bank, worn); null while that is not known. */
export type OwnedCount = (nameEn: string) => number | null;

type ItemTrigger = NonNullable<NonNullable<Step['inGame']>['completionTrigger']>;

/**
 * Whether the items an acquisition step exists for are owned now. An item named with an ID is not provable by its name (the three Crandor map
 * pieces share one name), and an unread count proves nothing.
 */
function acquiredNow(t: ItemTrigger, owned: OwnedCount): boolean {
  const items = t.items ?? [];
  const held = items.map((it) => {
    if (it.id !== undefined) return false;
    const counts = it.names.map((n) => owned(n));
    if (counts.some((c) => c === null)) return false;
    return (counts as number[]).reduce((a, b) => a + b, 0) >= (it.count ?? 1);
  });
  return items.length > 0 && (t.anyOf ? held.some(Boolean) : held.every(Boolean));
}

/**
 * Pure level goals may already be reached without following their training step. Never infer items or quest stages from levels.
 * owned: a step that exists to acquire items (its completion is owning them) is met for the steps after it when the game confirms they are
 * owned now. Positive only: a missing or unread item never revokes the player's own done mark.
 */
export function dependencyFacts(
  steps: readonly Step[], quests: readonly string[] | null, level: (skill: string) => number | undefined, owned?: OwnedCount,
): DependencyFact {
  const quest = questDependencyFacts(steps, quests);
  const acquisitions = new Map(steps.flatMap((s) => {
    const t = s.inGame?.completionTrigger;
    return t?.type === 'ITEM_OWNED' && t.items?.length && !s.carryover?.length ? [[s.id, t] as const] : [];
  }));
  const training = new Map(steps.flatMap(s => {
    const t = s.inGame?.completionTrigger;
    return s.type === 'skill' && t?.type === 'SKILL_LEVEL' && t.levels?.length && !t.items?.length && !s.carryover?.length
      ? [[s.id, t.levels] as const] : [];
  }));
  return (id, consumer) => {
    const q = quest(id);
    if (q !== undefined) return q;
    const acquisition = owned ? acquisitions.get(id) : undefined;
    if (acquisition && acquiredNow(acquisition, owned!)) return true;
    const goals = training.get(id);
    if (!goals) return undefined;
    const values = goals.map(g => ({ target: g.level, have: level(g.skill) }));
    // Add positive equivalence only. Consumer entry requirements still check its actual levels;
    // incomplete snapshots must not revoke the existing explicit-done fallback for a training step.
    if (values.every(v => v.have !== undefined && Number.isFinite(v.have) && v.have >= v.target)) return true;
    // A shared training entry may prepare several later quests. Its unrelated goals are
    // not a hard requirement of a consumer with explicit, already-reached entry skills.
    // This proof belongs to this edge only: callers without a consumer get no completion fact.
    if (!consumer?.requires.includes(id)) return undefined;
    const needs = consumer.requirements?.filter(r => r.type === 'skill') ?? [];
    if (!needs.some(r => goals.some(g => g.skill === r.skill))) return undefined;
    return needs.length > 0 && needs.every(r => {
      const have = level(r.skill);
      return have !== undefined && Number.isFinite(have) && have >= r.min;
    }) ? true : undefined;
  };
}

/**
 * Where a step stands for the route: done, knowingly skipped by the player, or not decided. An optional step nobody has visited is "open",
 * never "skipped": only the player's own mark skips it.
 */
export type StepState = 'done' | 'skipped' | 'open';

export function stepState(p: Progress, id: string): StepState {
  const s = p.steps[id];
  return s === 'done' ? 'done' : s === 'skipped' ? 'skipped' : 'open';
}

/** The steps that are suggested before this one and not yet closed (they never block, see Step.softRequires). */
export function suggestedBefore(step: Pick<Step, 'softRequires'>, p: Progress): string[] {
  return (step.softRequires ?? []).filter((id) => !isClosed(p, id));
}

export interface Blockers {
  steps: string[];
  qp?: { need: number; have: number };
}

/** What prevents starting the step. null means nothing, the step is available. */
export function blockersOf(step: Step, p: Progress, qp: number, fact?: DependencyFact): Blockers | null {
  const steps = step.requires.filter((id) => !(fact?.(id, step) ?? isCompleted(p, id)));
  const needQp = step.minQp !== undefined && qp < step.minQp;
  if (!steps.length && !needQp) return null;
  return { steps, ...(needQp ? { qp: { need: step.minQp!, have: qp } } : {}) };
}

/** The first unclosed step in order whose dependencies are met and for which there are enough quest points. */
export function nextStep(steps: Step[], p: Progress, qp: number, fact?: DependencyFact): Step | null {
  return steps.find((s) => !isClosed(p, s.id) && !blockersOf(s, p, qp, fact)) ?? null;
}

/** The first unclosed step at all, even if it is blocked. */
export function firstOpen(steps: Step[], p: Progress): Step | null {
  return steps.find((s) => !isClosed(p, s.id)) ?? null;
}

/** The current stage is the stage of the first unclosed step; when everything is closed, the last one. */
export function currentStage(steps: Step[], p: Progress): number {
  return firstOpen(steps, p)?.stage ?? steps[steps.length - 1]?.stage ?? 1;
}

export function blockerParts(b: Blockers): string[] {
  const parts = [...b.steps];
  if (b.qp) parts.push(`quest points ${b.qp.need} (now ${b.qp.have})`);
  return parts;
}

/** The next unclosed step after id (cyclically from the start of the list): "Mark as done" opens it. */
export function openAfter(steps: Step[], p: Progress, id: string, qp = Number.POSITIVE_INFINITY, fact?: DependencyFact): Step | undefined {
  const at = steps.findIndex((s) => s.id === id);
  // The completion button previews its destination before the store processes the mark.
  const after: Progress = isClosed(p, id) ? p : { ...p, steps: { ...p.steps, [id]: 'done' } };
  const open = (s: Step) => s.id !== id && !isClosed(p, s.id) && !blockersOf(s, after, qp, fact);
  return steps.slice(at + 1).find(open) ?? steps.slice(0, Math.max(0, at)).find(open);
}
