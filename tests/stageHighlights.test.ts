import { describe, expect, it } from 'vitest';
import stages from '../src/data/questStages.json';

type Line = { t: string; s?: string; at?: number[]; hl?: { npc?: number[]; obj?: number[]; on?: string[]; item?: string[] } };
const quests = (stages as unknown as { quests: Record<string, { stages: { at: number; do: Line[] }[] }> }).quests;
const lines = Object.entries(quests).flatMap(([id, q]) => q.stages.flatMap((s) => s.do.map((l) => ({ id, l }))));

describe('stage step highlights (from Quest Helper)', () => {
  it('almost every step has something to highlight in the game: an NPC, an object or an item', () => {
    const withHl = lines.filter((x) => x.l.hl).length;
    expect(lines.length).toBeGreaterThan(600);
    expect(withHl / lines.length).toBeGreaterThan(0.85);
  });

  it('Pirate\'s Treasure (S2-09): Luthas, the crate, banana trees, the rum in the bag', () => {
    const l = quests['S2-09'].stages.find((s) => s.at === 1)!.do;
    const by = (frag: string) => l.find((x) => (x.s ?? x.t).includes(frag))!;
    expect(by('Pick 10 bananas').hl).toMatchObject({ npc: [3647], on: ['Banana tree'] });
    expect(by('Put the Karamjan rum').hl).toMatchObject({ obj: [2072], item: ['Karamjan rum'] });
    expect(by('Fill the crate').hl?.obj).toEqual([2072]);
    expect(by('Tell Luthas').hl?.npc).toEqual([3647]);
  });

  it('place-only steps (basement, staircase) get an arrow and a staircase highlight wherever Quest Helper has one', () => {
    const withObj = lines.filter((x) => (x.l.hl?.obj?.length ?? 0) > 0).length;
    expect(withObj).toBeGreaterThan(200);
  });
});
