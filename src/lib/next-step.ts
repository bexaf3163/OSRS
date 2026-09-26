// Доступность шагов и выбор «Что делать сейчас».

import type { Progress, Step } from '../types';

export function isClosed(p: Progress, id: string): boolean {
  return p.steps[id] === 'done' || p.steps[id] === 'skipped';
}

export interface Blockers {
  steps: string[];
  qp?: { need: number; have: number };
}

/** Что мешает начать шаг. null — ничего, шаг доступен. */
export function blockersOf(step: Step, p: Progress, qp: number): Blockers | null {
  const steps = step.requires.filter((id) => !isClosed(p, id));
  const needQp = step.minQp !== undefined && qp < step.minQp;
  if (!steps.length && !needQp) return null;
  return { steps, ...(needQp ? { qp: { need: step.minQp!, have: qp } } : {}) };
}

/** Первый по порядку незакрытый шаг, у которого выполнены зависимости и хватает очков квестов. */
export function nextStep(steps: Step[], p: Progress, qp: number): Step | null {
  return steps.find((s) => !isClosed(p, s.id) && !blockersOf(s, p, qp)) ?? null;
}

/** Первый незакрытый шаг вообще — даже если заблокирован. */
export function firstOpen(steps: Step[], p: Progress): Step | null {
  return steps.find((s) => !isClosed(p, s.id)) ?? null;
}

/** Текущий этап — этап первого незакрытого шага; когда всё закрыто — последний. */
export function currentStage(steps: Step[], p: Progress): number {
  return firstOpen(steps, p)?.stage ?? steps[steps.length - 1]?.stage ?? 1;
}

export function blockerParts(b: Blockers): string[] {
  const parts = [...b.steps];
  if (b.qp) parts.push(`очки квестов ${b.qp.need} (сейчас ${b.qp.have})`);
  return parts;
}

/** Следующий незакрытый шаг после id (по кругу с начала списка) — его открывает «Отметить выполненным». */
export function openAfter(steps: Step[], p: Progress, id: string): Step | undefined {
  const at = steps.findIndex((s) => s.id === id);
  const open = (s: Step) => s.id !== id && !isClosed(p, s.id);
  return steps.slice(at + 1).find(open) ?? steps.slice(0, Math.max(0, at)).find(open);
}
