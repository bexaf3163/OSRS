import { describe, expect, it } from 'vitest';
import { buildPlayerState, currentBankView } from '../../player/playerState';
import { buildSnapshot, liquidOf } from './snapshot';
import { tripWindow } from '../../prep/oneTrip';
import { emptyProgress } from '../../persistence/progress';
import type { Step } from '../../../types';

function player(at?: number) {
  return buildPlayerState({ mode: 'f2p', connected: true, player: 'Fixture', progress: { levels: {} }, stats: {}, questsDone: [],
    owned: { bankSeen: true, ...(at !== undefined ? { bankSavedAt: at } : {}),
      items: new Map([['bucket', { name: 'Bucket', carried: 1, noted: 0, bank: 2 }]]) },
    gear: { inventory: [], equipment: [], coins: 10, bankCoins: 500 } });
}

describe('funding bank provenance', () => {
  it('protects actual repeated-ID phase occurrences without replacing them all with the last phase', () => {
    const phase = (amount: number): Step => ({ id: 'S0-01', stage: 0, type: 'skill', title: 'Training', requires: [], doneWhen: 'Observed',
      itemsRequired: [{ nameEn: 'Iron arrow', amount, howToGet: '' }] });
    const window = tripWindow([phase(100), phase(200)], emptyProgress(), 'S0-01');
    const snapshot = buildSnapshot({ state: player(), window, questPoints: 0, ironman: false });
    expect(snapshot.protections.get('iron arrow')?.qty).toBe(300);
  });
  it('distinguishes started quests using admitted current-character evidence, never a completed-only list', () => {
    const state = player(), make = (questObservation?: Parameters<typeof buildSnapshot>[0]['questObservation']) =>
      buildSnapshot({ state, window: [], questPoints: 0, ironman: false, questObservation });
    expect(make().questStarted!('Quest')).toBeNull();
    const observation = { player: 'Fixture', sessionId: 'login', revision: 1,
      states: { Quest: 'IN_PROGRESS' as const, Other: 'NOT_STARTED' as const } };
    expect(make(observation).questStarted!('quest')).toBe(true);
    expect(make(observation).questStarted!('Other')).toBe(false);
    expect(make({ ...observation, player: 'Another' }).questStarted!('Quest')).toBeNull();
    state.connected = false;
    expect(make(observation).questStarted!('Quest')).toBeNull();
  });
  it('keeps remembered stock and GP in history, but not in current funding feasibility or capital', () => {
    for (const timestamp of [0, 1000]) {
      const raw = player(timestamp), current = currentBankView(raw);
      const snap = buildSnapshot({ state: raw, window: [], questPoints: 0, ironman: false });
      expect(liquidOf(raw)).toEqual({ amount: 10, complete: false });
      expect(snap.liquid).toEqual({ amount: 10, complete: false });
      expect(snap.coins.bank).toBeNull();
      expect(snap.bankSeen).toBe(false);
      expect(snap.bankSavedAt).toBe(timestamp);
      expect(snap.held('Bucket')).toMatchObject({ total: 1, bank: null });
      expect(snap.held('Untracked item').presence).toBe('UNKNOWN');
      expect(current.owned?.items.get('bucket')?.bank).toBeUndefined();
      expect(currentBankView(raw)).toBe(current);
      expect(currentBankView(current)).toBe(current);
      expect(raw.owned?.items.get('bucket')?.bank).toBe(2);
      expect(raw.coins.bank).toMatchObject({ value: 500 });
    }
  });
  it('admits current bank cash, retains identity, and honors explicit metadata overrides', () => {
    const raw = player();
    expect(currentBankView(raw)).toBe(raw);
    expect(liquidOf(raw)).toEqual({ amount: 510, complete: true });
    const snap = buildSnapshot({ state: raw, window: [], questPoints: 0, ironman: false });
    expect(snap.held('Bucket').total).toBe(3);
    expect(snap.bankSavedAt).toBeNull();
    expect(buildSnapshot({ state: player(1000), window: [], questPoints: 0, ironman: false, bankSavedAt: null }).bankSavedAt).toBeNull();
  });
});
