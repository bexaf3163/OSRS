import { describe, expect, it } from 'vitest';
import { buildPlayerState } from '../player/playerState';
import type { CandidateAction, Minutes, ObjectiveEvaluation, PlannerModel, PlanningSnapshot } from './contracts';
import { decide, observedProjection, projectSuccess } from './decision';
import { acceptsDecision } from './scope';
import { noTime, sumMinutes } from './cost';
import { prerequisiteFrontier, questGraph } from './questGraph';

const minutes = (n: number): Minutes => ({ fast: n, typical: n, slow: n, source: 'Synthetic model fixture' });
const snapshot = (): PlanningSnapshot => ({ scope: { characterId: 'fixture', mode: 'f2p', gameSessionId: 'login-1', snapshotRevision: 1 },
  player: buildPlayerState({ mode: 'f2p', progress: { levels: {} }, stats: null, gear: null, owned: null, questsDone: null }),
  xp: { mining: { known: true, value: 0, source: 'game' } }, quests: {}, questPoints: { known: true, value: 0, source: 'game' }, manual: {} });
const action = (id: string, kind: CandidateAction['kind'] = 'QUEST'): CandidateAction => ({ id: `${id}:${kind}`, kind, goalId: id, title: id,
  feasibility: 'READY', prerequisites: [], completionEvidence: [{ source: 'fixture game evidence', snapshotRevision: 1, predicate: `${id} completed` }],
  expectedEffects: [{ kind: 'quest', questId: id, afterSuccessOnly: true }], time: minutes(1), gpCost: { amount: 0, confidence: 'HIGH', source: 'fixture' }, sourceIds: ['fixture'], reasons: ['Fixture'] });
const evaluation = (id: string, n: number, kind: CandidateAction['kind'] = 'QUEST'): ObjectiveEvaluation => ({ objectiveId: id, activeAction: action(id, kind),
  cost: { prepare: noTime(), travel: noTime(), work: minutes(n), banking: noTime(), exchange: noTime(), switching: noTime() },
  effects: [{ kind: 'quest', questId: id, afterSuccessOnly: true }], confidence: 'HIGH', hardBlocked: false });

