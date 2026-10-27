import { foodCarry, heldFood } from '../src/lib/foodAdvice';
import { itemPreflight } from '../src/lib/preflight';
import { describe, expect, it } from 'vitest';
import { createReadinessEngine } from '../src/lib/readinessEngine';
import { buildPlayerState } from '../src/lib/playerState';
import { emptyProgress } from '../src/lib/progress';
import { bankWithdrawalsOf } from '../src/lib/prepEnvelope';
import type { Step } from '../src/types';

describe('physical carrying space for banked food alternatives', () => {
  it('counts 34 physical Trout to cover 26 Salmon-equivalents, rather than pretending they take 26 slots', () => {
    const step: Step = { id: 'food-carry-test', stage: 1, type: 'skill', title: 'Training', requires: [], doneWhen: 'Goal reached',
      itemsRequired: [{ nameEn: 'Salmon', amount: 26, heals: 9, anyOf: ['Trout'], howToGet: 'Grand Exchange' }] };
    const progress = emptyProgress();
    const state = buildPlayerState({ mode: 'f2p', stats: { hitpoints: 24 } as never, progress, questsDone: null,
      gear: { equipment: [], inventory: [], inventorySlots: 2, coins: 0, bankCoins: 0 },
      owned: { bankSeen: true, items: new Map([
        ['salmon', { name: 'Salmon', carried: 0, noted: 0, bank: 0 }],
        ['trout', { name: 'Trout', carried: 0, noted: 0, bank: 34 }],
      ]) },
    });
    const plan = createReadinessEngine({ steps: [step], progress, mode: 'f2p', qp: 0, state }).plan(step, { ahead: 0 });
    expect(plan.slots).toMatchObject({ used: 2, adding: 34, over: 8 });
    expect(plan.now[0].action?.label).toContain('34 Trout');
    expect(bankWithdrawalsOf(plan)).toEqual([{ itemId: 333, itemName: 'Trout', quantity: 34 }]);
  });
  it('takes only the physical bite needed to finish mixed carried healing', () => {
    const owned = { bankSeen: true, items: new Map([
      ['salmon', { name: 'Salmon', carried: 0, noted: 0, bank: 0 }],
      ['shrimps', { name: 'Shrimps', carried: 2, noted: 0, bank: 0 }],
      ['cooked meat', { name: 'Cooked meat', carried: 0, noted: 0, bank: 1 }],
    ]) };
    const stock = heldFood({ owned, equipment: {}, manual: {}, bankSeen: true }, { nameEn: 'Salmon', heals: 9, anyOf: ['Shrimps', 'Cooked meat'] });
    expect(foodCarry(stock, 1)).toEqual({ take: [{ name: 'Cooked meat', count: 1, noted: false }], adding: 1, missing: 0 });
    expect(itemPreflight({ pre: [{ item: 'Salmon', n: 1, alt: ['Shrimps', 'Cooked meat'] }] }, {
      carried: [{ id: 315, name: 'Shrimps', count: 2 }], bank: [{ id: 2142, name: 'Cooked meat', count: 1 }], from: { x: 3222, y: 3218, plane: 0 },
    })?.via).toBe('bank');
  });

  it('does not withdraw a second copy of food already carried', () => {
    const stock = heldFood({ owned: { bankSeen: true, items: new Map([
      ['salmon', { name: 'Salmon', carried: 1, noted: 0, bank: 0 }],
      ['trout', { name: 'Trout', carried: 0, noted: 1, bank: 1 }],
    ]) }, equipment: {}, manual: {}, bankSeen: true }, { nameEn: 'Salmon', heals: 9, anyOf: ['Trout'] });
    expect(foodCarry(stock, 1)).toEqual({ take: [], adding: 0, missing: 0 });
    expect(foodCarry(stock, 2)).toEqual({ take: [{ name: 'Trout', count: 1, noted: true }, { name: 'Trout', count: 1, noted: false }], adding: 2, missing: 0 });
  });

  it('caps physical food healing at the real HP level', () => {
    const stock = heldFood({ owned: { bankSeen: true, items: new Map([
      ['salmon', { name: 'Salmon', carried: 0, noted: 0, bank: 0 }],
      ['tuna', { name: 'Tuna', carried: 0, noted: 0, bank: 2 }],
    ]) }, equipment: {}, manual: {}, bankSeen: true }, { nameEn: 'Salmon', heals: 9, anyOf: ['Tuna'] }, undefined, 10);
    expect(foodCarry(stock, 3)).toEqual({ take: [{ name: 'Tuna', count: 2, noted: false }], adding: 3, missing: 1 });
  });

  it('shares banked food once across current and upcoming deadlines', () => {
    const makeStep = (id: string): Step => ({ id, stage: 1, type: 'skill', title: 'Training', requires: [], doneWhen: 'Goal reached',
      itemsRequired: [{ nameEn: 'Salmon', amount: 1, heals: 9, anyOf: ['Trout'], howToGet: 'Grand Exchange' }] });
    const steps = [makeStep('food-now'), makeStep('food-next')];
    const progress = emptyProgress();
    const state = buildPlayerState({ mode: 'f2p', stats: { hitpoints: 24 } as never, progress, questsDone: null,
      gear: { equipment: [], inventory: [], inventorySlots: 2, coins: 0, bankCoins: 0 },
      owned: { bankSeen: true, items: new Map([
        ['salmon', { name: 'Salmon', carried: 0, noted: 0, bank: 0 }],
        ['trout', { name: 'Trout', carried: 0, noted: 0, bank: 3 }],
      ]) },
    });
    const plan = createReadinessEngine({ steps, progress, mode: 'f2p', qp: 0, state }).plan(steps[0], { ahead: 1 });
    expect(plan.slots).toMatchObject({ used: 2, adding: 3, over: 0 });
    const withdrawals = bankWithdrawalsOf(plan);
    expect(withdrawals.every(item => item.itemName === 'Trout')).toBe(true);
    expect(withdrawals.reduce((n, item) => n + item.quantity, 0)).toBe(3);
    expect(plan.lines.flatMap(line => line.foodTake ?? []).reduce((n, item) => n + item.count, 0)).toBe(3);
  });

});
