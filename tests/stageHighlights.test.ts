import { describe, expect, it } from 'vitest';
import stages from '../src/data/questStages.json';

type Line = { t: string; s?: string; at?: number[]; hl?: { npc?: number[]; obj?: number[]; on?: string[]; item?: string[] } };
const quests = (stages as unknown as { quests: Record<string, { stages: { at: number; do: Line[] }[] }> }).quests;
const lines = Object.entries(quests).flatMap(([id, q]) => q.stages.flatMap((s) => s.do.map((l) => ({ id, l }))));

describe('подсветка шагов этапов (по Quest Helper)', () => {
  it('почти у каждого шага есть, что подсветить в игре — NPC, объект или предмет', () => {
    const withHl = lines.filter((x) => x.l.hl).length;
    expect(lines.length).toBeGreaterThan(600);
    expect(withHl / lines.length).toBeGreaterThan(0.85);
  });

  it('Pirate\'s Treasure (S2-09): Luthas, ящик, банановые пальмы, ром в сумке', () => {
    const l = quests['S2-09'].stages.find((s) => s.at === 1)!.do;
    const by = (frag: string) => l.find((x) => (x.s ?? x.t).includes(frag))!;
    expect(by('Нарви').hl).toMatchObject({ npc: [3647], on: ['Banana tree'] });
    expect(by('Положи Karamjan rum').hl).toMatchObject({ obj: [2072], item: ['Karamjan rum'] });
    expect(by('Заполни Crate').hl?.obj).toEqual([2072]);
    expect(by('Скажи Luthas').hl?.npc).toEqual([3647]);
  });

  it('шаги из «только место» (подвал, лестница) — со стрелкой и подсветкой лестницы там, где она у Quest Helper есть', () => {
    const withObj = lines.filter((x) => (x.l.hl?.obj?.length ?? 0) > 0).length;
    expect(withObj).toBeGreaterThan(200);
  });
});
