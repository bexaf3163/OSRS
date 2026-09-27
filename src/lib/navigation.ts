// Одна цель навигации на всё: куда сейчас ведёт стрелка в игре — то же показывает большая карта.
// Раньше карта шага рисовала только точки шага, а стрелка могла вести к быстрому варианту (телепорт, каноэ),
// к точке из inGame.worldPoint или к временной цели (магазин, банк, место из досье) — на карте её не было.

import type { Step, StepBranch } from '../types';
import { toInGameTarget, type NavTargetPayload } from '../services/runeliteBridge';

export interface NavigationTarget {
  stepId: string;
  x: number;
  y: number;
  plane: number;
  label: string;
  /** step — точка шага; branch — быстрый вариант; shop — за предметом (банк, магазин); wiki — место из досье. */
  source: 'step' | 'branch' | 'shop' | 'wiki';
}

export const SOURCE_TEXT: Record<NavigationTarget['source'], string> = {
  step: 'цель шага',
  branch: 'быстрый вариант',
  shop: 'за предметом',
  wiki: 'место из досье',
};

/**
 * Куда ведёт стрелка для шага. Временная цель главнее — но только если она поставлена для этого шага или шаг
 * сейчас показан в игре; иначе — точка, которую получит плагин (быстрый вариант, inGame.worldPoint, карта шага).
 */
export function navigationTarget(
  step: Step,
  opts: { branch?: StepBranch; navTarget?: NavTargetPayload | null; activeStepId?: string | null } = {},
): NavigationTarget | null {
  const nav = opts.navTarget;
  if (nav && (nav.stepId === step.id || (!nav.stepId && opts.activeStepId === step.id))) {
    return { stepId: step.id, x: nav.x, y: nav.y, plane: nav.plane, label: nav.label, source: nav.itemName ? 'shop' : 'wiki' };
  }
  const wp = toInGameTarget(step, opts.branch)?.worldPoint;
  if (!wp) return null;
  return { stepId: step.id, x: wp.x, y: wp.y, plane: wp.plane, label: wp.label ?? step.title, source: opts.branch ? 'branch' : 'step' };
}
