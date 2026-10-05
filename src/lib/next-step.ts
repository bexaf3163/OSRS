// Step availability and the choice of "What to do now".

import type { Progress, Step } from '../types';

export function isClosed(p: Progress, id: string): boolean {
  return p.steps[id] === 'done' || p.steps[id] === 'skipped';
}

export interface Blockers {
  steps: string[];
  qp?: { need: number; have: number };
}

/** What prevents starting the step. null means nothing, the step is available. */
export function blockersOf(step: Step, p: Progress, qp: number): Blockers | null {
  const steps = step.requires.filter((id) => !isClosed(p, id));
  const needQp = step.minQp !== undefined && qp < step.minQp;
  if (!steps.length && !needQp) return null;
  return { steps, ...(needQp ? { qp: { need: step.minQp!, have: qp } } : {}) };
}

/** The first unclosed step in order whose dependencies are met and for which there are enough quest points. */
export function nextStep(steps: Step[], p: Progress, qp: number): Step | null {
  return steps.find((s) => !isClosed(p, s.id) && !blockersOf(s, p, qp)) ?? null;
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
export function openAfter(steps: Step[], p: Progress, id: string): Step | undefined {
  const at = steps.findIndex((s) => s.id === id);
  const open = (s: Step) => s.id !== id && !isClosed(p, s.id);
  return steps.slice(at + 1).find(open) ?? steps.slice(0, Math.max(0, at)).find(open);
}
