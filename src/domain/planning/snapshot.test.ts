import { describe, expect, it } from 'vitest';
import { buildPlayerState, heldOf } from '../player/playerState';
import { liquidOf } from '../economy/funding/snapshot';
import { buildPlanningSnapshot } from './snapshot';
import { questCatalogue } from './catalogue';
import type { QuestObservation } from '../player/questObservation';
import { allSteps } from '../../data';

function input(savedAt?: number) {
  const player = buildPlayerState({ mode: 'f2p', player: 'Fixture', connected: true, stats: { mining: 10 }, progress: { levels: {} },
    owned: { bankSeen: true, ...(savedAt ? { bankSavedAt: savedAt } : {}),
      items: new Map([['bucket', { name: 'Bucket', carried: 0, noted: 0, bank: 0 }]]) },
    gear: { equipment: [], inventory: [], coins: 5, bankCoins: 1000 }, questsDone: ["Cook's Assistant"] });
  const observation: QuestObservation = { player: 'Fixture', sessionId: 'login', revision: 1,
    states: { "Doric's Quest": 'IN_PROGRESS', "Cook's Assistant": 'COMPLETED' } };
  return { scope: { characterId: 'main:fixture', mode: 'f2p' as const, gameSessionId: 'login', snapshotRevision: 1 },
    player, catalogue: questCatalogue, observation, xp: { mining: 0 }, questPoints: 1, instruction: null };
}

describe('canonical planning observation boundary', () => {
  it('does not use remembered bank zeros or remembered GP to assert a purchase or a funding shortage', () => {
    const original = input(1000), snapshot = buildPlanningSnapshot(original)!;
    expect(snapshot.bankRead).toEqual({ kind: 'remembered', at: 1000 });
    expect(snapshot.player.bankSeen).toBe(false);
    expect(snapshot.player.coins.bank.known).toBe(false);
    expect(liquidOf(snapshot.player)).toEqual({ amount: 5, complete: false });
    expect(heldOf(snapshot.player, 'Bucket').presence).toBe('UNKNOWN');
    expect(snapshot.player.owned?.items.get('bucket')?.bank).toBeUndefined();
    expect(original.player.owned?.items.get('bucket')?.bank).toBe(0);
    expect(original.player.coins.bank).toMatchObject({ known: true, value: 1000 });
  });
  it('admits a fresh zero as a checked shortage and coherent exact XP only', () => {
    const original = input(), snapshot = buildPlanningSnapshot(original)!;
    expect(snapshot.player).toBe(original.player);
    expect(snapshot.bankRead).toEqual({ kind: 'current' });
    expect(heldOf(snapshot.player, 'Bucket').presence).toBe('MISSING');
    expect(snapshot.xp).toEqual({}); // XP 0 cannot belong to Mining10.
    original.xp.mining = 1300;
    expect(buildPlanningSnapshot(original)?.xp.mining).toEqual({ known: true, value: 1300, source: 'game' });
  });
  it('retains global quest status without inventing an instruction cursor or unstarted state', () => {
    const snapshot = buildPlanningSnapshot(input())!;
    expect(snapshot.quests["Doric's Quest"]).toMatchObject({ state: 'IN_PROGRESS' });
    expect(snapshot.quests["Doric's Quest"].stepId).toBeUndefined();
    expect(snapshot.quests['Imp Catcher'].state).toBe('UNKNOWN');
    expect(snapshot.quests["Cook's Assistant"].state).toBe('COMPLETED');
  });
  it('carries only an authored non-peeking cursor for the admitted in-progress quest', () => {
    const original = input(), step = allSteps.find(step => step.id === 'S3-01')!;
    const stage = step.questStages!.stages.find(stage => stage.do.length > 0)!;
    const instruction = { stepId: step.id, stageAt: stage.at, lineIndex: 0, peeking: false };
    const result = buildPlanningSnapshot({ ...original, steps: allSteps, instruction })!;
    expect(result.instruction).toEqual(instruction);
    expect(result.quests["Doric's Quest"].stepId).toBe(step.id);
    for (const bad of [{ ...instruction, peeking: true }, { ...instruction, lineIndex: 999 }, { ...instruction, stageAt: 999 }]) {
      const rejected = buildPlanningSnapshot({ ...original, steps: allSteps, instruction: bad })!;
      expect(rejected.instruction).toBeNull();
      expect(rejected.quests["Doric's Quest"].stepId).toBeUndefined();
    }
    expect(buildPlanningSnapshot({ ...original, instruction })?.instruction).toBeNull(); // Missing execution content cannot validate a cursor.
  });
  it('refuses a transaction crossing a login or character boundary, including an unidentified live client', () => {
    const original = input();
    expect(buildPlanningSnapshot({ ...original, scope: { ...original.scope, gameSessionId: 'another-login' } })).toBeNull();
    expect(buildPlanningSnapshot({ ...original, observation: { ...original.observation, player: 'Another' } })).toBeNull();
    expect(buildPlanningSnapshot({ ...original, player: { ...original.player, player: null } })).toBeNull();
  });
  it('keeps offline raw XP/QP/quests out of game prerequisites', () => {
    const original = input();
    const snapshot = buildPlanningSnapshot({ ...original, player: buildPlayerState({ mode: 'f2p', player: 'Fixture', connected: false,
      progress: { levels: { mining: 10 } }, stats: null, owned: null, gear: null, questsDone: null }) })!;
    expect(snapshot.xp).toEqual({});
    expect(snapshot.questPoints).toEqual({ known: false });
    expect(Object.values(snapshot.quests).every(quest => quest.state === 'UNKNOWN')).toBe(true);
    expect(snapshot.player.levels.mining).toMatchObject({ source: 'profile', value: 10 });
  });
});
