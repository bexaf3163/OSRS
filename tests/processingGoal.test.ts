import { describe, expect, it } from 'vitest';
import { processingGoalNeeds } from '../src/lib/processingGoal';
import { adviseTraining, trainingMethods, type PathLeg } from '../src/lib/trainingRouter';
import { xpForLevel } from '../src/lib/xp';
import { emptyProgress } from '../src/lib/progress';
import { buildPlayerState } from '../src/lib/playerState';
import { stepById } from '../src/data';
import { methodToolNames, withTrainingMethod } from '../src/lib/methodStep';
import { pickMethods } from '../src/lib/methodPick';
import { aggregateShopping } from '../src/lib/shopping';
import { contextOf } from '../src/lib/readiness';
import { createReadinessEngine } from '../src/lib/readinessEngine';
import { buildNeed } from '../src/lib/funding/need';
import type { PriceView } from '../src/lib/funding/quotes';

const leg = (fromLevel: number, toLevel: number, xpa = 10): PathLeg => ({ fromLevel, toLevel,
  method: { ...trainingMethods.find(m => m.id === 'ck-meat')!, id: 'new-processing-method', xpa,
    consumables: [{ name: 'Future ingredient', qty: 1 }], needs: [{ type: 'item', name: 'Future tool', count: 1 }, { type: 'item', name: 'Future ingredient', count: 26 }] },
});
const prices: PriceView = { status: 'live', at: 1, idOf: () => undefined, limitOf: () => undefined,
  buy: () => ({ price: 1, basis: 'side', confidence: 'HIGH', ageMinutes: 0, volumePerHour: null, notes: [] }),
  sell: () => ({ price: 1, basis: 'side', confidence: 'HIGH', ageMinutes: 0, volumePerHour: null, notes: [] }) };
const state = (cooking = 1, fishing = 35) => {
  const base = stepById.get('S6-02')!;
  return buildPlayerState({ mode: 'f2p', connected: true, stats: { cooking, fishing, hitpoints: 31, defence: 33 }, progress: emptyProgress(), questsDone: [],
    gear: { equipment: [], inventory: [], coins: 10000, bankCoins: 0 },
    owned: { bankSeen: true, items: new Map(methodToolNames(base).map(name => [name.toLowerCase(), { name, carried: 0, noted: 0, bank: 0 }])) } });
};

