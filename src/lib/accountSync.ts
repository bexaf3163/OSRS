// «Синхронизировать с аккаунтом»: игра знает, какие квесты завершены и какие уровни взяты, — шаги маршрута
// с такой автоотметкой можно закрыть сразу, не дожидаясь, пока игрок пройдёт их при включённом плагине.
// Шаги, где автоотметка требует ещё и предметы (квест и купленный Dragon scimitar), не трогаем: по квесту
// нельзя понять, что вещь уже куплена.

import type { PlayerStats, Progress, Step } from '../types';
import { isClosed } from './next-step';

export interface SyncCandidate {
  step: Step;
  /** Почему можно отметить: «квест выполнен», «все уровни взяты». */
  why: string;
}

/** Название квеста как ключ сравнения: регистр, апострофы и знаки не важны. */
export const questKey = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '');

export function syncCandidates(steps: readonly Step[], p: Progress, questsDone: readonly string[] | null, levels: PlayerStats | null): SyncCandidate[] {
  const done = new Set((questsDone ?? []).map(questKey));
  const out: SyncCandidate[] = [];
  for (const step of steps) {
    if (isClosed(p, step.id)) continue;
    const t = step.inGame?.completionTrigger;
    if (!t || t.items?.length) continue;
    if (t.type === 'QUEST_COMPLETED' && t.questName && done.has(questKey(t.questName))) {
      out.push({ step, why: `квест ${t.questName} выполнен` });
    } else if (t.type === 'SKILL_LEVEL' && levels && t.levels?.length && t.levels.every((l) => (levels[l.skill] ?? 0) >= l.level)) {
      out.push({ step, why: 'нужные уровни уже взяты' });
    }
  }
  return out;
}
