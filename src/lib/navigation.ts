// One navigation target for everything: where the arrow in the game leads now, the big map shows the same.
// Before, the step map drew only the step's points, while the arrow could lead to a quick option (a teleport, a canoe),
// to a point from inGame.worldPoint or to a temporary target (a shop, a bank, a place from the dossier), which was not on the map.

import type { Step, StepBranch } from '../types';
import { toInGameTarget, type NavTargetPayload } from '../services/runeliteBridge';

export interface NavigationTarget {
  stepId: string;
  x: number;
  y: number;
  plane: number;
  label: string;
  /**
   * step is the step's point; branch is a quick option; shop is for an item (a bank, a shop); wiki is a place from the dossier;
   * npc is to an NPC (to talk, a seller); resource is to a gathering place (ore, fish, wood); detour is a preparation stop.
   */
  source: 'step' | 'branch' | 'shop' | 'wiki' | 'npc' | 'resource' | 'detour';
}

export const SOURCE_TEXT: Record<NavigationTarget['source'], string> = {
  step: 'step target',
  branch: 'quick option',
  shop: 'for an item',
  wiki: 'place from the dossier',
  npc: 'to the NPC',
  resource: 'gathering spot',
  detour: 'preparing for the step',
};

/**
 * Where the arrow leads for a step. A temporary target wins, but only if it was set for this step or the step
 * is shown in the game now; otherwise the point the plugin will get (a quick option, inGame.worldPoint, the step map).
 */
export function navigationTarget(
  step: Step,
  opts: { branch?: StepBranch; navTarget?: NavTargetPayload | null; activeStepId?: string | null; detourActive?: boolean } = {},
): NavigationTarget | null {
  const nav = opts.navTarget;
  if (nav && (nav.stepId === step.id || (!nav.stepId && opts.activeStepId === step.id))) {
    // A preparation detour wins: the arrow leads to the preparation, and in all places (map, HUD, game) it is one target.
    const source: NavigationTarget['source'] = opts.detourActive ? 'detour' : nav.itemName ? 'shop' : nav.npcNames?.length ? 'npc'
      : step.resourceSpots?.some((p) => p.x === nav.x && p.y === nav.y && p.plane === nav.plane) ? 'resource' : 'wiki';
    return { stepId: step.id, x: nav.x, y: nav.y, plane: nav.plane, label: nav.label, source };
  }
  const wp = toInGameTarget(step, opts.branch)?.worldPoint;
  if (!wp) return null;
  return { stepId: step.id, x: wp.x, y: wp.y, plane: wp.plane, label: wp.label ?? step.title, source: opts.branch ? 'branch' : 'step' };
}
