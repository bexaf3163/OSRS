import { describe, expect, it } from 'vitest';
import { allSteps, stepById } from '../../data';
import { assumptionsFor, foodPicks, withFoodPlan } from './foodPlan';
import { aggregateShopping } from '../prep/shopping';
import { emptyProgress } from '../persistence/progress';
import { stepReadiness } from '../readiness/readiness';
import type { OwnedItem, OwnedState } from '../items/checklist';
import { nameKey } from '../items/itemKey';
import { gearById } from './gearAdvisor';
import type { GearState } from '../../services/runeliteBridge';
import type { Progress } from '../../types';
import { retiredStep } from '../../../tests/fixtures/retiredSteps';

// The plan into the route: readiness asks for one trip, the shopping list buys the whole goal; S4-03 is estimated from where S3-08 leaves you.

const id = (n: string) => [...gearById.values()].find((p) => p.name === n)!.id;
const gear: GearState = {
  equipment: ['Mithril scimitar', 'Iron full helm', 'Iron platebody', 'Iron plateskirt', 'Iron kiteshield'].map((n) => ({ id: id(n), name: n })),
  inventory: [], coins: 0, bankCoins: 5000,
};
const stats = { attack: 22, strength: 16, defence: 1, hitpoints: 22 };
const xp = { attack: 5624, strength: 2746, defence: 0 };
function owned(items: Record<string, number>): OwnedState {
  const map = new Map<string, OwnedItem>();
  for (const [n, bank] of Object.entries(items)) map.set(nameKey(n), { name: n, carried: 0, noted: 0, bank });
  return { bankSeen: true, items: map };
}
/** Everything before S3-08 done. */
function before(stepId: string): Progress {
  const p = emptyProgress();
  for (const s of allSteps) {
    if (s.id === stepId) break;
    p.steps[s.id] = 'done';
  }
  return p;
}
const progress = before('S3-08');
const live = { stats, xp, gear, owned: owned({ Salmon: 13 }) };

describe('the assumptions of a later step', () => {
  it('S3-08, the first open combat step: the game as it is', () => {
    expect(assumptionsFor(retiredStep('S3-08')!, allSteps, progress)).toBeNull();
  });
});

describe('the picks', () => {

  it('no levels or no gear from the game: no picks, the route amounts stand', () => {
    expect(foodPicks(allSteps, progress, { ...live, stats: null })).toEqual({});
    expect(foodPicks(allSteps, progress, { ...live, gear: null })).toEqual({});
  });

  it('a closed step gets no pick', () => {
    expect(foodPicks(allSteps, before('S4-01'), live)['S3-08']).toBeUndefined();
  });

  it('is fast enough to run on every XP drop', () => {
    const t = performance.now();
    for (let i = 0; i < 5; i++) foodPicks(allSteps, progress, { ...live, xp: { ...xp, strength: xp.strength + i * 40 } });
    expect((performance.now() - t) / 5).toBeLessThan(150);
  });
});

describe('into readiness and shopping', () => {
  const s = retiredStep('S3-08')!;
  const picked = withFoodPlan(s, { trip: 26, total: 110, hpPerKill: 3.4, essential: true });

  it('the food asks for one trip and carries the whole goal; other items are untouched', () => {
    const salmon = picked.itemsRequired!.find((i) => i.nameEn === 'Salmon')!;
    expect(salmon).toMatchObject({ amount: 26, totalAmount: 110 });
    expect(picked.itemsRequired!.find((i) => i.nameEn === 'Mithril scimitar')).toBe(s.itemsRequired!.find((i) => i.nameEn === 'Mithril scimitar'));
    // No estimate: the route's amount is only a suggestion, never a requirement.
    const unestimated = withFoodPlan(s, undefined);
    expect(unestimated.itemsRequired!.some((i) => i.nameEn === 'Salmon')).toBe(false);
    expect(unestimated.itemsRecommended!.find((i) => i.nameEn === 'Salmon')).toMatchObject({ amount: s.itemsRequired!.find((i) => i.nameEn === 'Salmon')!.amount, howToGet: expect.stringMatching(/^Optional: the risk of this fight is not estimated/) });
  });

  it('readiness: 20 Salmon was enough before, now one bag is 26', () => {
    const o: OwnedState = owned({ 'Mithril scimitar': 1, Salmon: 20, Trout: 0, Tuna: 0, Lobster: 0, Swordfish: 0 });
    const salmon = (step: typeof s) =>
      stepReadiness({ step, steps: allSteps, progress, qp: 20, mode: 'f2p', stats, owned: o, gear }).requirements.find((q) => q.label.startsWith('Salmon'))!;
    expect(salmon(s)).toMatchObject({ label: 'Salmon ×20 (or Trout, Tuna…)', state: 'BANK' });
    expect(salmon(picked)).toMatchObject({ label: 'Salmon ×26 (or Trout, Tuna…)', state: 'PARTIAL' });
  });

  it('the shopping list buys the whole goal', () => {
    const line = aggregateShopping([picked], { wholeGoal: true }).required.find((l) => l.nameEn === 'Salmon')!;
    expect(line.count).toBe(110);
    expect(aggregateShopping([s], { wholeGoal: true }).required.find((l) => l.nameEn === 'Salmon')!.count).toBe(20);
    // What to carry now (the next steps' kit) is one trip.
    expect(aggregateShopping([picked]).required.find((l) => l.nameEn === 'Salmon')!.count).toBe(26);
  });

  it('training food is only recommended: a trip can always end to heal', () => {
    const t = withFoodPlan(s, { trip: 26, total: 110, hpPerKill: 3.4, essential: false });
    expect(t.itemsRequired!.some((i) => i.nameEn === 'Salmon')).toBe(false);
    expect(t.itemsRecommended!.find((i) => i.nameEn === 'Salmon')).toMatchObject({ amount: 26, totalAmount: 110 });
    expect(aggregateShopping([t], { wholeGoal: true }).required.some((l) => l.nameEn === 'Salmon')).toBe(false);
  });

  it('no food needed at all: the food is not asked for', () => {
    expect(withFoodPlan(s, { trip: 0, total: 0, hpPerKill: 0, essential: false }).itemsRequired!.some((i) => i.nameEn === 'Salmon')).toBe(false);
  });
});