describe('canonical decision and source isolation', () => {
  it('keeps the second horizon inside the selected goal frontier instead of queuing an unrelated cheap quest', () => {
    const graph = questGraph([{ id: 'goal', requires: ['a', 'b'] }, { id: 'a', requires: [] }, { id: 'b', requires: [] }, { id: 'unrelated', requires: [] }]);
    const model: PlannerModel = { objectiveIds: ['unrelated', 'b', 'goal', 'a'],
      prerequisitesFor: (id, p) => prerequisiteFrontier(graph, id, p.completed),
      evaluate: (id, p) => id === 'goal' && (!p.completed.has('a') || !p.completed.has('b')) ? null : evaluation(id, id === 'unrelated' ? 0.1 : id === 'b' ? 20 : 1),
      remaining: () => noTime() };
    const decision = decide(snapshot(), model, { lockedObjectiveId: 'goal' });
    expect(decision).toMatchObject({ objectiveId: 'a', requestedObjectiveId: 'goal', followingObjectiveId: 'b' });
  });

  it('selects by full time rather than catalogue order and exposes comparable alternatives', () => {
    const model: PlannerModel = { objectiveIds: ['slow', 'fast'], evaluate: id => evaluation(id, id === 'fast' ? 2 : 20),
      remaining: p => minutes(p.completed.has('fast') ? 20 : 2) };
    // Both eventually required; the future model can distinguish travel/unlock consequences.
    model.remaining = p => minutes(p.completed.has('fast') ? 1 : 30);
    expect(decide(snapshot(), model)?.objectiveId).toBe('fast');
    expect(decide(snapshot(), { ...model, objectiveIds: ['fast', 'slow'] })?.objectiveId).toBe('fast');
    expect(decide(snapshot(), model)?.alternatives[0]).toMatchObject({ id: 'slow', comparisonReason: expect.stringContaining('minutes') });
  });

  it('never drops a feasible objective silently because its time is unknown', () => {
    const model: PlannerModel = {
      objectiveIds: ['known', 'mystery'],
      evaluate: id => id === 'known' ? evaluation(id, 20) : { ...evaluation(id, 1), cost: { ...evaluation(id, 1).cost, work: null } },
      remaining: () => noTime(),
    };
    const decision = decide(snapshot(), model)!;
    expect(decision.objectiveId).toBe('known');
    expect(decision.alternatives[0]).toMatchObject({ id: 'mystery', minutes: null, comparisonReason: expect.stringContaining('could be faster') });
    expect(decision.why).toContain('Not compared because their time is unknown: mystery');
    expect(decision.confidence).toBe('LOW');
  });

  it('never ranks by the text of unknown terms: a fully timed quest beats one whose own preparation is unknown, which is named as uncompared (2.82.0 regression)', () => {
    const later = { known: minutes(0), unresolved: ['preparation:Later quest'] };
    const model: PlannerModel = {
      objectiveIds: ['a-unmeasured', 'b-measured'],
      evaluate: id => id === 'a-unmeasured'
        ? { ...evaluation(id, 5), cost: { ...evaluation(id, 5).cost, prepare: null }, comparisonCost: { known: minutes(5), unresolved: ['prepare:a-unmeasured:branch1'] } }
        : evaluation(id, 30),
      remaining: () => null,
      remainingExpression: () => later,
    };
    const decision = decide(snapshot(), model)!;
    // 2.82.0 chose 'a-unmeasured' only because "prepare:" sorts before "preparation:".
    expect(decision.objectiveId).toBe('b-measured');
    expect(decision.confidence).toBe('LOW');
    expect(decision.candidates).toMatchObject([
      { id: 'b-measured', rank: 1, minutes: 30, unknown: [], laterUnknown: ['prepare:a-unmeasured', 'preparation:Later quest'], verdict: expect.stringMatching(/^Chosen/) },
      { id: 'a-unmeasured', rank: 2, minutes: null, unknown: ['prepare'], verdict: 'Same known total as the choice (about 35 min); ranked lower by its own time (unknown prepare)' },
    ]);
  });

  it('counts quest reward XP in hypothetical lookahead without awarding it to observed state', () => {
    const observed = snapshot();
    const model: PlannerModel = { objectiveIds: ['training-quest', 'xp-quest'], evaluate: (id, p) => {
      const result = evaluation(id, id === 'xp-quest' ? 4 : 1 + Math.max(0, 2000 - p.xp.mining) / 100);
      if (id === 'xp-quest') result.effects = [...result.effects, { kind: 'xp', skill: 'mining', amount: 2000, afterSuccessOnly: true }];
      return result;
    }, remaining: p => minutes((p.completed.has('xp-quest') ? 0 : 4) + (p.completed.has('training-quest') ? 0 : 1 + Math.max(0, 2000 - p.xp.mining) / 100)) };
    const decision = decide(observed, model)!;
    expect(decision.objectiveId).toBe('xp-quest');
    expect(decision.followingObjectiveId).toBe('training-quest');
    expect(decision.estimatedRemaining?.typical).toBe(5);
    expect(observed.xp.mining).toEqual({ known: true, value: 0, source: 'game' });
    const effects = model.evaluate('xp-quest', observedProjection(observed))!.effects;
    const projected = projectSuccess(observedProjection(observed), effects);
    expect(projectSuccess(projected, effects)).toBe(projected); // The same quest reward is never credited twice.
    const unknown = { completed: new Set<string>(), xp: {}, unlocks: new Set<string>() };
    expect(projectSuccess(unknown, [{ kind: 'xp', skill: 'mining', amount: 2000, afterSuccessOnly: true }]).xp).toEqual({});
  });

  it('keeps unknown cost unknown and rejects invalid ranges', () => {
    expect(sumMinutes([minutes(2), null])).toBeNull();
    expect(sumMinutes([{ ...minutes(2), slow: 1 }])).toBeNull();
    const model: PlannerModel = { objectiveIds: ['unknown'], evaluate: id => ({ ...evaluation(id, 3), cost: { ...evaluation(id, 3).cost, travel: null } }), remaining: () => minutes(0) };
    expect(decide(snapshot(), model)?.estimatedRemaining).toBeNull();
  });
  it('uses guaranteed XP bounds for quest rewards without inventing exact XP from a level', () => {
    const observed = snapshot();
    observed.xp = {};
    observed.player.levels.mining = { known: true, value: 1, source: 'profile' };
    const start = observedProjection(observed);
    expect(start.xp).toEqual({});
    expect(start.xpBounds?.mining).toEqual({ min: 0, max: 82 });
    const future = projectSuccess(start, [{ kind: 'quest', questId: 'reward', afterSuccessOnly: true }, { kind: 'xp', skill: 'mining', amount: 1300, afterSuccessOnly: true }]);
    expect(future.xp).toEqual({});
    expect(future.xpBounds?.mining).toEqual({ min: 1300, max: 1382 });
    expect(future.levels?.mining).toBe(10);
    expect(observed.player.levels.mining).toMatchObject({ value: 1 });
    expect(projectSuccess({ ...start, levels: {}, xpBounds: {} }, [{ kind: 'xp', skill: 'mining', amount: 1300, afterSuccessOnly: true }]).levels).toEqual({});
  });

  it('does not mistake a waiting partner or unknown stage for a completed quest effect', () => {
    const model: PlannerModel = { objectiveIds: ['partner', 'stage', 'independent'],
      evaluate: id => evaluation(id, 1, id === 'partner' ? 'MANUAL_WAIT' : id === 'stage' ? 'VERIFY' : 'QUEST'), remaining: () => minutes(0) };
    expect(decide(snapshot(), model)?.objectiveId).toBe('independent');
    expect(decide(snapshot(), model, { lockedObjectiveId: 'stage' })?.activeAction.kind).toBe('VERIFY');
    const p = observedProjection(snapshot());
    expect(p.completed.size).toBe(0);
  });
  it('never applies hypothetical macro costs or rewards to a verification or waiting action', () => {
    for (const kind of ['VERIFY', 'MANUAL_WAIT'] as const) {
      const observed = snapshot(), check = evaluation('check', 1, kind);
      check.effects = [...check.effects, { kind: 'resources', afterSuccessOnly: true, change: { items: [], gp: -100, source: 'Unfunded future prerequisite' } }];
      const model: PlannerModel = { objectiveIds: ['check'], evaluate: () => check, remaining: projection => {
        expect(projection.completed.size).toBe(0);
        expect(projection.resources?.gp.floor).toBe(0);
        return minutes(5);
      } };
      const result = decide(observed, model, { lockedObjectiveId: 'check' });
      expect(result?.activeAction.kind).toBe(kind);
      expect(result?.followingObjectiveId).toBeUndefined();
      expect(result?.expectedNext.effects).toEqual([]);
    }
  });
  it('does not invent exact XP after training or discard a real balance for an already met floor', () => {
    const start = observedProjection(snapshot());
    const trained = projectSuccess(start, [{ kind: 'skill-floor', skill: 'mining', level: 10, afterSuccessOnly: true }]);
    expect(trained.xp.mining).toBeUndefined();
    expect(trained.xpBounds?.mining).toEqual({ min: 1154, max: 200_000_000 });
    expect(trained.levels?.mining).toBe(10);
    const rewarded = projectSuccess(trained, [{ kind: 'xp', skill: 'mining', amount: 100, afterSuccessOnly: true }]);
    expect(rewarded.xp.mining).toBeUndefined();
    expect(rewarded.xpBounds?.mining.min).toBe(1254);
    const reached = { ...start, xp: { mining: 1300 }, levels: { mining: 10 }, xpBounds: { mining: { min: 1300, max: 1300 } } };
    const same = projectSuccess(reached, [{ kind: 'skill-floor', skill: 'mining', level: 10, afterSuccessOnly: true }]);
    expect(same.xp.mining).toBe(1300);
    expect(same.xpBounds?.mining).toEqual({ min: 1300, max: 1300 });
  });

  it('refuses execution with an unmet or unknown hard prerequisite, but not an ordinary supply suggestion', () => {
    const model: PlannerModel = { objectiveIds: ['quest'], evaluate: id => {
      const result = evaluation(id, 1);
      result.activeAction.prerequisites = [{ id: 'protection', hard: true, state: 'unknown', evidence: [] }];
      return result;
    }, remaining: () => minutes(0) };
    expect(decide(snapshot(), model)).toBeNull();
    const evaluate = model.evaluate;
    model.evaluate = (id, p) => { const result = evaluate(id, p)!; result.activeAction.prerequisites = [{ id: 'extra food', hard: false, state: 'missing', evidence: [] }]; return result; };
    expect(decide(snapshot(), model)?.activeAction.kind).toBe('QUEST');
  });

  it('uses hysteresis for preference changes while immediately leaving a blocked objective', () => {
    let blocked = false, fast = 10;
    const model: PlannerModel = { objectiveIds: ['a', 'b'], evaluate: id => ({ ...evaluation(id, id === 'a' ? 10 : fast), hardBlocked: id === 'a' && blocked }), remaining: () => minutes(0) };
    const first = decide(snapshot(), model)!;
    fast = 9.5;
    expect(decide(snapshot(), model, { previous: first })?.objectiveId).toBe('a');
    blocked = true;
    expect(decide(snapshot(), model, { previous: first })?.objectiveId).toBe('b');
    expect(decide(snapshot(), model, { previous: first, lockedObjectiveId: 'b' })?.objectiveId).toBe('b');
  });
  it('rejects a subaction from another goal or an older observation transaction', () => {
    const model: PlannerModel = { objectiveIds: ['quest'], evaluate: id => evaluation(id, 1), remaining: () => noTime() };
    expect(decide(snapshot(), model)?.objectiveId).toBe('quest');
    model.evaluate = id => ({ ...evaluation(id, 1), activeAction: { ...action(id), goalId: 'another quest' } });
    expect(decide(snapshot(), model)).toBeNull();
    model.evaluate = id => ({ ...evaluation(id, 1), activeAction: { ...action(id), completionEvidence: [{ source: 'old bank read', snapshotRevision: 0, predicate: 'Stock verified' }] } });
    expect(decide(snapshot(), model)).toBeNull();
    model.evaluate = id => ({ ...evaluation(id, 1), activeAction: { ...action(id), prerequisites: [{ id: 'access', hard: true, state: 'met',
      evidence: [{ source: 'old access check', snapshotRevision: 0, predicate: 'Access verified' }] }] } });
    expect(decide(snapshot(), model)).toBeNull();
  });

  it('rejects stale async publication after a profile, mode, login or snapshot change', () => {
    const current = snapshot().scope;
    expect(acceptsDecision(current, current)).toBe(true);
    for (const change of [{ characterId: 'other' }, { mode: 'members' as const }, { gameSessionId: 'login-2' }, { snapshotRevision: 2 }]) {
      expect(acceptsDecision(current, { ...current, ...change })).toBe(false);
    }
  });
});

describe('hard quest DAG', () => {
  it('finds independent lowest unmet prerequisites without imposing authored route order', () => {
    const graph = questGraph([{ id: 'last', requires: ['b', 'a'] }, { id: 'a', requires: [] }, { id: 'b', requires: [] }]);
    expect(prerequisiteFrontier(graph, 'last', new Set())).toEqual(['a', 'b']);
    expect(prerequisiteFrontier(graph, 'last', new Set(['a', 'b']))).toEqual(['last']);
  });
  it('refuses cycles, missing predecessors and duplicate IDs', () => {
    expect(() => questGraph([{ id: 'a', requires: ['b'] }, { id: 'b', requires: ['a'] }])).toThrow(/Cyclic/);
    expect(() => questGraph([{ id: 'a', requires: ['missing'] }])).toThrow(/Unknown/);
    expect(() => questGraph([{ id: 'a', requires: [] }, { id: 'a', requires: [] }])).toThrow(/Duplicate/);
  });
});
