import { describe, expect, it } from 'vitest';
import { buildPlayerState } from '../player/playerState';
import type { PlanningSnapshot } from './contracts';
import { createTrainingModel } from './trainingModel';
import type { TrainingModelAdapters } from './trainingModel';
import { createTacticalResolver } from './tactical';
import { decide, observedProjection, projectSuccess } from './decision';
import { noTime } from './cost';
import { emptyProgress } from '../persistence/progress';
import { fakePrices } from '../../../tests/funding/helpers';
import { prerequisiteTraining } from './training';
import { trackedTraining } from '../training/trackedTraining';
import { PICKAXES } from '../items/toolTiers';

function snapshot(level: number | null = 1, carried = 1, bank = 0): PlanningSnapshot {
  return { scope: { characterId: 'fixture', gameSessionId: 'login', mode: 'f2p', snapshotRevision: 1 },
    xp: {}, quests: {}, manual: {}, questPoints: { known: true, value: 0, source: 'game' },
    player: buildPlayerState({ mode: 'f2p', connected: true, player: 'Fixture', questsDone: [], progress: { levels: {} },
      stats: { ...(level === null ? {} : { mining: level }), attack: 1, strength: 1, defence: 1, hitpoints: 10 },
      gear: { equipment: [], inventory: carried ? [{ id: 1265, name: 'Bronze pickaxe', count: carried }] : [], coins: 1000, bankCoins: 0 },
      owned: { bankSeen: true, items: new Map(PICKAXES.map(name => [name.toLowerCase(), { name,
        carried: name === 'Bronze pickaxe' ? carried : 0, noted: 0, bank: name === 'Bronze pickaxe' ? bank : 0 }])) } }) };
}
const adapters = (): TrainingModelAdapters => ({ prepare: () => ({ action: null, minutes: noTime(), resources: null }), travel: () => null });

