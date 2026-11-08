import { describe, expect, it, vi } from 'vitest';
import { buildPlayerState } from '../player/playerState';
import { createReadinessEngine } from '../readiness/readinessEngine';
import { emptyProgress } from '../persistence/progress';
import { nameKey } from '../items/itemKey';
import type { Step } from '../../types';
import type { PreparationInput } from './preparation';
import { resolvePreparation } from './preparation';

function fixture(stock: { bag?: number; bank?: number; noted?: number; bankSeen?: boolean; equip?: boolean; cash?: number } = {}): PreparationInput {
  const name = stock.equip ? 'Black kiteshield' : 'Iron arrow';
  const step: Step = { id: 'fixture', stage: 1, type: 'skill', title: 'Fixture goal', requires: [], doneWhen: 'Fixture goal verified',
    itemsRequired: [{ nameEn: name, amount: stock.equip ? 1 : 100, howToGet: '', ...(stock.equip ? { equip: true } : {}) }] };
  const progress = emptyProgress();
  const state = buildPlayerState({ mode: 'f2p', stats: { defence: 10 }, progress,
    owned: { bankSeen: stock.bankSeen ?? true, items: new Map([[nameKey(name), { name, carried: stock.bag ?? 0, noted: stock.noted ?? 0, ...(stock.bank !== undefined ? { bank: stock.bank } : {}) }]]) },
    gear: { equipment: [], inventory: [], coins: stock.cash ?? 5000, bankCoins: stock.bankSeen === false ? null : 0 }, questsDone: [] });
  const engine = createReadinessEngine({ state, steps: [step], progress, qp: 0, mode: 'f2p' });
  return { snapshot: { player: state, scope: { characterId: 'fixture', gameSessionId: 'login', mode: 'f2p', snapshotRevision: 1 }, xp: {}, quests: {},
    questPoints: { known: true, value: 0, source: 'game' }, manual: {} }, goalId: 'fixture-goal', step,
    readiness: engine.readiness(step), plan: engine.plan(step, { ahead: 0 }), ironman: false,
    budget: { liquid: { amount: stock.cash ?? 5000, complete: stock.bankSeen !== false }, spendable: stock.cash ?? 5000, reserve: 0 }, train: () => null, earn: () => null };
}

