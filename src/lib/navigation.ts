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
  /**
   * step — точка шага; branch — быстрый вариант; shop — за предметом (банк, магазин); wiki — место из досье;
   * npc — к NPC (за разговором, продавцу); resource — к месту добычи (руда, рыба, дрова); detour — заход подготовки.
   */
  source: 'step' | 'branch' | 'shop' | 'wiki' | 'npc' | 'resource' | 'detour';
}

export const SOURCE_TEXT: Record<NavigationTarget['source'], string> = {
  step: 'цель шага',
  branch: 'быстрый вариант',
  shop: 'за предметом',
  wiki: 'место из досье',
  npc: 'к NPC',
  resource: 'место добычи',
  detour: 'подготовка к шагу',
};

/**
 * Куда ведёт стрелка для шага. Временная цель главнее — но только если она поставлена для этого шага или шаг
 * сейчас показан в игре; иначе — точка, которую получит плагин (быстрый вариант, inGame.worldPoint, карта шага).
 */
export function navigationTarget(
  step: Step,
  opts: { branch?: StepBranch; navTarget?: NavTargetPayload | null; activeStepId?: string | null; detourActive?: boolean } = {},
): NavigationTarget | null {
  const nav = opts.navTarget;
  if (nav && (nav.stepId === step.id || (!nav.stepId && opts.activeStepId === step.id))) {
    // Заход подготовки главнее: стрелка ведёт за подготовкой, и во всех местах (карта, HUD, игра) это одна цель.
    const source: NavigationTarget['source'] = opts.detourActive ? 'detour' : nav.itemName ? 'shop' : nav.npcNames?.length ? 'npc'
      : step.resourceSpots?.some((p) => p.x === nav.x && p.y === nav.y && p.plane === nav.plane) ? 'resource' : 'wiki';
    return { stepId: step.id, x: nav.x, y: nav.y, plane: nav.plane, label: nav.label, source };
  }
  const wp = toInGameTarget(step, opts.branch)?.worldPoint;
  if (!wp) return null;
  return { stepId: step.id, x: wp.x, y: wp.y, plane: wp.plane, label: wp.label ?? step.title, source: opts.branch ? 'branch' : 'step' };
}
