import { describe, expect, it } from 'vitest';
import { recipeTicks } from '../scripts/wiki';
import { PROCESSING, processRate } from '../src/lib/processingRates';
import { buildPlayerState } from '../src/lib/playerState';
import { emptyProgress } from '../src/lib/progress';
import { adviseTraining, trainingMethods } from '../src/lib/trainingRouter';
import { trackedTraining } from '../src/lib/trackedTraining';
import { createReadinessEngine } from '../src/lib/readinessEngine';
import { methodToolNames } from '../src/lib/methodStep';

const names = [...new Set(PROCESSING.recipes.flatMap(r => [...r.tools, ...r.inputs.map(i => i.name)]))];
function character(level: number, carried: Record<string, number>, bank: Record<string, number> = {}) {
  return buildPlayerState({ mode: 'f2p', connected: true, stats: { cooking: level, hitpoints: 30 },
    progress: emptyProgress(), questsDone: [],
    gear: { equipment: [], inventory: Object.entries(carried).map(([name, count]) => ({ name, count, id: 0 })), coins: 0, bankCoins: 0 },
    owned: { bankSeen: true, items: new Map(names.map(name => [name.toLowerCase(), { name, carried: carried[name] ?? 0, noted: 0, bank: bank[name] ?? 0 }])) },
  });
}
const fish = [
  [1, 'Raw shrimps', 'ck-meat'], [1, 'Raw anchovies', 'ck-meat'], [1, 'Raw sardine', 'ck-meat'],
  [5, 'Raw herring', 'ck-meat'], [15, 'Raw trout', 'ck-trout'], [20, 'Raw pike', 'ck-trout'],
  [25, 'Raw salmon', 'ck-trout'], [30, 'Raw tuna', 'ck-tuna'], [40, 'Raw lobster', 'ck-tuna'], [45, 'Raw swordfish', 'ck-tuna'],
] as const;

describe('Cooking uses the Fishing catch through the shared staged lifecycle', () => {
  it.each(fish)('Cooking %s prepares owned %s instead of buying another ingredient', (level, raw, family) => {
    const state = character(level, { [raw]: 7 });
    const before = structuredClone(state);
    const advice = adviseTraining({ skill: 'cooking', target: level + 1, mode: 'f2p', style: 'chill', priority: 'balanced', state });
    expect(advice.best?.method.id).toBe(family);
    const followed = trackedTraining({ skill: 'cooking', mode: 'f2p', target: level + 1 }, state, 'f2p', 'chill', 'balanced')!;
    expect(followed.step.itemsRequired?.some(n => n.nameEn === raw || n.anyOf?.includes(raw))).toBe(true);
    expect(followed.step.inGame?.objectNames).toContain('Fire');
    expect(followed.step.inGame?.npcNames ?? []).toEqual([]);
    expect(followed.step.inGame?.completionTrigger).toEqual({ type: 'SKILL_LEVEL', levels: [{ skill: 'cooking', level: level + 1 }] });
    const engine = createReadinessEngine({ steps: [followed.step], state, progress: emptyProgress(), qp: 0, mode: 'f2p' });
    expect(engine.prep(followed.step).ready).toBe(true);
    expect(engine.prep(followed.step).tasks).toEqual([]);
    expect(state).toEqual(before);
  });
  it('finishes a compatible partial mixed catch without a bank or GE detour', () => {
    const state = character(1, { 'Raw shrimps': 4, 'Raw anchovies': 3 });
    const followed = trackedTraining({ skill: 'cooking', mode: 'f2p', target: 5 }, state, 'f2p', 'chill', 'balanced')!;
    const food = followed.step.itemsRequired!.find(n => n.nameEn === 'Raw shrimps' || n.anyOf?.includes('Raw shrimps'))!;
    expect(food.amount).toBe(7);
    const engine = createReadinessEngine({ steps: [followed.step], state, progress: emptyProgress(), qp: 0, mode: 'f2p' });
    expect(engine.prep(followed.step).ready).toBe(true);
  });
  it('does not substitute a fish the observed Cooking level cannot prepare', () => {
    const state = character(24, { 'Raw salmon': 28 });
    const method = trainingMethods.find(m => m.id === 'ck-trout')!;
    const rate = processRate(method, 'cooking', state)!;
    expect(rate.needs?.some(n => n.type === 'item' && (n.name === 'Raw salmon' || n.anyOf?.includes('Raw salmon')))).toBe(false);
  });
  it('includes every configured recipe in the shared inventory/bank watch automatically', () => {
    const followed = trackedTraining({ skill: 'cooking', mode: 'f2p', target: 35 }, character(1, {}), 'f2p', 'chill', 'balanced')!;
    expect(methodToolNames(followed.step)).toEqual(expect.arrayContaining(fish.map(([, raw]) => raw)));
  });
  it.each(['Make-All is 4 ticks', 'Increases to 4 when using the Make-X functionality.', '4 ticks for the rest', 'then 4 ticks'])('builds steady timing from the recipe note: %s', ticksnote => {
    expect(recipeTicks({ ticks: '1', ticksnote })).toBe(4);
    expect(recipeTicks({ ticks: '3' })).toBe(3);
  });
  it('uses ordinary Make-X timing and fire burn chance, not one-tick or range bonuses', () => {
    for (const [id, level, xp, low, high] of [['sardine', 1, 40, 118, 492], ['pike', 20, 80, 78, 412], ['salmon', 25, 90, 68, 392], ['swordfish', 45, 140, 18, 292]] as const) {
      expect(PROCESSING.recipes.find(r => r.id === id)).toMatchObject({ level, xp, ticks: 4, facility: 'fire', success: { low, high } });
    }
  });
});
