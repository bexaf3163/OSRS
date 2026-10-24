import { describe, expect, it } from 'vitest';
import { allSteps } from '../src/data';
import stagesFile from '../src/data/questStages.json';

type Pre = { item: string; at?: number[]; alt?: string[] };
type Line = { k?: string; has?: string; pre?: Pre[] };
const quests = (stagesFile as unknown as { quests: Record<string, { stages: { at: number; do: Line[] }[] }> }).quests;
const key = (n: string) => n.toLowerCase().replace(/\(\d\)$/, '').replace(/\s*[x×]\s*\d+$/, '').trim();

describe('the in-game bag checks match the step kit', () => {
  // A line's pre stops the arrow until the item is in the bag. When the item is bought or brought (no place to get it during the quest, not got by an
  // earlier line), the step must list it, or readiness says "ready" while the game sends the player away (S7-03/S7-05 lobsters, found in 2.74.7).
  it('every brought item a line checks is in the step kit', () => {
    const missing: string[] = [];
    for (const step of allSteps) {
      const g = quests[step.id];
      if (!g) continue;
      const listed = new Set([...(step.itemsRequired ?? []), ...(step.itemsRecommended ?? [])].flatMap((i) => [i.nameEn, ...(i.anyOf ?? [])]).map(key));
      for (const l of step.loadouts ?? []) for (const t of l.take) listed.add(key(t.nameEn));
      for (const st of g.stages) {
        const got = new Set<string>();
        for (const line of st.do) {
          for (const p of line.pre ?? []) {
            if (p.at || got.has(key(p.item)) || listed.has(key(p.item)) || (p.alt ?? []).some((a) => listed.has(key(a)))) continue;
            missing.push(`${step.id} ${st.at}:${line.k} ${p.item}`);
          }
          if (line.has) got.add(key(line.has));
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