describe('explicit skill objective through the shared planner', () => {
  it('prepares the same real training step and advances only its current phase until a new level is observed', () => {
    const observed = snapshot(), progress = emptyProgress(), prices = fakePrices({ 'Bronze pickaxe': { buy: 10 } });
    const tactical = createTacticalResolver({ snapshot: observed, progress, prices, window: [], ironman: false, earn: () => null });
    const shared = adapters();
    shared.prepare = candidate => ({ action: tactical.resolve(candidate.step!, candidate.action.goalId).action, minutes: null, resources: null });
    const model = createTrainingModel(observed, { skill: 'mining', mode: 'fast', target: 10 }, shared, { prices });
    const decision = decide(observed, model)!;
    expect(decision.activeAction.kind).toBe('TRAIN');
    expect(decision.expectedNext.effects).toEqual([{ kind: 'skill-floor', skill: 'mining', level: 6, afterSuccessOnly: true }]);
    expect(decision.estimatedRemaining).toBeNull(); // Initial/setup travel is unassessed, never zero.
    const evaluation = model.evaluate(model.objectiveIds[0], observedProjection(observed))!;
    const branch = projectSuccess(observedProjection(observed), evaluation.effects);
    expect(branch.levels?.mining).toBe(10); // Whole-goal lookahead only.
    expect(model.remaining(branch)?.typical).toBe(0);
    expect(observed.player.levels.mining).toMatchObject({ value: 1 });
    expect(observed.quests).toEqual({});
  });

  it('keeps reached explicit goals complete without silently selecting a quest or another skill', () => {
    const observed = snapshot(10), model = createTrainingModel(observed, { skill: 'mining', mode: 'fast', target: 10 }, adapters());
    expect(model.objectiveIds).toEqual([]);
    expect(decide(observed, model)).toBeNull();
    expect(model.remaining(observedProjection(observed))?.typical).toBe(0);
  });

  it('keeps acquisition ahead of training until the same tool is actually observed', () => {
    const observed = snapshot(1, 0), progress = emptyProgress(), prices = fakePrices({ 'Bronze pickaxe': { buy: 10 } });
    const selected = { skill: 'mining' as const, mode: 'fast' as const, target: 10 };
    const current = () => {
      const tactical = createTacticalResolver({ snapshot: observed, progress, prices, window: [], ironman: false, earn: () => null });
      return createTrainingModel(observed, selected, { ...adapters(), prepare: candidate => ({
        action: tactical.resolve(candidate.step!, candidate.action.goalId).action, minutes: null, resources: null,
      }) }, { prices });
    };
    // The unlocated free spawn cannot displace a usable shop; training still waits for observed acquisition.
    expect(decide(observed, current())?.activeAction).toMatchObject({ kind: 'BUY', title: 'Get Bronze pickaxe' });
    expect(observed.player.owned?.items.get('bronze pickaxe')?.carried).toBe(0);
    observed.player = snapshot(1, 0, 1).player;
    expect(decide(observed, current())?.activeAction.kind).toBe('WITHDRAW');
    observed.player = snapshot().player;
    expect(decide(observed, current())?.activeAction.kind).toBe('TRAIN');
    expect(observed.player.levels.mining).toMatchObject({ value: 1 });
  });

  it('preserves the selected free-world and low-effort restrictions even on a Members account', () => {
    const observed = snapshot(1);
    observed.scope = { ...observed.scope, mode: 'members' };
    observed.player = { ...observed.player, mode: 'members' };
    const selection = { skill: 'mining' as const, mode: 'afk' as const, freeOnly: true, target: 10 };
    const expected = trackedTraining(selection, observed.player, 'members', 'chill', 'relaxed')!;
    const candidate = prerequisiteTraining({ snapshot: observed, goalId: 'owner', skill: 'mining', selection })!;
    expect(candidate.target).toBe(expected.target);
    expect(candidate.step?.bondBranch).toBe(true);
    expect(candidate.step?.mapLocation).toEqual(expected.step.mapLocation);
    expect(observed.player.mode).toBe('members');
  });

  it('verifies unknown levels and missing default checkpoints instead of inventing a level99 goal', () => {
    const observed = snapshot(null);
    const model = createTrainingModel(observed, { skill: 'mining', mode: 'fast', target: 10 }, adapters());
    const decision = decide(observed, model)!;
    expect(decision.activeAction.kind).toBe('VERIFY');
    expect(decision.expectedNext.effects).toEqual([]);
    const prayer = { ...observed, player: { ...observed.player, levels: { ...observed.player.levels,
      prayer: { known: true as const, value: 12, source: 'game' as const } } } };
    const deferred = createTrainingModel(prayer, { skill: 'prayer', mode: 'fast' }, adapters());
    expect(decide(prayer, deferred)?.activeAction.kind).toBe('VERIFY');
    expect(deferred.evaluate(deferred.objectiveIds[0], observedProjection(prayer))?.effects).toEqual([]);
  });

  it('leaves a goal without consumables metadata consuming UNKNOWN, never zero', () => {
    const observed = snapshot(), shared = adapters(), tactical = createTacticalResolver({ snapshot: observed, progress: emptyProgress(), prices: fakePrices({ 'Bronze pickaxe': { buy: 10 } }), window: [], ironman: false, earn: () => null });
    shared.prepare = candidate => ({ action: tactical.resolve(candidate.step!, candidate.action.goalId).action, minutes: null, resources: [] });
    const model = createTrainingModel(observed, { skill: 'mining', mode: 'fast', target: 10 }, shared);
    expect(model.evaluate(model.objectiveIds[0], observedProjection(observed))!.effects)
      .toContainEqual({ kind: 'resources-unknown', source: 'Training consumption is not modelled for this method', afterSuccessOnly: true });
  });

  it('never simulates training credit while preparation is waiting for evidence', () => {
    const observed = snapshot(), shared = adapters();
    shared.prepare = candidate => ({ action: { ...candidate.action, kind: 'VERIFY', feasibility: 'UNKNOWN', expectedEffects: [] },
      minutes: noTime(), resources: [] });
    shared.travel = () => noTime();
    const model = createTrainingModel(observed, { skill: 'mining', mode: 'fast', target: 10 }, shared);
    const evaluation = model.evaluate(model.objectiveIds[0], observedProjection(observed))!;
    expect(evaluation.effects).toEqual([]);
    expect(evaluation.confidence).toBe('UNKNOWN');
    expect(decide(observed, model)?.estimatedRemaining).toBeNull();
  });

  it('rejects another profile, mode, login or observation revision at every model entry', () => {
    const observed = snapshot(), model = createTrainingModel(observed, { skill: 'mining', mode: 'fast', target: 10 }, adapters());
    const projection = observedProjection(observed);
    for (const change of [{ characterId: 'other' }, { mode: 'members' as const }, { gameSessionId: 'other' }, { snapshotRevision: 2 }]) {
      const stale = { ...projection, scope: { ...observed.scope, ...change } };
      expect(model.evaluate(model.objectiveIds[0], stale)).toBeNull();
      expect(model.remaining(stale)).toBeNull();
    }
  });
});
