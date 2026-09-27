// Быстрые варианты шага для статов игрока: «⚡ У тебя Magic 25 — Varrock Teleport».
// Уровни берутся из RuneLite, а без него — введённые вручную на странице навыков.
// Основной путь не прячется: вариант только дополняет его.

import type { BranchCondition, PlayerStats, Progress, Step, StepBranch } from '../types';
import { nameKey, ownedTotal, type OwnedState } from './checklist';

/** available — условие выполнено; locked — точно не выполнено; unknown — данных нет (RuneLite выключен, уровень не введён). */
export type BranchStatus = 'available' | 'locked' | 'unknown';

export interface BranchContext {
  /** Уровни из RuneLite; null — связи нет. */
  stats: PlayerStats | null;
  progress: Progress;
  steps: Step[];
  owned: OwnedState | null;
}

export interface ConditionResult {
  status: BranchStatus;
  /** Текущее значение: уровень или сколько предметов есть. */
  have?: number;
  need?: number;
  /** Откуда значение: из игры или из ручного ввода. */
  source?: 'runelite' | 'manual' | 'progress';
}

export interface BranchResult extends ConditionResult {
  branch: StepBranch;
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
      const fromGame = ctx.stats?.[c.skill];
      if (typeof fromGame === 'number') return { status: fromGame >= need ? 'available' : 'locked', have: fromGame, need, source: 'runelite' };
      // Уровень, введённый вручную, — только если его действительно вводили (по умолчанию уровня нет).
      const manual = ctx.progress.levels[c.skill];
      if (typeof manual === 'number') return { status: manual >= need ? 'available' : 'locked', have: manual, need, source: 'manual' };
      return { status: 'unknown', need };
    }
    case 'QUEST_COMPLETED': {
      if (!c.questName) return { status: 'unknown' };
      const step = ctx.steps.find((s) => s.type === 'quest' && nameKey(s.title) === nameKey(c.questName!));
      if (!step) return { status: 'unknown' };
      return { status: ctx.progress.steps[step.id] === 'done' ? 'available' : 'locked', source: 'progress' };
    }
    case 'ITEM_OWNED': {
      if (!c.itemName) return { status: 'unknown' };
      const have = ownedTotal(ctx.owned, c.itemName);
      if (have === null) return { status: 'unknown' };
      if (have > 0) return { status: 'available', have, source: 'runelite' };
      // Нет ни в сумке, ни в банке — но без открытого банка это ещё не «нет».
      return { status: ctx.owned?.bankSeen ? 'locked' : 'unknown', have, source: 'runelite' };
    }
    default:
      return { status: 'unknown' };
  }
}

export function evaluateBranches(step: Step, ctx: BranchContext): BranchResult[] {
  return (step.branches ?? []).map((branch) => ({ branch, ...evaluateCondition(branch.condition, ctx) }));
}

/** Подпись условия: «Magic 25», «после Lost City», «есть Chronicle». */
export function conditionLabel(c: BranchCondition): string {
  switch (c.type) {
    case 'SKILL_LEVEL':
      return `${SKILL_NAMES[c.skill ?? ''] ?? c.skill} ${c.minLevel}`;
    case 'QUEST_COMPLETED':
      return `после ${c.questName}`;
    case 'ITEM_OWNED':
      return `есть ${c.itemName}`;
    default:
      return '';
  }
}

/** Почему вариант доступен: «у тебя Magic 25 (из игры)», «Lost City выполнен», «Chronicle есть». */
export function reasonLabel(r: ConditionResult & { branch: StepBranch }): string {
  const c = r.branch.condition;
  const from = r.source === 'runelite' ? ' (из игры)' : r.source === 'manual' ? ' (введено вручную)' : '';
  switch (c.type) {
    case 'SKILL_LEVEL':
      return `у тебя ${SKILL_NAMES[c.skill ?? ''] ?? c.skill} ${r.have ?? ''}${from}`;
    case 'QUEST_COMPLETED':
      return `${c.questName} выполнен`;
    case 'ITEM_OWNED':
      return `${c.itemName} есть${from}`;
    default:
      return '';
  }
}

/** Предметы из условий шага — о них плагин должен сообщать, сколько их есть. */
export function watchedItems(step: Step): string[] {
  return (step.branches ?? []).flatMap((b) => (b.condition.type === 'ITEM_OWNED' && b.condition.itemName ? [b.condition.itemName] : []));
}

/** «~2 мин» из секунд. */
export function formatSaving(seconds: number): string {
  return seconds < 90 ? `~${Math.round(seconds)} с` : `~${Math.round(seconds / 60)} мин`;
}
