import { describe, expect, it } from 'vitest';
import { buildPlayerState } from '../src/domain/player/playerState';
import { emptyProgress } from '../src/domain/persistence/progress';
import { xpForLevel } from '../src/domain/player/xp';
import { rangedGoalNeeds } from '../src/domain/combat/combatRates';
import { rangedNeeds, RANGED_WATCH } from '../src/domain/combat/rangedLoadout';
import { adviseTraining, personalize, trainingMethods, type PathLeg, type MethodNeed } from '../src/domain/training/trainingRouter';
import { mergeGoalNeeds } from '../src/domain/items/consumption';
import { withTrainingMethod } from '../src/domain/training/methodStep';
import { aggregateShopping } from '../src/domain/prep/shopping';
import type { PriceView } from '../src/domain/market/quotes';
import { retiredStep } from './fixtures/retiredSteps';

const quote = { price: 2, basis: 'side' as const, confidence: 'HIGH' as const, ageMinutes: 0, volumePerHour: null, notes: [] };
const prices: PriceView = { status: 'live', at: 1, idOf: () => undefined, limitOf: () => undefined, buy: () => quote, sell: () => quote };
const state = (ranged = 26, hitpoints = 24) => buildPlayerState({ mode: 'f2p', connected: true,
  stats: { ranged, defence: 1, hitpoints }, progress: emptyProgress(), questsDone: [],
  gear: { equipment: [], inventory: [], coins: 100000, bankCoins: 0 },
  owned: { bankSeen: true, items: new Map([...RANGED_WATCH, 'Salmon', 'Tuna', 'Lobster', 'Swordfish'].map(name => [name.toLowerCase(), { name, carried: 0, noted: 0, bank: 0 }])) } });
const leg = (fromLevel: number, toLevel: number, s = state(fromLevel), id = 'ra-frog'): PathLeg => {
  // The fight model's food for this character (2.83.0): the catalogue no longer fixes an amount.
  const method = personalize([trainingMethods.find((m) => m.id === id)!], 'ranged', s, prices)[0];
  const food = method.needs.filter(n => n.type === 'item' && n.name === 'Salmon');
  return { method, fromLevel, toLevel, needs: [...food, ...rangedNeeds(s, prices)] }; // Food before bow is deliberate.
};
const items = (needs: MethodNeed[] | null) => needs?.filter((n): n is Extract<MethodNeed, { type: 'item' }> => n.type === 'item') ?? [];

describe('complete supported F2P Ranged demand', () => {
  it('budgets food over the full leg rather than calling one ten-fish trip the whole climb', () => {
    const st = state(), needs = items(rangedGoalNeeds([leg(26, 40, st)], st, xpForLevel(26), 40, prices));
    expect(needs.find(n => n.name === 'Salmon')!.count).toBeGreaterThan(10);
    expect(needs.find(n => n.name.endsWith('arrow'))!.count).toBeGreaterThanOrEqual(100);
    expect(needs.filter(n => n.name === 'Willow shortbow')).toHaveLength(1);
    expect(needs.find(n => n.name === 'Willow shortbow')!.count).toBe(1);
  });
  it('keeps declared preparation buffers and never repeatedly buys the same reusable bow', () => {
    const st = state(20), first = leg(20, 26, st, 'ra-monk'), next = leg(26, 30, st);
    first.needs = first.needs!.map(n => n.type === 'item' && n.name.endsWith('arrow') ? { ...n, name: 'Bronze arrow', count: 100 } : n);
    next.needs = next.needs!.map(n => n.type === 'item' && n.name.endsWith('arrow') ? { ...n, name: 'Iron arrow', count: 100 } : n);
    const needs = items(rangedGoalNeeds([first, next], st, xpForLevel(20), 30, prices));
    expect(needs.find(n => n.name === 'Bronze arrow')!.count).toBeGreaterThanOrEqual(100);
    expect(needs.find(n => n.name === 'Iron arrow')!.count).toBeGreaterThanOrEqual(100);
    expect(needs.find(n => n.name === 'Willow shortbow')!.count).toBe(1);
  });
  it('a new method inherits full-leg recovery without a method-ID patch', () => {
    const st = state(), original = leg(26, 30, st), future = { ...original, method: { ...original.method, id: 'future-supported-bow-trainer' } };
    expect(rangedGoalNeeds([future], st, xpForLevel(26), 30, prices)).toEqual(rangedGoalNeeds([original], st, xpForLevel(26), 30, prices));
  });
  it('never grants future equipment, food, XP or cash to the observed character', () => {
    const st = state(), before = structuredClone(st);
    const advice = adviseTraining({ skill: 'ranged', target: 40, mode: 'f2p', state: st, prices, priority: 'fastest' });
    expect(advice.goalNeeds).toBeTruthy();
    expect(st).toEqual(before);
  });
  it('does not manufacture complete supplies for unread health, Members, missing kits or incomplete paths', () => {
    const st = state(), path = [leg(26, 30, st)];
    expect(rangedGoalNeeds(path, st, xpForLevel(26), 40, prices)).toBeNull();
    expect(rangedGoalNeeds(path, { ...st, mode: 'members' }, xpForLevel(26), 30, prices)).toBeNull();
    expect(rangedGoalNeeds(path, { ...st, levels: { ...st.levels, hitpoints: { known: false } } }, xpForLevel(26), 30, prices)).toBeNull();
    expect(rangedGoalNeeds([{ ...path[0], needs: undefined }], st, xpForLevel(26), 30, prices)).toBeNull();
    expect(rangedGoalNeeds([{ ...path[0], fromLevel: 27 }], st, xpForLevel(26), 30, prices)).toBeNull();
  });
  it('route and goal Shopping get conservative totals while the game still asks for one bag', () => {
    // 10 Hitpoints: a frog fight can reach the eating point, so the food is required, one bag a trip.
    const st = state(26, 10), base = retiredStep('S6-04')!;
    const planned = leg(26, 40, st);
    const step = withTrainingMethod(base, { methodId: planned.method.id, needs: planned.needs!, goalNeeds: rangedGoalNeeds([planned], st, xpForLevel(26), 40, prices)!, untilLevel: 40 });
    const bag = items(planned.needs ?? null).find((n) => n.name === 'Salmon')!.count!;
    expect(step.itemsRequired!.find((n) => n.nameEn === 'Salmon')!.amount).toBe(bag);
    expect(step.goalItemsRequired!.find((n) => n.nameEn === 'Salmon')!.amount).toBeGreaterThan(bag);
    const now = aggregateShopping([step]).required.find(n => n.nameEn === 'Salmon')!;
    const goal = aggregateShopping([step], { wholeGoal: true }).required.find(n => n.nameEn === 'Salmon')!;
    expect(goal.count).toBeGreaterThan(now.count);
    expect(step.inGame?.completionTrigger).toEqual(base.inGame?.completionTrigger);
  });
  it('shared aggregation adds consumption and maxes initial buffers, rejecting invalid kit counts', () => {
    const material: Extract<MethodNeed, { type: 'item' }> = { type: 'item', name: 'Future arrow', count: 3 };
    expect(mergeGoalNeeds([material, material], [], [{ ...material, count: 100, equip: true }])).toEqual([{ ...material, count: 100 }]);
    expect(mergeGoalNeeds([material], [{ type: 'item', name: 'Tool', count: NaN }])).toBeNull();
  });
});
