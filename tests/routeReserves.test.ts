import { describe, expect, it } from 'vitest';
import type { Step, StepItemRequirement } from '../src/types';
import { protectionsFor } from '../src/lib/funding/snapshot';
import { buildPlayerState } from '../src/lib/playerState';
import { cleanupAdvice, emptyCleanupPrefs } from '../src/lib/cleanup';
import { aggregateShopping } from '../src/lib/shopping';

const item = (nameEn: string, amount: number, extra: Partial<StepItemRequirement> = {}): StepItemRequirement => ({ nameEn, amount, howToGet: 'Get it', ...extra });
const step = (id: string, itemsRequired: StepItemRequirement[]): Step => ({ id, stage: 1, type: 'skill', title: id, requires: [], doneWhen: 'Done', itemsRequired });
const state = (items: Record<string, number>) => buildPlayerState({ mode: 'f2p', progress: { levels: { mining: 41 } }, stats: null, gear: null, questsDone: null, owned: {
  bankSeen: true, items: new Map(Object.entries(items).map(([name, bank]) => [name.toLowerCase(), { name, bank, carried: 0, noted: 0 }])),
} });

describe('selected-route stock reserves', () => {
  it('adds independent consumable demands exactly as Shopping does, but reuses a tool', () => {
    const steps = [step('A', [item('Iron ore', 10), item('Hammer', 1)]), step('B', [item('Iron ore', 15), item('Hammer', 1)])];
    const r = protectionsFor(steps);
    expect(r.get('iron ore')?.qty).toBe(25);
    expect(aggregateShopping(steps).required.find(l => l.nameEn === 'Iron ore')?.count).toBe(25);
    expect(r.get('hammer')?.qty).toBe(1);
  });

  it('protects one sufficient held alternative and does not allocate its stock twice', () => {
    const steps = [step('A', [item('Willow logs', 10, { anyOf: ['Oak logs'] })]), step('B', [item('Oak logs', 15)])];
    const r = protectionsFor(steps, state({ 'Oak logs': 30 }));
    expect(r.get('oak logs')?.qty).toBe(25);
    expect(r.get('willow logs')).toBeUndefined();
  });

  it('keeps only the surplus of an allocated alternative eligible for cleanup', () => {
    const steps = [step('A', [item('Willow logs', 10, { anyOf: ['Oak logs'] })])];
    const r = cleanupAdvice({ bag: [{ name: 'Oak logs', count: 15 }], openSteps: steps, reserves: protectionsFor(steps, state({ 'Oak logs': 15 })), bankSeen: true, account: 'normal', restriction: 'LIFTED', price: () => 90, tradeable: () => true, prefs: emptyCleanupPrefs() });
    expect(r.recs.find(l => l.name === 'Oak logs')).toMatchObject({ action: 'sell', qty: 5, keepQty: 10 });
  });

  it('uses healing for food and physical bottles for potion reserves', () => {
    const steps = [step('A', [item('Salmon', 2, { heals: 9, anyOf: ['Trout'] }), item('Strength potion(4)', 2)])];
    const r = protectionsFor(steps, state({ Trout: 3, 'Strength potion(1)': 8 }));
    expect(r.get('trout')?.qty).toBe(3);
    expect(r.get('strength potion(1)')?.qty).toBe(8);
    expect(r.get('salmon')).toBeUndefined();
    expect(r.get('strength potion(4)')).toBeUndefined();
  });

  it('does not let one merged step alternative replace a stricter later requirement', () => {
    const steps = [step('A', [item('Willow logs', 10, { anyOf: ['Oak logs'] })]), step('B', [item('Willow logs', 15)])];
    const r = protectionsFor(steps, state({ 'Oak logs': 30 }));
    expect(r.get('willow logs')?.qty).toBe(25);
    expect(r.get('oak logs')?.qty).toBe(10);
    const cleanup = cleanupAdvice({ bag: [{ name: 'Oak logs', count: 30 }], openSteps: steps, reserves: r, bankSeen: true, account: 'normal', restriction: 'LIFTED', price: () => 90, tradeable: () => true, prefs: emptyCleanupPrefs() });
    expect(cleanup.recs.find(l => l.name === 'Oak logs')).toMatchObject({ action: 'sell', qty: 20, keepQty: 10 });
  });

  it('keeps the food the exchange list buys for the whole plan, not just one trip: cleanup never sells it back', () => {
    const steps = [step('A', [item('Lobster', 6, { heals: 12, totalAmount: 40 })])];
    const r = protectionsFor(steps, state({ Lobster: 40 }));
    expect(r.get('lobster')?.qty).toBe(aggregateShopping(steps, { wholeGoal: true }).required.find(l => l.nameEn === 'Lobster')?.count);
    expect(r.get('lobster')?.qty).toBe(40);
    const cleanup = cleanupAdvice({ bag: [{ name: 'Lobster', count: 28 }], openSteps: steps, reserves: r, bankSeen: true, account: 'normal', restriction: 'LIFTED', price: () => 150, tradeable: () => true, prefs: emptyCleanupPrefs() });
    expect(cleanup.recs.find(l => l.name === 'Lobster' && l.action === 'sell')).toBeUndefined();
  });

  it('completion and carryover describe the same retained stock rather than a second consumption', () => {
    const a = step('A', [item('Big bones', 50)]);
    a.inGame = { completionTrigger: { type: 'ITEM_OWNED', items: [{ names: ['Big bones'], count: 50 }] } };
    a.carryover = [{ item: 'Big bones', count: 50, forStep: 'B', where: 'bank', why: 'Prayer later' }];
    expect(protectionsFor([a]).get('big bones')?.qty).toBe(50);
  });

  it('protects the full tool deficit and never calls an uncertain consumable quantity spare', () => {
    const steps = [step('A', [item('Hammer', 3), item('Iron ore', 1, { amount: 'Some' })])];
    const r = protectionsFor(steps, state({ Hammer: 2, 'Iron ore': 20 }));
    expect(r.get('hammer')?.qty).toBe(3);
    expect(r.get('iron ore')?.qty).toBe(Infinity);
  });
});
