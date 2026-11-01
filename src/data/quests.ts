// The list of quests from the route steps. A quest of several steps (Dragon Slayer I) is one entry.

import type { Quest, Step } from '../types';

/** The quest name from a wiki link: .../w/Dragon_Slayer_I gives "Dragon Slayer I". */
function questName(step: Step): string {
  const m = step.wikiUrl?.match(/\/w\/([^/#?]+)$/);
  return m ? decodeURIComponent(m[1]).replace(/_/g, ' ') : step.title;
}

/**
 * A quest step without points is part of the next quest with points in the same stage if it has no
 * quest of its own (Quick guide) or it is the same quest: S5-01...S5-08 is Dragon Slayer I.
 * Otherwise it is a separate quest without points: the Fairytale II start, the beginning of Recipe for Disaster.
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
        stage: s.stage,
        qp: s.qp ?? 0,
        parts: parts.length ? [...parts, s.id] : [],
        ...(s.membersOnly ? { membersOnly: true } : {}),
      };
    });
}