describe('conditional full-goal processing supplies through the shared path', () => {
  it('sums attempted inputs over different recipes and reserves reusable tools only once', () => {
    const needs = processingGoalNeeds([leg(1, 2), leg(2, 3, 20)], 1, 3)!;
    expect(needs).toContainEqual({ type: 'item', name: 'Future tool', count: 1 });
    expect(needs).toContainEqual({ type: 'item', name: 'Future ingredient', count: Math.ceil(xpForLevel(2) / 10) + Math.ceil((xpForLevel(3) - xpForLevel(2)) / 20) });
  });
  it('uses observed partial XP when provided, without subtracting it twice', () => {
    expect(processingGoalNeeds([leg(1, 2)], 1, 2, 73)).toContainEqual({ type: 'item', name: 'Future ingredient', count: 1 });
  });
  it('uses integrated forecast attempts rather than freezing the first burn chance for a long climb', () => {
    const path = [leg(1, 3)]; path[0].processingActions = 12.1;
    expect(processingGoalNeeds(path, 1, 3)).toContainEqual({ type: 'item', name: 'Future ingredient', count: 13 });
  });
  it('rounds fractional expected input use after aggregation and preserves registered alternatives', () => {
    const path = [leg(1, 2)]; path[0].method.consumables = [{ name: 'Thread', qty: 0.2, anyOf: ['Equivalent thread'] }];
    path[0].method.needs = [{ type: 'item', name: 'Needle', count: 1 }, { type: 'item', name: 'Thread', count: 26, anyOf: ['Equivalent thread'] }];
    expect(processingGoalNeeds(path, 1, 2)).toContainEqual({ type: 'item', name: 'Thread', count: 2, anyOf: ['Equivalent thread'] });
  });
  it('does not call an incomplete or unsupported path a full-goal estimate', () => {
    expect(processingGoalNeeds([leg(2, 3)], 1, 3)).toBeNull();
    expect(processingGoalNeeds([leg(1, 2)], 1, 3)).toBeNull();
    const unknown = leg(1, 2); delete unknown.method.consumables;
    expect(processingGoalNeeds([unknown], 1, 2)).toBeNull();
    expect(processingGoalNeeds([leg(1, 2, NaN)], 1, 2)).toBeNull();
    expect(processingGoalNeeds([leg(1, 2)], 1, 2, NaN)).toBeNull();
    const emptyAttempts = leg(1, 2); emptyAttempts.processingActions = 0;
    expect(processingGoalNeeds([emptyAttempts], 1, 2)).toBeNull();
  });
  it('rejects overlapping incompatible alternatives and reusable/consumed name collisions', () => {
    const path = [leg(1, 2), leg(2, 3)]; path[1].method.consumables = [{ name: 'Future ingredient', qty: 1, anyOf: ['Other input'] }];
    expect(processingGoalNeeds(path, 1, 3)).toBeNull();
    const collision = [leg(1, 2), leg(2, 3)]; collision[1].method.consumables = [{ name: 'Future tool', qty: 1 }];
    expect(processingGoalNeeds(collision, 1, 3)).toBeNull();
  });
  it('does not grant projected inputs, levels or money to observed state', () => {
    const st = state(); const before = structuredClone(st);
    const advice = adviseTraining({ skill: 'cooking', target: 35, mode: 'f2p', style: 'chill', priority: 'balanced', state: st, prices });
    expect(advice.goalNeeds?.length).toBeGreaterThan(0);
    expect(st).toEqual(before);
  });
  it('route shopping includes the remaining Cooking goal while current preparation stays one bag', () => {
    const base = stepById.get('S6-02')!, st = state();
    const step = withTrainingMethod(base, pickMethods([base], st, 'f2p', 'chill', 'balanced', { prices })[base.id]);
    expect(step.itemsRequired?.reduce((sum, n) => sum + Number(n.amount ?? 1), 0)).toBeLessThanOrEqual(28);
    expect(step.goalItemsRequired?.reduce((sum, n) => sum + Number(n.amount ?? 1), 0)).toBeGreaterThan(28);
    const now = aggregateShopping([step]).required.reduce((sum, n) => sum + n.count, 0);
    const whole = aggregateShopping([step], { wholeGoal: true }).required.reduce((sum, n) => sum + n.count, 0);
    expect(whole).toBeGreaterThan(now);
    expect(step.inGame?.completionTrigger).toEqual(base.inGame?.completionTrigger);
  });
  it('keeps first-trip funding separate from the complete materials budget and leaves unread stock unknown', () => {
    const base = stepById.get('S6-02')!, st = state();
    const step = withTrainingMethod(base, pickMethods([base], st, 'f2p', 'chill', 'balanced', { prices })[base.id]);
    const needFor = (player: typeof st) => {
      const engine = createReadinessEngine({ ...contextOf({ step, steps: [step], progress: emptyProgress(), mode: 'f2p', qp: 100, owned: player.owned, gear: null, stats: { cooking: 1, fishing: 35 } }), state: player });
      return buildNeed({ step, prep: engine.plan(step), prices, owned: player.owned, manual: {} });
    };
    const known = needFor(st);
    expect(known.minimum.cost).toBeLessThanOrEqual(28);
    expect(known.objective.cost).toBeGreaterThan(known.minimum.cost);
    const unread = { ...st, bankSeen: false, owned: { ...st.owned!, bankSeen: false, items: new Map([...st.owned!.items].map(([key, item]) => [key, { ...item, bank: undefined }])) } };
    const unknown = needFor(unread);
    expect(unknown.objective.unknown).toBeGreaterThan(0);
    expect(unknown.objective.cost).toBe(0); // Excluded as unknown, never a claim that the materials are free.
  });

  it('does not label one current skill as all unresolved goals of a multi-skill step', () => {
    const base = stepById.get('S6-02')!, st = state(1, 1);
    const changed = { ...base, followsMethod: 'cooking', inGame: { ...base.inGame!, completionTrigger: { type: 'SKILL_LEVEL' as const, levels: [{ skill: 'cooking', level: 35 }, { skill: 'fishing', level: 35 }] } } };
    const step = withTrainingMethod(changed, pickMethods([changed], st, 'f2p', 'chill', 'balanced', { prices })[base.id]);
    expect(step.goalItemsRequired).toBeUndefined();
  });
});
