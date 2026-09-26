// Список квестов из шагов маршрута. Квест из нескольких шагов (Dragon Slayer I) — одна запись.

import type { Quest, Step } from '../types';

/** Название квеста по ссылке на вики: …/w/Dragon_Slayer_I → «Dragon Slayer I». */
function questName(step: Step): string {
  const m = step.wikiUrl?.match(/\/w\/([^/#?]+)$/);
  return m ? decodeURIComponent(m[1]).replace(/_/g, ' ') : step.title;
}

/**
 * Шаг-квест без очков — часть следующего квеста с очками в том же этапе, если у него нет
 * своего квеста (Quick guide) или это тот же квест: S5-01…S5-08 → Dragon Slayer I.
 * Иначе это отдельный квест без очков: вступление Fairytale II, начало Recipe for Disaster.
 */
export function deriveQuests(steps: Step[]): Quest[] {
  const quests = steps.filter((s) => s.type === 'quest');
  const partOf = new Map<string, string>();
  quests.forEach((s, i) => {
    if (s.qp) return;
    const owner = quests.slice(i + 1).find((q) => q.stage === s.stage && q.qp);
    if (owner && (!s.quickGuideUrl || questName(s) === questName(owner))) partOf.set(s.id, owner.id);
  });

  return quests
    .filter((s) => !partOf.has(s.id))
    .map((s) => {
      const parts = quests.filter((q) => partOf.get(q.id) === s.id).map((q) => q.id);
      return {
        stepId: s.id,
        title: parts.length ? questName(s) : s.title.replace(/\s*\(.*\)$/, ''),
        ...(s.titleRu ? { titleRu: s.titleRu } : {}),
        stage: s.stage,
        qp: s.qp ?? 0,
        parts: parts.length ? [...parts, s.id] : [],
        ...(s.membersOnly ? { membersOnly: true } : {}),
      };
    });
}
