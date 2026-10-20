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
export type DependencyFact = (id: string) => boolean | undefined;

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
  const steps = step.requires.filter((id) => !(fact?.(id) ?? isCompleted(p, id)));
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
