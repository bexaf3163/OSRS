import { describe, expect, it } from 'vitest';
import { allSteps, questFactsJson } from '../../src/data';
import { questFacts } from '../../scripts/data/quest-facts';
import { questGraph } from '../../src/domain/planning/questGraph';

describe('revision-backed quest facts', () => {
  it('preserves executable authored IDs and only actual quest prerequisites in an acyclic graph', () => {
    const items = questFactsJson.items;
    expect(items.length).toBe(35);
    expect(items.filter(q => !q.members).length).toBe(23);
    // Members cards write prerequisites as "Completion of [[A]]" or a list under "Completion of the following quests".
    expect(items.find(q => q.id === 'Nature Spirit')!.requirements.quests).toEqual(['Priest in Peril', 'The Restless Ghost']);
    expect(items.find(q => q.id === 'Monkey Madness I')!.requirements.quests).toEqual(['The Grand Tree', 'Tree Gnome Village']);
    expect(() => questGraph(items.map(q => ({ id: q.id, requires: q.requirements.quests })))).not.toThrow();
    for (const q of items) {
      expect(q.source.revision).toBeGreaterThan(0);
      expect(q.source.url).toContain(String(q.source.revision));
      for (const id of q.stepIds) expect(allSteps.some(step => step.id === id), id).toBe(true);
    }
    expect(items.find(q => q.id === 'Goblin Diplomacy')!.requirements.quests).toEqual([]);
    expect(items.find(q => q.id === "The Knight's Sword")!.requirements.skills).toEqual({ mining: 10 });
    expect(items.find(q => q.id === "Doric's Quest")!.rewards.xp.mining).toBe(1300);
    expect(items.find(q => q.id === 'Dragon Slayer I')!.requirements.questPoints).toBe(32);
    expect(items.find(q => q.id === 'Dragon Slayer I')!.stepIds.length).toBeGreaterThan(1);
  });
  it('does not allocate lamp XP, promote recommendations or invent a duration from a length category', () => {
    const q = questFacts({ title: 'Synthetic quest', revision: 3, wikitext: '{{Quest details|length=Short|requirements={{SCP|Mining|10}}|recommended={{SCP|Combat|40}}}}\n{{Quest rewards|qp=1|rewards=*{{SCP|Mining|1,300}} experience\n*A lamp giving 500 XP\n*An unlock with {{SCP|Sailing|60}}}}' }, ['old-id'], '2026-11-06');
    expect(q.requirements.skills).toEqual({ mining: 10 });
    expect(q.rewards.xp).toEqual({ mining: 1300 });
    expect(q).not.toHaveProperty('minutes');
    expect(() => questFacts({ title: 'broken', revision: 1, wikitext: '' }, [], 'today')).toThrow(/missing/);
  });
  it('keeps reviewed physical flows bound to their exact source revision and requires a new review after source changes', () => {
    const article = { title: "Doric's Quest", revision: 15367060, wikitext: '{{Quest details|requirements=None}}\n{{Quest rewards|qp=1|rewards=}}' };
    expect(questFacts(article, ['old-id'], 'today').resourceFlow?.consumes).toEqual([
      { name: 'Clay', count: 6 }, { name: 'Copper ore', count: 4 }, { name: 'Iron ore', count: 2 },
    ]);
    expect(questFacts({ ...article, revision: article.revision + 1 }, ['old-id'], 'today').resourceFlow).toBeNull();
    expect(questFacts({ ...article, title: 'New quest' }, ['old-id'], 'today').resourceFlow).toBeNull();
  });
  it('keeps direct cash separate from chest access, retrieval fees and later claims', () => {
    const parse = (rewards: string) => questFacts({ title: 'fixture', revision: 1,
      wikitext: `{{Quest details|requirements=None}}\n{{Quest rewards|qp=1|rewards=${rewards}}}` }, ['old-id'], '2026-11-06').rewards.coins;
    expect(parse('*2,000 coins\n*60 [[Coins]]')).toBe(2060);
    expect(parse('*Access to a chest containing 450 [[coins]]')).toBeNull();
    expect(parse('*A weapon (reclaim for 500 [[coins]])')).toBeNull();
    expect(parse('*Receive 300 coins by speaking to an NPC later')).toBeNull();
    expect(parse('*A lamp giving 500 XP')).toBe(0);
  });
  it('does not let a recognised skill hide another unparsed requirement or turn an escape option into mandatory combat', () => {
    const parse = (requirements: string) => questFacts({ title: 'fixture', revision: 1,
      wikitext: `{{Quest details|requirements=${requirements}}}\n{{Quest rewards|qp=1|rewards=}}` }, ['old-id'], '2026-11-06');
    expect(parse('*{{SCP|Mining|10}}\n*A special unmodelled unlock').requirements.unparsed).toContain('special unmodelled unlock');
    const escape = parse('Capable of killing or running away from a [[combat level]] 13 [[skeleton]].');
    expect(escape.requirements.capabilities).toEqual(['survival']);
    expect(escape.requirements.unparsed).toBeNull();
  });
});
