import { describe, expect, it } from 'vitest';
import { allSteps } from '../src/data';
import stagesFile from '../src/data/questStages.json';
import { navigationTarget } from '../src/lib/navigation';
import { stepGuide } from '../src/services/runeliteBridge';

// The whole guide, F2P and members, from S1-01 to the last step. The F2P route audit (fullF2pRouteAudit.test.ts) stops at the Dragon Slayer
// finale and only looks at the quests that have a stage table, so a quest without one passed unseen: Shield of Arrav's card stayed on "Talk to
// Reldo" after Reldo was talked to (live game, 2.53). What a player needs from every step: the card knows where they are in it, and says where to go.

type Line = { t: string; at?: number[]; has?: string; need?: string; hl?: unknown };
type Row = { at: number; do: Line[]; go?: unknown };
const quests = (stagesFile as unknown as { quests: Record<string, { var: [string, number]; stages: Row[] }> }).quests;

/** Steps with no place in the world, by name and why. A new one must be added here on purpose. */
const NO_PLACE: Record<string, string> = {
  'S1-01': 'setting up the RuneLite client happens outside the game',
  'S6-04': 'Magic is trained anywhere: combat spells on any monster, Superheat Item and High Level Alchemy need no place',
};

/** Stage rows whose first line has no place: an action in the bag or an interface, or waiting. Known, and the list must not grow. */
const ROW_WITHOUT_PLACE = new Set(['S8-02#75', 'S8-05#200', 'S8-05#220', 'S9-03#5']);

describe('the whole guide: every quest is followed by the game', () => {
  it('every quest step has a stage table on a quest variable, so the card moves with the quest', () => {
    const quest = allSteps.filter((s) => s.type === 'quest');
    expect(quest.length).toBeGreaterThanOrEqual(40);
    const without = quest.filter((s) => !quests[s.id]).map((s) => s.id);
    expect(without).toEqual([]);
    for (const s of quest) {
      const q = quests[s.id];
      expect(['varp', 'varbit'], s.id).toContain(q.var[0]);
      expect(Number.isInteger(q.var[1]) && q.var[1] > 0, s.id).toBe(true);
      const g = stepGuide(s);
      expect(g.stage, `${s.id}: the table reaches the game`).toMatchObject({ kind: q.var[0], id: q.var[1] });
    }
  });

  it('the rows of a table are in order and the first one starts at 0, so every value of the variable has a row', () => {
    for (const [id, q] of Object.entries(quests)) {
      const at = q.stages.map((r) => r.at);
      expect(at, id).toEqual([...at].sort((a, b) => a - b));
      expect(new Set(at).size, id).toBe(at.length);
      // Dragon Slayer is split over several route steps on one variable: only its first part starts at 0.
      if (!/^S5-0[2-9]$/.test(id)) expect(at[0], id).toBe(0);
    }
  });

  it('a stage row starts with a place to go (a tile, a highlighted NPC or object, or the row\'s own place), except the known in-bag and waiting rows', () => {
    const rows: string[] = [];
    for (const [id, q] of Object.entries(quests)) {
      for (const r of q.stages) if (!r.do[0].at && !r.do[0].hl && !r.go) rows.push(`${id}#${r.at}`);
    }
    for (const r of rows) expect(ROW_WITHOUT_PLACE.has(r), `${r}: the row starts with no place to go`).toBe(true);
  });
});

describe('the whole guide: every step says where to go', () => {
  it('every step has a point the arrow leads to, or is on the short list of steps with no place, with the reason', () => {
    const missing = allSteps.filter((s) => !navigationTarget(s)).map((s) => s.id);
    expect(missing).toEqual(Object.keys(NO_PLACE));
    for (const [id, why] of Object.entries(NO_PLACE)) expect(why.length, id).toBeGreaterThan(20);
  });

  it('the places a step sends to the game are on a real plane and labelled', () => {
    for (const s of allSteps) {
      for (const p of stepGuide(s).places) {
        expect([p.x, p.y, p.plane].every(Number.isInteger), s.id).toBe(true);
        expect(p.plane >= 0 && p.plane <= 3, s.id).toBe(true);
        expect(p.label.trim().length, s.id).toBeGreaterThan(3);
      }
    }
  });
});
