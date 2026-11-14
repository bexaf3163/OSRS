import { describe, expect, it } from 'vitest';
import { buildPlayerState } from '../player/playerState';
import { observedProjection, projectSuccess, decide } from './decision';
import { projectedTrainingState, projectResources } from './resources';
import type { ExpectedEffect, Minutes, ObjectiveEvaluation, PlannerModel, PlanningSnapshot, ResourceChange } from './contracts';
import { noTime } from './cost';

function snapshot(bankSeen = true): PlanningSnapshot {
  return { scope: { characterId: 'fixture', mode: 'f2p', gameSessionId: 'login', snapshotRevision: 1 }, quests: {}, xp: {}, manual: {},
    questPoints: { known: true, value: 0, source: 'game' },
    player: buildPlayerState({ mode: 'f2p', connected: true, player: 'Fixture', progress: { levels: {} }, stats: {}, questsDone: [],
      owned: { bankSeen, items: new Map([['bucket', { name: 'Bucket', carried: 1, noted: 1, bank: bankSeen ? 2 : undefined }]]) },
      gear: { coins: 50, bankCoins: bankSeen ? 50 : null, equipment: [{ id: 1277, name: 'Bronze shortsword', slot: 'weapon', count: 1 }], inventory: [] } }) };
}
const change = (gp = 0, items: ResourceChange['items'] = []): ResourceChange => ({ gp, items, source: 'Synthetic resolved physical allocation' });
const effect = (c: ResourceChange): ExpectedEffect => ({ kind: 'resources', change: c, afterSuccessOnly: true });
const minute = (typical: number): Minutes => ({ typical, fast: typical, slow: typical, source: 'Synthetic full-trip model' });

