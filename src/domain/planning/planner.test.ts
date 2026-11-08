import { describe, expect, it, vi } from 'vitest';
import type { Step } from '../../types';
import type { QuestFact } from './catalogue';
import type { PlanningSnapshot } from './contracts';
import { planIntent } from './planner';
import type { PlannerInput } from './planner';
import { noTime } from './cost';
import { buildPlayerState } from '../player/playerState';
import { questCatalogue } from './catalogue';
import { allSteps } from '../../data';

function fixture(): PlannerInput {
  const catalogue: QuestFact[] = ['A small quest', 'B prerequisite', 'C selected quest'].map((id, i) => ({ id, stepIds: [id], members: false,
    requirements: { skills: {}, quests: i === 2 ? ['B prerequisite'] : [], questPoints: 0, text: '' },
    rewards: { questPoints: 1, xp: {}, coins: 0 }, length: null, source: { url: 'https://example.test/source', revision: 1, retrievedAt: 'fixture' } }));
  const steps: Step[] = catalogue.map(q => ({ id: q.id, stage: 0, type: 'quest', title: q.id, requires: [], doneWhen: 'Observed quest completion' }));
  const snapshot: PlanningSnapshot = { scope: { characterId: 'fixture', mode: 'f2p', gameSessionId: 'login', snapshotRevision: 1 },
    player: buildPlayerState({ mode: 'f2p', connected: true, stats: { mining: 1 }, progress: { levels: {} }, questsDone: [],
      owned: { bankSeen: true, items: new Map([['bronze pickaxe', { name: 'Bronze pickaxe', carried: 1, noted: 0, bank: 0 }]]) },
      gear: { equipment: [], inventory: [{ id: 1265, name: 'Bronze pickaxe', count: 1 }], coins: 1000, bankCoins: 0 } }),
    xp: {}, manual: {}, quests: Object.fromEntries(catalogue.map(q => [q.id, { state: 'NOT_STARTED', source: 'game' }])),
    questPoints: { known: true, value: 0, source: 'game' } };
  return { snapshot, intent: { kind: 'auto' }, quests: { catalogue, steps, adapters: {
    prepare: () => ({ action: null, minutes: noTime(), resources: [], capabilities: {} }), work: () => noTime(), travel: () => noTime(),
    remainingPreparation: () => noTime(),
  } }, training: { adapters: { prepare: () => ({ action: null, minutes: noTime(), resources: null }), travel: () => null } } };
}

describe('one planner for the selected owner intent', () => {
  it('defaults to actual quest facts and follows only the explicit goal prerequisite frontier when selected', () => {
    const input = fixture();
    expect(planIntent(input)?.objectiveId).toBe('A small quest');
    input.intent = { kind: 'quest', questId: 'C selected quest' };
    const decision = planIntent(input)!;
    expect(decision).toMatchObject({ objectiveId: 'B prerequisite', requestedObjectiveId: 'C selected quest', followingObjectiveId: 'C selected quest' });
    expect(input.snapshot.quests['B prerequisite'].state).toBe('NOT_STARTED');
    expect(input.intent).toEqual({ kind: 'quest', questId: 'C selected quest' });
  });

  it('uses the shared phased skill goal without invoking a competing quest recommendation', () => {
    const input = fixture(), prepare = vi.fn(input.quests.adapters.prepare);
    input.quests.adapters.prepare = prepare;
    input.intent = { kind: 'training', training: { skill: 'mining', mode: 'fast', target: 10 } };
    const decision = planIntent(input)!;
    expect(decision.activeAction).toMatchObject({ kind: 'TRAIN', feasibility: 'READY' });
    expect(decision.expectedNext.effects).toEqual([{ kind: 'skill-floor', skill: 'mining', level: 6, afterSuccessOnly: true }]);
    expect(decision.estimatedRemaining).toBeNull();
    expect(prepare).not.toHaveBeenCalled();
    expect(input.snapshot.player.levels.mining).toMatchObject({ value: 1 });
  });

  it('does not silently replace an achieved explicit goal or start optional training after all quests are observed complete', () => {
    const input = fixture();
    input.intent = { kind: 'quest', questId: 'C selected quest' };
    input.snapshot.quests = { ...input.snapshot.quests, 'C selected quest': { state: 'COMPLETED', source: 'game' } };
    expect(planIntent(input)).toBeNull();
    expect(input.intent.kind).toBe('quest');
    input.intent = { kind: 'auto' };
    input.snapshot.quests = Object.fromEntries(input.quests.catalogue.map(q => [q.id, { state: 'COMPLETED', source: 'game' }]));
    expect(planIntent(input)).toBeNull();
  });

  it('commits a central verification action for protected goals, missing data or a mode-ineligible selection', () => {
    const input = fixture(), prepare = vi.fn(input.quests.adapters.prepare);
    input.quests.adapters.prepare = prepare;
    for (const intent of [null, { kind: 'quest' as const, questId: 'Unknown quest' }]) {
      const decision = planIntent({ ...input, intent })!;
      expect(decision.activeAction).toMatchObject({ kind: 'VERIFY', feasibility: 'UNKNOWN' });
      expect(decision.expectedNext.effects).toEqual([]);
      expect(decision.estimatedRemaining).toBeNull();
    }
    input.quests.catalogue = input.quests.catalogue.map(q => ({ ...q, members: true }));
    expect(planIntent(input)?.activeAction.kind).toBe('VERIFY');
    input.quests.catalogue = [];
    expect(planIntent(input)?.activeAction.kind).toBe('VERIFY');
    expect(prepare).not.toHaveBeenCalled();
  });

  it('rebuilds execution preparation from raw content at the admitted stage without reviving consumed starting ingredients', () => {
    const input = fixture(), goal = questCatalogue.find(q => q.id === 'Romeo & Juliet')!;
    input.quests.catalogue = [goal]; input.quests.steps = goal.stepIds.flatMap(id => allSteps.find(s => s.id === id) ?? []);
    input.intent = { kind: 'quest', questId: goal.id };
    const seen: Step[] = [];
    input.quests.adapters.prepare = step => { seen.push(step); return { action: null, minutes: noTime(), resources: null, capabilities: {} }; };
    input.snapshot.quests = { [goal.id]: { state: 'NOT_STARTED', source: 'game' } };
    const initial = planIntent(input)!;
    expect(seen[0].itemsRequired?.find(item => item.nameEn === 'Cadava berries')).toMatchObject({ inStep: false });
    seen.length = 0;
    input.snapshot.quests = { [goal.id]: { state: 'IN_PROGRESS', stepId: goal.stepIds[0], source: 'game' } };
    input.previous = initial;
    const resumed = planIntent(input)!;
    expect(seen[0].itemsRequired).toEqual(input.quests.steps[0].itemsRequired);
    expect(resumed.revision).toBeGreaterThan(initial.revision);
    expect(resumed.snapshotRevision).toBe(initial.snapshotRevision); // Intent/stage changes need not arrive as a new stats event.
  });
});
