import { describe, expect, it } from 'vitest';
import { actionsForQuantity, quantityForActions, validConsumption } from '../src/lib/consumption';
import { PROCESSING, processRate } from '../src/lib/processingRates';
import { processingGoalNeeds } from '../src/lib/processingGoal';
import { buildPlayerState } from '../src/lib/playerState';
import { emptyProgress } from '../src/lib/progress';
import { trackedTraining } from '../src/lib/trackedTraining';
import { createReadinessEngine } from '../src/lib/readinessEngine';
import type { PriceView } from '../src/lib/funding/quotes';
import { trainingMethods, type PathLeg } from '../src/lib/trainingRouter';

const thread = { qty: 0.2, initialReserve: 0.8 };
const names = [...new Set(PROCESSING.recipes.flatMap(r => [...r.tools, ...r.inputs.map(i => i.name)]))];
function character(spools: number, leather: number, level = 1, extra: Record<string, number> = {}) {
  const carried: Record<string, number> = { Needle: 1, Thread: spools, Leather: leather, ...extra };
  return buildPlayerState({ mode: 'f2p', connected: true, stats: { crafting: level, hitpoints: 30 },
    progress: emptyProgress(), questsDone: [],
    gear: { equipment: [], inventory: Object.entries(carried).map(([name, count]) => ({ name, count, id: 0 })), coins: 0, bankCoins: 0 },
    owned: { bankSeen: true, items: new Map(names.map(name => [name.toLowerCase(), { name, carried: carried[name] ?? 0, noted: 0, bank: 0 }])) },
  });
}
const method = trainingMethods.find(m => m.id === 'cr-leather')!;

describe('multi-use materials share safe physical quantities across the lifecycle', () => {
  it('supports future charged ingredients for every possible first-unit remainder', () => {
    for (const uses of [3, 5, 7]) for (let count = 1; count <= 30; count++) {
      const input = { qty: 1 / uses, initialReserve: (uses - 1) / uses };
      const guaranteed = actionsForQuantity(input, count);
      for (let remaining = 1; remaining <= uses; remaining++) {
        expect(guaranteed).toBeLessThanOrEqual(remaining + (count - 1) * uses);
      }
      expect(quantityForActions(input, guaranteed)).toBeLessThanOrEqual(count);
      expect(quantityForActions(input, guaranteed + 1)).toBeGreaterThan(count);
    }
  });
  it.each([[1, 1], [2, 6], [6, 26]])('%i spools prepare %i safe leather actions without another shopping trip', (spools, actions) => {
    const state = character(spools, 26), before = structuredClone(state);
    const rate = processRate(method, 'crafting', state)!;
    expect(rate.batchActions).toBe(actions);
    expect(rate.consumables?.find(i => i.name === 'Thread')).toMatchObject(thread);
    const followed = trackedTraining({ skill: 'crafting', mode: 'f2p', target: 2 }, state, 'f2p', 'chill', 'balanced')!;
    const engine = createReadinessEngine({ steps: [followed.step], state, progress: emptyProgress(), qp: 0, mode: 'f2p' });
    expect(engine.prep(followed.step).ready).toBe(true);
    expect(engine.prep(followed.step).tasks).toEqual([]);
    expect(state).toEqual(before);
  });
  it('keeps whole-goal quantities integer and safe without charging one spool per action', () => {
    const path = [{ fromLevel: 1, toLevel: 2, method: { ...method, xpa: 13.8,
      consumables: [{ name: 'Leather', qty: 1 }, { name: 'Thread', ...thread }],
      needs: [{ type: 'item', name: 'Needle', count: 1 }, { type: 'item', name: 'Leather', count: 26 }, { type: 'item', name: 'Thread', count: 6 }],
    } }] as PathLeg[];
    expect(processingGoalNeeds(path, 1, 2)).toContainEqual({ type: 'item', name: 'Thread', count: 3 });
    expect(processingGoalNeeds(path, 1, 2)).toContainEqual({ type: 'item', name: 'Leather', count: 7 });
    path[0].method.consumables![1].initialReserve = NaN;
    expect(processingGoalNeeds(path, 1, 2)).toBeNull();
  });
  it('uses owned silver and the correct mould at23 through the same preparation engine', () => {
    const materials = { 'Silver bar': 7, 'Tiara mould': 1 };
    const state = character(0, 0, 23, materials);
    const followed = trackedTraining({ skill: 'crafting', mode: 'f2p', target: 24 }, state, 'f2p', 'chill', 'balanced')!;
    expect(followed.step.itemsRequired?.find(n => n.nameEn === 'Silver bar')?.amount).toBe(7);
    expect(followed.step.itemsRequired?.some(n => n.nameEn === 'Tiara mould')).toBe(true);
    expect(followed.step.itemsRequired?.some(n => n.nameEn === 'Ring mould')).toBe(false);
    expect(followed.step.inGame?.objectNames).toContain('Furnace');
    const engine = createReadinessEngine({ steps: [followed.step], state, progress: emptyProgress(), qp: 0, mode: 'f2p' });
    expect(engine.prep(followed.step).ready).toBe(true);
    expect(engine.prep(followed.step).tasks).toEqual([]);
    const below = character(0, 0, 22, materials);
    expect(processRate(trainingMethods.find(m => m.id === 'cr-gold')!, 'crafting', below)?.basis).not.toBe('Tiara');
  });
  it('prices average consumption rather than the one-time physical allowance', () => {
    const unit = (price: number) => ({ price, basis: 'side' as const, confidence: 'HIGH' as const, ageMinutes: 0, volumePerHour: null, notes: [] });
    const prices: PriceView = { status: 'live', at: 1, idOf: () => undefined, limitOf: () => undefined,
      buy: n => unit(n === 'Thread' ? 100 : n === 'Leather' ? 10 : 1), sell: () => unit(1) };
    const rate = processRate(method, 'crafting', character(6, 26), { prices })!;
    const actionsPerHour = (rate.xph[1] + rate.xph[0] * 1.1) / 2 / 13.8;
    expect(rate.costPerHour).not.toBeNull();
    expect(rate.costPerHour! / actionsPerHour).toBeCloseTo(30); // 10 leather + 100/5 thread.
  });
  it('leaves normal one-use inputs and reusable needles unchanged', () => {
    expect(actionsForQuantity({ qty: 2 }, 7)).toBe(3);
    expect(quantityForActions({ qty: 2 }, 3)).toBe(6);
    expect(quantityForActions(thread, 0)).toBe(0);
    for (const id of ['leather-gloves', 'leather-boots']) {
      const recipe = PROCESSING.recipes.find(r => r.id === id)!;
      expect(recipe.inputs.find(i => i.name === 'Thread')).toMatchObject(thread);
      expect(recipe.inputs.find(i => i.name === 'Leather')).toEqual({ name: 'Leather', qty: 1, stacks: false });
      expect(recipe.tools).toEqual(['Needle']);
    }
    for (const input of [{ qty: 0 }, { qty: NaN }, { qty: 1, initialReserve: -1 }, { qty: 1, initialReserve: 1 }]) {
      expect(validConsumption(input)).toBe(false);
      expect(actionsForQuantity(input, 10)).toBe(0);
    }
  });
});
