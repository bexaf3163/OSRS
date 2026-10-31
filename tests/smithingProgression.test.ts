import { describe, expect, it } from 'vitest';
import { PROCESSING, processRate } from '../src/lib/processingRates';
import { buildPlayerState } from '../src/lib/playerState';
import { emptyProgress } from '../src/lib/progress';
import { trackedTraining } from '../src/lib/trackedTraining';
import { createReadinessEngine } from '../src/lib/readinessEngine';
import { trainingMethods } from '../src/lib/trainingRouter';

const names = [...new Set(PROCESSING.recipes.flatMap(r => [...r.tools, ...r.inputs.map(i => i.name)]))];
function character(level: number, carried: Record<string, number>, skill = 'smithing') {
  return buildPlayerState({ mode: 'f2p', connected: true, stats: { [skill]: level, hitpoints: 40 },
    progress: emptyProgress(), questsDone: ["The Knight's Sword"],
    gear: { equipment: [], inventory: Object.entries(carried).map(([name, count]) => ({ name, count, id: 0 })), coins: 0, bankCoins: 0 },
    owned: { bankSeen: true, items: new Map(names.map(name => [name.toLowerCase(), { name, carried: carried[name] ?? 0, noted: 0, bank: 0 }])) },
  });
}
const method = (id: string) => trainingMethods.find(m => m.id === id)!;
const ores: [number, Record<string, number>, string, number][] = [
  [1, { 'Copper ore': 14, 'Tin ore': 14 }, 'Bronze bar', 14],
  [15, { 'Iron ore': 28 }, 'Iron bar', 28],
  [20, { 'Silver ore': 28 }, 'Silver bar', 28],
  [30, { 'Iron ore': 9, Coal: 18 }, 'Steel bar', 9],
  [40, { 'Gold ore': 28 }, 'Gold bar', 28],
  [50, { 'Mithril ore': 5, Coal: 20 }, 'Mithril bar', 5],
  [70, { 'Adamantite ore': 4, Coal: 24 }, 'Adamantite bar', 4],
  [85, { 'Runite ore': 3, Coal: 24 }, 'Runite bar', 3],
];

describe('Smithing recipes use the shared owned-material lifecycle', () => {
  it.each(ores)('level%s uses owned ore for%s with%s whole actions', (level, carried, product, actions) => {
    const state = character(level, carried), before = structuredClone(state);
    const rate = processRate(method('sm-smelting'), 'smithing', state)!;
    expect(rate.basis).toBe(product);
    expect(rate.batchActions).toBe(actions);
    expect(rate.spot?.objectNames).toContain('Furnace');
    expect(rate.needs?.some(n => n.type === 'item' && n.name === 'Hammer')).toBe(false);
    expect(state).toEqual(before);
  });
  it('keeps ordinary iron failure in both XP and output assumptions', () => {
    const rate = processRate(method('sm-smelting'), 'smithing', character(15, { 'Iron ore': 28 }))!;
    expect(rate.xpPerAction).toBe(6.25);
    expect(PROCESSING.recipes.find(r => r.id === 'iron-bar')?.chance).toBe(0.5);
  });
  for (const [tier, bar, level] of [
    ['iron', 'Iron bar', 33], ['steel', 'Steel bar', 48],
    ['mithril', 'Mithril bar', 68], ['adamant', 'Adamantite bar', 88],
  ] as const) {
    it.each([[1, 'dagger'], [3, 'warhammer'], [5, 'platebody']] as const)(tier + ': %s bars select a feasible %s without rebuying', (count, product) => {
      const rate = processRate(method('sm-' + tier), 'smithing', character(level, { Hammer: 1, [bar]: count }))!;
      expect(rate.basis.toLowerCase()).toContain(product);
      expect(rate.needs).toContainEqual({ type: 'item', name: bar, count });
      expect(rate.needs).toContainEqual({ type: 'item', name: 'Hammer', count: 1 });
    });
  }
  it.each([[15, 'dagger'], [24, 'warhammer'], [33, 'platebody']] as const)('iron progresses at%s to%s rather than freezing on one product', (level, product) => {
    const state = buildPlayerState({ mode: 'f2p', connected: false, stats: null, progress: { ...emptyProgress(), levels: { smithing: level } },
      owned: null, gear: null, questsDone: [] });
    expect(processRate(method('sm-iron'), 'smithing', state, { objective: 'fastest' })?.basis.toLowerCase()).toContain(product);
  });
  it('does not unlock higher bars or anvil products early', () => {
    expect(processRate(method('sm-smelting'), 'smithing', character(49, { 'Mithril ore': 5, Coal: 20 }))?.basis).not.toBe('Mithril bar');
    expect(processRate(method('sm-iron'), 'smithing', character(23, { Hammer: 1, 'Iron bar': 3 }))?.basis.toLowerCase()).not.toContain('warhammer');
  });
  it('follows owned steel materials to the furnace instead of buying bars for the anvil', () => {
    const state = character(30, { 'Iron ore': 3, Coal: 6 });
    const followed = trackedTraining({ skill: 'smithing', mode: 'f2p', target: 31 }, state, 'f2p', 'chill', 'balanced')!;
    expect(followed.step.itemsRequired?.find(n => n.nameEn === 'Coal')?.amount).toBe(6);
    expect(followed.step.itemsRequired?.some(n => n.nameEn === 'Hammer')).toBe(false);
    expect(followed.step.inGame?.objectNames).toContain('Furnace');
    expect(followed.step.inGame?.objectNames).not.toContain('Anvil');
    const engine = createReadinessEngine({ steps: [followed.step], state, progress: emptyProgress(), qp: 0, mode: 'f2p' });
    expect(engine.prep(followed.step).ready).toBe(true);
    expect(engine.prep(followed.step).tasks).toEqual([]);
  });
  it.each([[1, 'Logs', 'fm-normal'], [15, 'Oak logs', 'fm-oak'], [30, 'Willow logs', 'fm-willow'], [45, 'Maple logs', 'fm-maple'], [60, 'Yew logs', 'fm-yew']] as const)(
    'Firemaking%s retains the usable %s batch and a reusable tinderbox', (level, logs, id) => {
      const state = character(level, { [logs]: 7, Tinderbox: 1 }, 'firemaking');
      const rate = processRate(method(id), 'firemaking', state)!;
      expect(rate.needs).toContainEqual({ type: 'item', name: 'Tinderbox', count: 1 });
      expect(rate.needs).toContainEqual({ type: 'item', name: logs, count: 7 });
      const followed = trackedTraining({ skill: 'firemaking', mode: 'f2p', target: level + 1 }, state, 'f2p', 'chill', 'balanced')!;
      const engine = createReadinessEngine({ steps: [followed.step], state, progress: emptyProgress(), qp: 0, mode: 'f2p' });
      expect(engine.prep(followed.step).ready).toBe(true);
      expect(engine.prep(followed.step).tasks).toEqual([]);
    });
});