describe('one shared tactical preparation resolver', () => {
  it('does not turn remembered possessions into an executable purchase, withdrawal or equipment action while disconnected', () => {
    for (const stock of [{ bank: 1 }, { bag: 0, bank: 0 }, { equip: true, bag: 1, bank: 0 }]) {
      const input = fixture(stock);
      input.snapshot.player = { ...input.snapshot.player, connected: false };
      expect(resolvePreparation(input)).toMatchObject({ kind: 'VERIFY', feasibility: 'UNKNOWN', expectedEffects: [], gpCost: null });
    }
  });
  it('checks account trading eligibility for exchange purchases and keeps known shop purchases accessible', () => {
    for (const ironman of [null, true, false]) {
      const input = fixture({ bank: 0 });
      input.ironman = ironman;
      input.plan.lines[0].action = { kind: 'BUY', label: 'Exchange offer', price: 2, purchase: { source: 'ge' } };
      const result = resolvePreparation(input)!;
      expect(result.kind).toBe(ironman === false ? 'BUY' : 'VERIFY');
      if (ironman !== false) {
        expect(result.gpCost).toBeNull();
        expect(result.expectedEffects).toEqual([]);
      }
      input.plan.lines[0].action!.purchase = { source: 'shop' };
      expect(resolvePreparation(input)?.kind).toBe('BUY');
    }
  });
  it('withdraws owned stock before buying and never treats being at a bank as withdrawal evidence', () => {
    const input = fixture({ bank: 100 });
    const action = resolvePreparation(input)!;
    expect(action.kind).toBe('WITHDRAW');
    expect(action.completionEvidence[0].predicate).toContain('usable in inventory');
    expect(action.expectedEffects).toEqual([]);
    expect(input.plan.lines[0].have.bag).toBe(0);
  });
  it('withdraws banked equipment before equipping it, then asks to equip only after it is carried', () => {
    expect(resolvePreparation(fixture({ equip: true, bank: 1 }))?.kind).toBe('WITHDRAW');
    expect(resolvePreparation(fixture({ equip: true, bag: 1, bank: 0 }))?.kind).toBe('EQUIP');
  });
  it('unnote is a physical bank action and unknown bank stock never becomes a duplicate purchase', () => {
    expect(resolvePreparation(fixture({ noted: 100, bank: 0 }))?.kind).toBe('WITHDRAW');
    expect(resolvePreparation(fixture({ bankSeen: false }))?.kind).toBe('VERIFY');
  });
  it('uses a sourced free pickup, but a drop table, recipe or label cannot prove acquisition capability', () => {
    const input = fixture({ bank: 0 }), line = input.plan.lines[0];
    const point = { x: 3200, y: 3200, plane: 0, label: 'Sourced pickup' };
    line.action = { kind: 'GATHER', label: 'Pick up the item', nav: { ...point }, acquisition: { kind: 'free', label: 'Pickup', access: 'open', point } };
    expect(resolvePreparation(input)).toMatchObject({ kind: 'GATHER', destination: { x: 3200, y: 3200, plane: 0 }, expectedEffects: [] });
    for (const acquisition of [undefined, { kind: 'drop' as const, label: 'Pick up the item', point },
      { kind: 'free' as const, label: 'Pickup' }, { kind: 'free' as const, label: 'Pickup', point, access: 'blocked' as const }]) {
      line.action = { ...line.action, acquisition };
      expect(resolvePreparation(input)).toMatchObject({ kind: 'VERIFY', feasibility: 'UNKNOWN', expectedEffects: [] });
    }
  });
  it('allows a modelled minimum without forcing the full routine quantity suggestion', () => {
    const input = fixture({ bag: 1, bank: 0 });
    input.minimum = new Map([[input.plan.lines[0].key, 1]]);
    expect(resolvePreparation(input)).toBeNull();
    expect(input.plan.lines[0].count).toBe(100); // Forecast retained, not rewritten as actual stock.
  });
  it('checks a quest giver against current quest evidence rather than treating its note as unconditional access', () => {
    const input = fixture({ bank: 0 }), line = input.plan.lines[0];
    line.action = { kind: 'GATHER', label: 'Talk to the giver', acquisition: { kind: 'free', label: 'Quest giver',
      point: { x: 3200, y: 3200, plane: 0, label: 'Giver' }, questAccess: { quest: 'Synthetic quest', state: 'started' } } };
    for (const state of ['UNKNOWN', 'NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'] as const) {
      input.snapshot.quests = { 'Synthetic quest': { state, source: 'Current game transaction' } };
      expect(resolvePreparation(input)?.kind).toBe(state === 'IN_PROGRESS' || state === 'COMPLETED' ? 'GATHER' : 'VERIFY');
    }
    line.action.acquisition = { ...line.action.acquisition!, questAccess: { quest: 'Synthetic quest', state: 'completed' } };
    input.snapshot.quests = { 'Synthetic quest': { state: 'IN_PROGRESS', source: 'Current game transaction' } };
    expect(resolvePreparation(input)?.kind).toBe('VERIFY');
  });
  it('uses shared funding only for a proven GP shortage, preserving an unknown bank balance', () => {
    const input = fixture({ bank: 0, cash: 0 });
    const line = input.plan.lines[0];
    line.action = { kind: 'BUY', label: 'Buy arrows', price: 2, purchase: { source: 'ge' } };
    const earn = vi.fn(() => null);
    input.earn = earn;
    expect(resolvePreparation(input)?.kind).toBe('VERIFY');
    expect(earn).toHaveBeenCalledWith(200);
    line.action.kind = 'EARN'; // The existing source router uses EARN for the same proven purchase shortfall.
    earn.mockClear();
    expect(resolvePreparation(input)?.kind).toBe('VERIFY');
    expect(earn).toHaveBeenCalledWith(200);
    input.budget.liquid.complete = false;
    earn.mockClear();
    expect(resolvePreparation(input)?.title).toContain('bank balance');
    expect(earn).not.toHaveBeenCalled();
  });
  it('cannot spend reserved quest GP on a purchase even when the raw balance covers it', () => {
    const input = fixture({ bank: 0, cash: 200 });
    input.plan.lines[0].action = { kind: 'BUY', label: 'Buy arrows', price: 2, purchase: { source: 'ge' } };
    input.budget.reserve = 50;
    input.budget.spendable = 150;
    const earn = vi.fn(() => null);
    input.earn = earn;
    expect(resolvePreparation(input)?.kind).toBe('VERIFY');
    expect(earn).toHaveBeenCalledWith(250);
  });
  it('counts a shared acquisition fee once while protecting separate future quest payments', () => {
    const input = fixture({ bank: 0, cash: 280 });
    const fee = { key: 'boat', coins: 30, label: 'Boat fare' };
    input.plan.lines[0].action = { kind: 'BUY', label: 'Buy arrows', price: 2, purchase: { source: 'shop', fee } };
    input.budget.reserve = 80; // 50 for future quest payments, plus the already reserved 30 fare.
    input.budget.spendable = 200;
    input.reservedPurchases = [{ fee }, { fee }];
    expect(resolvePreparation(input)).toMatchObject({ kind: 'BUY', gpCost: { amount: 230 } });
    input.budget.liquid.amount = 279;
    input.budget.spendable = 199;
    const earn = vi.fn(() => null);
    input.earn = earn;
    expect(resolvePreparation(input)?.kind).toBe('VERIFY');
    expect(earn).toHaveBeenCalledWith(280);
    input.reservedPurchases = [];
    earn.mockClear();
    resolvePreparation(input);
    expect(earn).toHaveBeenCalledWith(310); // An unrelated reserve never grants a fee credit.
  });
  it('does not turn an unavailable price into a fabricated funding shortage or completed purchase', () => {
    const input = fixture({ bank: 0 });
    input.plan.lines[0].action = { kind: 'BUY', label: 'Check manual offer', purchase: { source: 'ge' } };
    input.plan.lines[0].marketPrice = undefined;
    const result = resolvePreparation(input)!;
    expect(result).toMatchObject({ kind: 'VERIFY', feasibility: 'UNKNOWN' });
    expect(result.gpCost).toBeNull();
    expect(result.reasons).toContain('Confirm the offer and available coins before buying');
    expect(result.expectedEffects).toEqual([]);
  });
  it('requires a coin check before offering a known-price purchase with unread spendable GP', () => {
    const input = fixture({ bank: 0 });
    input.plan.lines[0].action = { kind: 'BUY', label: 'Buy arrows', price: 2, purchase: { source: 'ge' } };
    input.budget.spendable = null;
    const earn = vi.fn(() => null);
    input.earn = earn;
    expect(resolvePreparation(input)).toMatchObject({ kind: 'VERIFY', feasibility: 'UNKNOWN', gpCost: null, expectedEffects: [] });
    expect(earn).not.toHaveBeenCalled();
  });
});