describe('conditional resource accounting', () => {
  it('retires only unmodelled item exchanges, without preserving worn proof or converting unknown stock into confirmed absence', () => {
    const observed = snapshot(), start = observedProjection(observed);
    const after = projectSuccess(start, [effect({ ...change(0), unknownItems: ['Bucket', 'Bronze shortsword'] })]);
    expect(after.resources?.items.bucket).toEqual({ floor: 0, complete: false });
    expect(after.resources?.items['bronze shortsword']).toEqual({ floor: 0, complete: false });
    expect(after.resources?.worn?.['bronze shortsword']).toBe(0);
    expect(after.resources?.gp).toEqual(start.resources?.gp);
    expect(projectedTrainingState(observed, after)).toBeNull();
    const received = projectSuccess(after, [effect(change(0, [{ name: 'Bucket', delta: 1 }]))]);
    expect(received.resources?.items.bucket).toEqual({ floor: 1, complete: false });
    expect(projectSuccess(after, [effect(change(0, [{ name: 'Bucket', delta: -1 }]))]).invalidResources).toBe(true);
    expect(start.resources?.items.bucket).toEqual({ floor: 4, complete: true });
    for (const name of ['', 'Coins']) expect(projectResources(start.resources!, [{ ...change(0), unknownItems: [name] }])).toBeNull();
  });

  it('weakens only an uncertain item total, preserving its proven stock, other items and cash without later restoring certainty', () => {
    const start = observedProjection(snapshot()).resources!;
    const partial = projectResources(start, [change(0, [{ name: 'Bucket', delta: 0, uncertain: true }])])!;
    expect(partial.items.bucket).toEqual({ floor: 4, complete: false });
    expect(partial.gp).toEqual(start.gp);
    expect(partial.items['bronze shortsword']).toEqual(start.items['bronze shortsword']);
    expect(projectResources(partial, [change(0, [{ name: 'Bucket', delta: 1 }])])?.items.bucket).toEqual({ floor: 5, complete: false });
    expect(start.items.bucket).toEqual({ floor: 4, complete: true });
    expect(projectResources(start, [change(0, [{ name: 'Bucket', delta: -5, uncertain: true }])])).toBeNull();
  });

  it('costs training from conditional stock and cash without counting worn stock twice or equipping future purchases', () => {
    const observed = snapshot(), start = observedProjection(observed);
    const acquired = projectSuccess(start, [effect(change(-40, [{ name: 'Amulet of accuracy', delta: 1 }]))]);
    const cost = projectedTrainingState(observed, acquired)!;
    expect(cost.coins.bag).toMatchObject({ value: 60 });
    expect(cost.owned?.items.get('bronze shortsword')?.carried).toBe(0);
    expect(cost.equipment).toBe(observed.player.equipment);
    expect(cost.equipmentItems).toBe(observed.player.equipmentItems);
    expect(cost.owned?.items.get('amulet of accuracy')?.carried).toBe(1);
    expect(Object.values(cost.equipment)).not.toContain('Amulet of accuracy');
    expect(projectedTrainingState(observed, acquired)).toBe(cost);
    const lostKit = projectSuccess(acquired, [effect(change(0, [{ name: 'Bronze shortsword', delta: -1 }]))]);
    expect(projectedTrainingState(observed, lostKit)).toBeNull();
    expect(observed.player.coins.bag).toMatchObject({ value: 50 });
    expect(observed.player.owned?.items.get('amulet of accuracy')).toBeUndefined();
  });
  it('never treats a same-name replacement as the original worn item, even in an atomic exchange', () => {
    const observed = snapshot(), start = observedProjection(observed);
    const replaced = projectSuccess(start, [effect(change(0, [{ name: 'Bronze shortsword', delta: -1 }])),
      effect(change(0, [{ name: 'Bronze shortsword', delta: 1 }]))]);
    expect(replaced.resources?.items['bronze shortsword'].floor).toBe(1);
    expect(replaced.resources?.worn?.['bronze shortsword']).toBe(0);
    expect(projectedTrainingState(observed, replaced)).toBeNull();
    const exchanged = projectResources(start.resources!, [change(0, [{ name: 'Bronze shortsword', delta: -1 }, { name: 'Bronze shortsword', delta: 1 }])])!;
    expect(exchanged.worn?.['bronze shortsword']).toBe(0);
    const spare = projectSuccess(start, [effect(change(0, [{ name: 'Bronze shortsword', delta: 1 }])),
      effect(change(0, [{ name: 'Bronze shortsword', delta: -1 }]))]);
    expect(spare.resources?.worn?.['bronze shortsword']).toBe(1); // A known unworn spare is spent before the original worn unit.
    expect(projectedTrainingState(observed, spare)).not.toBeNull();
    expect(start.resources?.worn?.['bronze shortsword']).toBe(1);
  });

  it('does not carry unmodelled macro consumption into later spending, while retaining a subsequent direct cash reward as a lower bound', () => {
    const observed = snapshot(), start = observedProjection(observed);
    const unknown: ExpectedEffect = { kind: 'resources-unknown', source: 'Synthetic unmodelled quest flow', afterSuccessOnly: true };
    const after = projectSuccess(start, [unknown, effect(change(50))]);
    expect(after.resources?.items.bucket).toEqual({ floor: 0, complete: false });
    expect(after.resources?.gp).toEqual({ floor: 50, complete: false });
    expect(projectSuccess(after, [effect(change(-51))]).invalidResources).toBe(true);
    expect(projectSuccess(start, [effect(change(-101)), unknown, effect(change(200))]).invalidResources).toBe(true);
    expect(start.resources?.items.bucket).toEqual({ floor: 4, complete: true });
    expect(observed.player.coins.bag).toMatchObject({ value: 50 });
  });
  it('keeps exact named stock, worn quantities and money separate from observed state', () => {
    const observed = snapshot(), start = observedProjection(observed);
    expect(start.resources?.items.bucket).toEqual({ floor: 4, complete: true });
    expect(start.resources?.items['bronze shortsword']).toEqual({ floor: 1, complete: false });
    expect(start.resources?.gp).toEqual({ floor: 100, complete: true });
    const after = projectSuccess(start, [effect(change(-60, [{ name: 'Bucket', delta: -3 }]))]);
    expect(after.resources?.items.bucket.floor).toBe(1);
    expect(after.resources?.gp.floor).toBe(40);
    expect(start.resources?.items.bucket.floor).toBe(4);
    expect(start.resources?.gp.floor).toBe(100);
    expect(observed.player.owned?.items.get('bucket')?.bank).toBe(2);
    expect(observed.player.coins.bag).toMatchObject({ value: 50 });
  });
  it('does not spend the same stock or GP in two hypothetical objectives', () => {
    const start = observedProjection(snapshot());
    const after = projectSuccess(start, [effect(change(-60, [{ name: 'Bucket', delta: -3 }]))]);
    expect(projectSuccess(after, [effect(change(-60))]).invalidResources).toBe(true);
    expect(projectSuccess(after, [effect(change(0, [{ name: 'Bucket', delta: -2 }]))]).invalidResources).toBe(true);
    const acquired = projectSuccess(after, [effect(change(0, [{ name: 'Bucket', delta: 1 }]))]);
    expect(projectSuccess(acquired, [effect(change(0, [{ name: 'Bucket', delta: -2 }]))]).resources?.items.bucket.floor).toBe(0);
  });
  it('preserves unread balances as lower bounds even after a conditional purchase or reward', () => {
    const start = observedProjection(snapshot(false));
    expect(start.resources?.items.bucket).toEqual({ floor: 2, complete: false });
    expect(start.resources?.gp).toEqual({ floor: 50, complete: false });
    const after = projectSuccess(start, [effect(change(20, [{ name: 'Untracked item', delta: 1 }]))]);
    expect(after.resources?.items['untracked item']).toEqual({ floor: 1, complete: false });
    expect(after.resources?.gp).toEqual({ floor: 70, complete: false });
    expect(projectSuccess(start, [effect(change(0, [{ name: 'Untracked item', delta: -1 }]))]).invalidResources).toBe(true);
  });
  it('applies transactions atomically, validates units and never treats a named coin stack as a second cash pool', () => {
    const start = observedProjection(snapshot()).resources!;
    for (const c of [change(NaN), change(.5), change(-101), change(0, [{ name: 'Bucket', delta: -5 }]),
      change(0, [{ name: 'Coins', delta: 5 }]), { ...change(), destination: { x: 3000, y: 3000, plane: 4 } }]) {
      expect(projectResources(start, [c])).toBeNull();
    }
    expect(projectResources(start, [change(-5), change(-100)])).toBeNull();
    expect(projectResources(start, [change(0, [{ name: 'Unowned input', delta: -1 }, { name: 'Unowned input', delta: 2 }])])).toBeNull();
    expect(start.gp.floor).toBe(100);
    const combined = projectResources(start, [change(0, [{ name: 'Bucket', delta: -3 }, { name: 'bucket', delta: 1 }])]);
    expect(combined?.items.bucket.floor).toBe(2);
  });
  it('retains the conditional end position and does not award a quest reward twice', () => {
    const start = observedProjection(snapshot());
    const effects: ExpectedEffect[] = [{ kind: 'quest', questId: 'Synthetic quest', afterSuccessOnly: true },
      effect({ ...change(100), destination: { x: 3000, y: 3200, plane: 0 } })];
    const after = projectSuccess(start, effects);
    expect(after.resources?.gp.floor).toBe(200);
    expect(after.resources?.position).toEqual({ x: 3000, y: 3200, plane: 0 });
    expect(projectSuccess(after, effects)).toBe(after);
    expect(start.resources?.position).toBeNull();
  });
  it('rejects a cheap-looking branch with uncosted shortages instead of publishing an impossible action', () => {
    const evaluation = (id: string): ObjectiveEvaluation => ({ objectiveId: id,
      activeAction: { id, kind: 'QUEST', goalId: id, title: id, feasibility: 'READY', prerequisites: [],
        completionEvidence: [{ source: 'fixture', snapshotRevision: 1, predicate: 'Completed in game' }],
        expectedEffects: [], time: minute(1), gpCost: null, sourceIds: ['fixture'], reasons: ['fixture'] },
      effects: [effect(change(id === 'overspend' ? -101 : -50))], confidence: 'HIGH', hardBlocked: false,
      cost: { prepare: noTime(), travel: noTime(), work: minute(id === 'overspend' ? 1 : 5), banking: noTime(), exchange: noTime(), switching: noTime() } });
    const model: PlannerModel = { objectiveIds: ['overspend', 'feasible'], evaluate: evaluation, remaining: () => noTime() };
    expect(decide(snapshot(), model)?.objectiveId).toBe('feasible');
  });
});
