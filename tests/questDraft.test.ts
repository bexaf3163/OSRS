import { describe, expect, it } from 'vitest';
import { buildDraft, checkDraft, plain, routeOf, sourceLine, stageOrder, type QhFacts } from '../scripts/data/quest-draft';

// A two-stage quest as Quest Helper gives it: talk, then a conditional stage (default first, furthest progress last).
const qh: QhFacts = {
  title: 'Test Quest', cls: 'TestQuest', var: ['varp', 999], members: true, revision: 'abc',
  machine: {
    stages: { 0: { s: 'talk' }, 1: 'n1' },
    nodes: { n1: { n: 'fetch', c: [[{ o: 'item', nm: 'Rope', ids: [954] }, { s: 'useRope' }]], d: { s: 'getRope' } } },
    reqs: {}, alias: {},
  },
  unknown: {},
  steps: {
    talk: { typ: 'NpcStep', wp: [3200, 3200, 0], ids: [1], text: 'Talk to the guide in Lumbridge to start the quest.' },
    getRope: { typ: 'ObjectStep', wp: [3210, 3210, 0], ids: [20], text: 'Take the rope from the crate.' },
    useRope: { typ: 'ObjectStep', wp: [3220, 3220, 1], ids: [21], text: 'Use the rope on the well.' },
  },
};
const card = `{{Quest details|start=Talk to the [[Guide]] in [[Lumbridge]].|startmap=3200,3200|members=Yes|difficulty=Novice|length=Short
|items=* 2 [[Rope]]s\n* [[Mystery box]]|kills=[[Giant rat]] (level 3)}}{{Quest rewards|qp=2|rewards=* 2 quest points}}`;
const guide = `==Walkthrough==\n===Start===\n{{Checklist|*Talk to the [[Guide]]. {{Chat option|1Yes.|2I'll help.}}\n**A note.\n*Take the [[rope]].}}\n==Rewards==\n*Nothing here`;
const sources = () => ({
  qh, retrievedAt: '2026-11-14', foes: new Set(['Giant rat']), tradeable: new Set([954]),
  article: { title: 'Test Quest', revision: 7, wikitext: card }, guide: { title: 'Test Quest/Quick guide', revision: 8, wikitext: guide },
  items: new Map([['rope', { id: 954, nameEn: 'Rope', buyLocations: [{ shopName: 'Ned', location: 'Draynor Village', price: 18, stock: 1 }] }]]) as never,
});

describe('quest drafts hold only what a source gives', () => {
  it('reads the route, the dialogue and item sources without inventing anything', () => {
    expect(plain("Talk to [[Sanfew|him]]. {{Chat option|2I'm in.|1Okay.}} {{SCP|Herblore|3}}")).toBe('Talk to him. Dialogue: "I\'m in.", "Okay."');
    expect(routeOf(guide)).toEqual([{ title: 'Start', steps: ['Talk to the Guide. Dialogue: "Yes.", "I\'ll help."', 'Take the rope.'] }]);
    expect(stageOrder(qh.machine, 'n1')).toEqual(['getRope', 'useRope']);
    expect(sourceLine(undefined, true)).toBe('Buy on the Grand Exchange.');
    expect(sourceLine(undefined, false)).toBeNull();
  });

  it('copies tiles, ids and rewards from the sources and lists what none of them confirms', () => {
    const draft = buildDraft(sources());
    expect(draft.stages).toMatchObject({ var: ['varp', 999], stages: [{ at: 0, do: [{ k: 'talk', at: [3200, 3200, 0], hl: { npc: [1] } }] }, { at: 1, do: [{ k: 'getRope' }, { k: 'useRope', hl: { obj: [21] } }] }] });
    expect(draft.step).toMatchObject({ qp: 2, membersOnly: true, mapLocation: { x: 3200, y: 3200 }, npc: { nameEn: 'Guide' }, foes: ['Giant rat'] });
    expect(draft.step.itemsRequired).toEqual([
      { nameEn: 'Rope', amount: 2, wikiItemId: 954, howToGet: 'Buy on the Grand Exchange, or from Ned in Draynor Village for 18 gp.', note: '2 Ropes' },
      { nameEn: 'Mystery box', amount: 1, wikiItemId: null, howToGet: null },
    ]);
    expect(draft.unknown).toEqual(expect.arrayContaining([
      'item "Mystery box": no id in Quest Helper or on its Wiki card', 'item "Mystery box": where to get it is not written',
      'fight "Giant rat": not in the combat audit', 'what the quest uses up and hands out is not reviewed',
    ]));
    expect(checkDraft(draft, qh)).toEqual([]);
  });

  it('fails an edit that contradicts Quest Helper: a moved tile, a foreign id, a dropped step, an overlong line', () => {
    const draft = buildDraft(sources());
    draft.stages.stages[0].do[0].at = [3201, 3200, 0];
    draft.stages.stages[0].do[0].hl = { npc: [2] };
    draft.stages.stages[1].do.pop();
    draft.stages.stages[1].do[0].s = 'x'.repeat(71);
    draft.stages.stages[1].do[0].t = draft.stages.stages[0].do[0].t;
    draft.step.qp = 3;
    expect(checkDraft(draft, qh)).toEqual([
      'stage 0 "talk": tile 3201,3200,0 is not Quest Helper\'s 3200,3200,0', 'stage 0 "talk": highlight 2 is not a Quest Helper id',
      'stage 1: Quest Helper step "useRope" has no line', 'stage 1 "getRope": the short line must be 1 to 70 characters, has 71',
      `stage 1 "getRope": the same full text is short "${draft.stages.stages[0].do[0].s}" elsewhere`,
      'quest points 3 are not the quest card\'s 2',
    ]);
  });
});

// Every shipped quest line stands on real ground: a tile with no walkable tile within 3 is a wrong coordinate.
describe('shipped quest stages', () => {
  it('put no line off the ground in the walking data', async () => {
    const { readFileSync } = await import('node:fs');
    const { collisionSubset } = await import('../src/domain/travel/worldRouting');
    const { replayStages } = await import('../scripts/data/quest-draft');
    const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
    const topology = collisionSubset(read('src/data/generated/worldRouting.json'));
    const steps = read('src/data/authored/steps.json') as { id: string; mapLocation?: { x: number; y: number; plane: number } }[];
    const quests = read('src/data/authored/questStages.json').quests as Record<string, { stages: never }>;
    const fails = Object.entries(quests).flatMap(([id, q]) =>
      replayStages(q.stages, steps.find((s) => s.id === id)?.mapLocation ?? null, topology, false).fails.map((f) => `${id} ${f}`));
    expect(fails).toEqual([]);
  });
});
