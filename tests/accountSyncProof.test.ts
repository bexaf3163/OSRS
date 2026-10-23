import { describe, expect, it } from 'vitest';
import { syncCandidates, earlierUnverified } from '../src/lib/accountSync';
import { emptyProgress } from '../src/lib/progress';
import type { Step } from '../src/types';

const training = {
  id: 'TRAIN', requires: [], type: 'skill',
  inGame: { completionTrigger: { type: 'SKILL_LEVEL', levels: [{ skill: 'mining', level: 15 }] } },
} as unknown as Step;

describe('account sync requires proof of the complete goal', () => {
  it('a reached level does not prove the required loot is still owned', () => {
    const mixed = { ...training, inGame: { completionTrigger: { ...training.inGame!.completionTrigger!, items: [{ names: ['Copper ore'], count: 5 }] } } };
    expect(syncCandidates([mixed], emptyProgress(), [], { mining: 15 })).toEqual([]);
  });
  it('a reached level does not prove a carryover stock goal', () => {
    const carry = { ...training, carryover: [{ item: 'Copper ore', count: 5, forStep: 'NEXT', where: 'bank' as const, why: 'needed later' }] };
    expect(syncCandidates([carry], emptyProgress(), [], { mining: 15 })).toEqual([]);
  });
  it('non-finite levels do not count as reached goals', () => {
    for (const mining of [Infinity, NaN]) expect(syncCandidates([training], emptyProgress(), [], { mining })).toEqual([]);
  });
  it('a genuine pure level goal still syncs without quest data', () => {
    expect(syncCandidates([training], emptyProgress(), null, { mining: 15 }).map(c => c.step.id)).toEqual(['TRAIN']);
    expect(syncCandidates([training], emptyProgress(), null, null)).toEqual([]);
  });
  it('a completed quest does not prove its convenience-route ancestors', () => {
    const buy = { id: 'BUY', requires: [], type: 'shopping' } as unknown as Step;
    const wrongQuest = { id: 'OTHER', requires: [], inGame: { completionTrigger: { type: 'QUEST_COMPLETED', questName: 'Prince Ali Rescue' } } } as unknown as Step;
    const quest = { id: 'QUEST', requires: ['BUY', 'OTHER'], inGame: { completionTrigger: { type: 'QUEST_COMPLETED', questName: 'Goblin Diplomacy' } } } as unknown as Step;
    const steps = [buy, wrongQuest, quest];
    const proved = syncCandidates(steps, emptyProgress(), ['Goblin Diplomacy'], null);
    expect(proved.map(c => c.step.id)).toEqual(['QUEST']);
    expect(earlierUnverified(steps, emptyProgress(), proved, ['Goblin Diplomacy'], null).map(c => c.step.id)).toEqual(['BUY']);
  });
});
