import { describe, expect, it } from 'vitest';
import { createTrainingCost, prerequisiteTraining } from './training';
import { buildPlayerState } from '../player/playerState';
import { observedProjection, projectSuccess } from './decision';
import type { PlanningSnapshot } from './contracts';

function snapshot(level?: number): PlanningSnapshot {
  return { scope: { characterId: 'fixture', mode: 'f2p', gameSessionId: 'login', snapshotRevision: 1 },
    player: buildPlayerState({ mode: 'f2p', progress: { levels: level === undefined ? {} : { mining: level } }, stats: null, gear: null, owned: null, questsDone: null }),
    xp: {}, quests: {}, questPoints: { known: true, value: 0, source: 'profile' }, manual: {} };
}
describe('existing training engine as a prerequisite estimator', () => {
  it('needs no kit or stock after quest XP has already met the training goal', () => {
    const observed = snapshot(1);
    observed.player = buildPlayerState({ mode: 'f2p', connected: true, progress: { levels: {} }, stats: { mining: 1 }, questsDone: [],
      owned: { bankSeen: true, items: new Map() },
      gear: { equipment: [{ id: 1277, name: 'Bronze shortsword', slot: 'weapon', count: 1 }], inventory: [], coins: 100, bankCoins: 0 } });
    const after = projectSuccess(observedProjection(observed), [
      { kind: 'resources-unknown', source: 'A quest with unmodelled physical consumption', afterSuccessOnly: true },
      { kind: 'xp', skill: 'mining', amount: 1300, afterSuccessOnly: true },
    ]);
    const cost = createTrainingCost(observed);
    expect(cost('mining', 10, after)?.typical).toBe(0);
    expect(cost('mining', 30, after)).not.toBeNull(); // The worn sword survives unmodelled consumption, so more training is still costed.
    expect(observed.player.levels.mining).toMatchObject({ value: 1 });
  });

  it('keeps unknown levels unknown and removes reached goals without another grind', () => {
    expect(prerequisiteTraining({ snapshot: snapshot(), goalId: 'quest', skill: 'mining', target: 10 })?.action.kind).toBe('VERIFY');
    expect(prerequisiteTraining({ snapshot: snapshot(10), goalId: 'quest', skill: 'mining', target: 10 })).toBeNull();
  });
  it('uses the same generated method, real kit and phased target as followed Skills, pending preparation', () => {
    const observed = snapshot(1);
    const training = prerequisiteTraining({ snapshot: observed, goalId: 'quest', skill: 'mining', target: 10 })!;
    expect(training.action.kind).toBe('TRAIN');
    expect(training.action.feasibility).toBe('PREP_REQUIRED');
    expect(training.step?.followsMethod).toBe('mining');
    expect(training.action.destination).toMatchObject({ x: training.step!.mapLocation!.x, y: training.step!.mapLocation!.y });
    expect(training.remaining?.source).toContain('trainingRouter');
    expect(training.action.expectedEffects).toEqual([{ kind: 'skill-floor', skill: 'mining', level: 6, afterSuccessOnly: true }]); // Current tool milestone, not the whole target.
    expect(observed.player.levels.mining).toEqual({ known: true, value: 1, source: 'profile' });
  });
  it('uses exact observed XP within a level and ignores an incoherent cross-event XP value', () => {
    const observed = snapshot(1);
    observed.xp = { mining: { known: true, value: 80, source: 'game' } };
    const exact = prerequisiteTraining({ snapshot: observed, goalId: 'quest', skill: 'mining', target: 2 })!;
    expect(exact.action.expectedEffects).toEqual([{ kind: 'skill-floor', skill: 'mining', level: 2, afterSuccessOnly: true }]);
    expect(exact.remaining).not.toBeNull();
    const inconsistent = snapshot(10);
    inconsistent.xp = { mining: { known: true, value: 0, source: 'game' } };
    expect(observedProjection(inconsistent).xp).toEqual({});
    expect(prerequisiteTraining({ snapshot: inconsistent, goalId: 'quest', skill: 'mining', target: 10 })).toBeNull();
  });
  it('compares the whole phased training path and conditional reward XP without changing the observed level', () => {
    const observed = snapshot(1), start = observedProjection(observed), cost = createTrainingCost(observed);
    const whole = cost('mining', 30, start)!;
    expect(whole.typical).toBeGreaterThan(cost('mining', 10, start)!.typical);
    const rewarded = projectSuccess(start, [{ kind: 'xp', skill: 'mining', amount: 1300, afterSuccessOnly: true }]);
    expect(cost('mining', 30, rewarded)!.typical).toBeLessThan(whole.typical);
    expect(cost('mining', 10, rewarded)?.typical).toBe(0);
    expect(cost('mining', 30, start)).toBe(whole);
    expect(observed.player.levels.mining).toMatchObject({ value: 1 });
    expect(start.xp).toEqual({});
  });
  it('uses the full starting XP interval and rejects unknown, invalid or unsupported cost inputs', () => {
    const observed = snapshot(1), start = observedProjection(observed), cost = createTrainingCost(observed);
    const range = cost('mining', 2, start)!;
    expect(range.slow).toBeGreaterThan(range.fast);
    expect(cost('not-a-skill', 10, start)).toBeNull();
    expect(cost('mining', NaN, start)).toBeNull();
    expect(createTrainingCost(snapshot())('mining', 10, observedProjection(snapshot()))).toBeNull();
    expect(cost('mining', 10, { ...start, invalidResources: true })).toBeNull();
    expect(cost('mining', 10, { ...start, xp: { mining: NaN } })).toBeNull();
    const exact = cost('mining', 2, { ...start, xp: { mining: 80 } })!;
    expect(exact.slow).toBeLessThan(range.slow);
  });
  it('does not turn unknown training overshoot into a speculative discount on all later training', () => {
    const observed = snapshot(1), start = observedProjection(observed), cost = createTrainingCost(observed);
    const trained = projectSuccess(start, [{ kind: 'skill-floor', skill: 'mining', level: 10, afterSuccessOnly: true }]);
    const conservative = cost('mining', 30, trained)!;
    const fromFloor = cost('mining', 30, { ...trained, xp: { mining: 1154 } })!;
    expect(conservative.typical).toBeCloseTo(fromFloor.typical);
    expect(conservative.typical).toBeGreaterThan(0);
    expect(conservative.source).toContain('overshoot unknown');
  });
});