describe('one number to buy', () => {
  it('the food row is about the trip and names the whole-goal purchase', () => {
    const picked = withFoodPlan(retiredStep('S3-08')!, { trip: 26, total: 110, hpPerKill: 3.4, essential: true });
    const o: OwnedState = owned({ 'Mithril scimitar': 1, Salmon: 13, Trout: 0, Tuna: 0, Lobster: 0, Swordfish: 0 });
    const row = stepReadiness({ step: picked, steps: allSteps, progress, qp: 20, mode: 'f2p', stats, owned: o, gear })
      .requirements.find((q) => q.label.startsWith('Salmon'))!;
    expect(row.detail).toBe('have 13, 13 short; buy about 97 for the whole goal');
  });
});


describe('the food of a quest fight (combat audit, 2.66.0)', () => {
  const at = before('S4-01');
  const weak = { ...live, stats: { attack: 10, strength: 10, defence: 1, hitpoints: 14 }, owned: owned({}) };

  it("a kit that needs more than the route writes raises the step's food, up to one bag", () => {
    const pick = foodPicks(allSteps, at, weak)['S4-01'];
    expect(pick).toBeTruthy();
    expect(pick.trip).toBeGreaterThan(10);
    expect(pick.trip).toBeLessThanOrEqual(26);
    expect(pick.total).toBe(pick.trip);
    const s = withFoodPlan(stepById.get('S4-01')!, pick);
    expect(s.itemsRequired!.find((i) => i.nameEn === 'Salmon')!.amount).toBe(pick.trip);
    expect(aggregateShopping([s], { wholeGoal: true }).required.find((l) => l.nameEn === 'Salmon')?.count).toBe(pick.trip);
  });

  it("a strong kit asks for its own smaller amount: the route's amount is never a floor", () => {
    const strong = { ...live, stats: { attack: 60, strength: 60, defence: 60, hitpoints: 60 }, owned: owned({}) };
    const pick = foodPicks(allSteps, at, strong)['S4-01'];
    const written = Number(stepById.get('S4-01')!.itemsRequired!.find((i) => i.nameEn === 'Salmon')!.amount);
    expect(pick).toMatchObject({ essential: true });
    expect(pick.trip).toBeLessThan(written);
    expect(pick.trip).toBeLessThan(foodPicks(allSteps, at, weak)['S4-01'].trip);
    expect(withFoodPlan(stepById.get('S4-01')!, pick).itemsRequired!.find((i) => i.nameEn === 'Salmon')!.amount).toBe(pick.trip);
  });

  it('a fight after an open training step is not sized from the levels of now', () => {
    expect(foodPicks(allSteps, before('S3-08'), weak)['S4-01']).toBeUndefined();
  });

  it('without levels or gear from the game nothing is picked', () => {
    expect(foodPicks(allSteps, at, { ...weak, stats: null })['S4-01']).toBeUndefined();
    expect(foodPicks(allSteps, at, { ...weak, gear: null })['S4-01']).toBeUndefined();
  });
});
