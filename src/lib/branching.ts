// A step's quick options for the player's stats: "⚡ You have Magic 25: Varrock Teleport".
// Levels come from RuneLite, and without it, from those entered manually on the skills page.
// The main route is not hidden: an option only adds to it.

import type { BranchCondition, BranchNeed, PlayerStats, Progress, Step, StepBranch } from '../types';
import { nameKey, ownedTotal, type OwnedState } from './checklist';
import { heldOf, levelsOf } from './playerState';

/** available means the condition is met; locked means surely not met; unknown means no data (RuneLite is off, the level is not entered). */
export type BranchStatus = 'available' | 'locked' | 'unknown';

export interface BranchContext {
  /** Levels from RuneLite; null means no connection. */
  stats: PlayerStats | null;
  progress: Progress;
  steps: Step[];
  owned: OwnedState | null;
}

export interface ConditionResult {
  status: BranchStatus;
  /** The current value: a level or how many items there are. */
  have?: number;
  need?: number;
  /** Where the value comes from: the game or manual entry. */
  source?: 'runelite' | 'manual' | 'progress';
}

/** What the option lacks: has is how many there are, certain is whether it is sure (the bank was opened or the item in the bag is known). */
export interface MissingNeed {
  label: string;
  have: number;
  need: number;
  certain: boolean;
}

export interface BranchResult extends ConditionResult {
  branch: StepBranch;
  /** The level is there but the items are lacking (certain) or not visible (not certain: the bank was not opened). */
  missing?: MissingNeed[];
}

export const SKILL_NAMES: Record<string, string> = {
  attack: 'Attack', strength: 'Strength', defence: 'Defence', ranged: 'Ranged', prayer: 'Prayer', magic: 'Magic',
  runecraft: 'Runecraft', hitpoints: 'Hitpoints', crafting: 'Crafting', mining: 'Mining', smithing: 'Smithing',
  fishing: 'Fishing', cooking: 'Cooking', firemaking: 'Firemaking', woodcutting: 'Woodcutting', agility: 'Agility',
  herblore: 'Herblore', thieving: 'Thieving', fletching: 'Fletching', slayer: 'Slayer', farming: 'Farming',
  construction: 'Construction', hunter: 'Hunter', sailing: 'Sailing',
};

export function evaluateCondition(c: BranchCondition, ctx: BranchContext): ConditionResult {
  switch (c.type) {
    case 'SKILL_LEVEL': {
      if (!c.skill || !c.minLevel) return { status: 'unknown' };
      const need = c.minLevel;
      // The same level calculation as the step's readiness: the game wins over a manual entry; if there is neither, it is unknown.
      const lv = levelsOf(ctx.stats, ctx.progress.levels ?? {})[c.skill];
      if (!lv?.known) return { status: 'unknown', need };
      return { status: lv.value >= need ? 'available' : 'locked', have: lv.value, need, source: lv.source === 'game' ? 'runelite' : 'manual' };
    }
    case 'QUEST_COMPLETED': {
      if (!c.questName) return { status: 'unknown' };
      const step = ctx.steps.find((s) => s.type === 'quest' && nameKey(s.title) === nameKey(c.questName!));
      if (!step) return { status: 'unknown' };
      return { status: ctx.progress.steps[step.id] === 'done' ? 'available' : 'locked', source: 'progress' };
    }
    case 'ITEM_OWNED': {
      if (!c.itemName) return { status: 'unknown' };
      // The same ownership calculation as readiness and shopping: "in neither the bag nor the bank" only when the bank was opened.
      const h = heldOf({ owned: ctx.owned, equipment: {}, manual: {}, bankSeen: ctx.owned?.bankSeen === true }, c.itemName);
      if (h.bag === null) return { status: 'unknown' };
      const have = (h.bag ?? 0) + h.noted + (h.bank ?? 0);
      if (have > 0) return { status: 'available', have, source: 'runelite' };
      return { status: h.presence === 'MISSING' ? 'locked' : 'unknown', have, source: 'runelite' };
    }
    default:
      return { status: 'unknown' };
  }
}

/**
 * Whether the items suffice: null means it cannot be said (the bridge is off, the item is not tracked). Having everything gives an empty list.
 * If something is lacking, the missing part: certain if the bank was opened or at least some of the item is in the bag; otherwise "maybe in the bank".
 */
export function missingNeeds(needs: readonly BranchNeed[] | undefined, owned: OwnedState | null): MissingNeed[] | null {
  if (!needs?.length) return [];
  if (!owned) return null;
  const out: MissingNeed[] = [];
  let anyKnown = false;
  for (const n of needs) {
    if ((n.unless ?? []).some((u) => (ownedTotal(owned, u) ?? 0) > 0)) { anyKnown = true; continue; }
    const totals = n.items.map((name) => ownedTotal(owned, name));
    if (totals.every((t) => t === null)) continue; // the plugin reported nothing about this item
    anyKnown = true;
    const have = totals.reduce<number>((s, t) => s + (t ?? 0), 0);
    if (have >= n.count) continue;
    out.push({ label: n.label, have, need: n.count, certain: Boolean(owned.bankSeen) });
  }
  return out.length || anyKnown ? out : null;
}

export function evaluateBranches(step: Step, ctx: BranchContext): BranchResult[] {
  return (step.branches ?? []).map((branch) => {
    const r = evaluateCondition(branch.condition, ctx);
    if (r.status !== 'available' || !branch.needs?.length) return { branch, ...r };
    const missing = missingNeeds(branch.needs, ctx.owned);
    return missing && missing.length ? { branch, ...r, missing } : { branch, ...r };
  });
}

/** The condition label: "Magic 25", "after Lost City", "has Chronicle". */
export function conditionLabel(c: BranchCondition): string {
  switch (c.type) {
    case 'SKILL_LEVEL':
      return `${SKILL_NAMES[c.skill ?? ''] ?? c.skill} ${c.minLevel}`;
    case 'QUEST_COMPLETED':
      return `after ${c.questName}`;
    case 'ITEM_OWNED':
      return `has ${c.itemName}`;
    default:
      return '';
  }
}

/** Why the option is available: "you have Magic 25 (from the game)", "Lost City complete", "Chronicle in hand". */
export function reasonLabel(r: ConditionResult & { branch: StepBranch }): string {
  const c = r.branch.condition;
  const from = r.source === 'runelite' ? ' (from the game)' : r.source === 'manual' ? ' (entered manually)' : '';
  switch (c.type) {
    case 'SKILL_LEVEL':
      return `you have ${SKILL_NAMES[c.skill ?? ''] ?? c.skill} ${r.have ?? ''}${from}`;
    case 'QUEST_COMPLETED':
      return `${c.questName} complete`;
    case 'ITEM_OWNED':
      return `${c.itemName} in hand${from}`;
    default:
      return '';
  }
}

/** The items from a step's conditions: the plugin must report how many of them there are. */
export function watchedItems(step: Step): string[] {
  const names = (step.branches ?? []).flatMap((b) => [
    ...(b.condition.type === 'ITEM_OWNED' && b.condition.itemName ? [b.condition.itemName] : []),
    ...(b.needs ?? []).flatMap((n) => [...n.items, ...(n.unless ?? [])]),
  ]);
  return [...new Set(names)].slice(0, 40);
}

/** "~2 min" from seconds. */
export function formatSaving(seconds: number): string {
  return seconds < 90 ? `~${Math.round(seconds)} s` : `~${Math.round(seconds / 60)} min`;
}
