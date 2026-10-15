import { describe, expect, it } from 'vitest';
import { allSteps, stepById } from '../src/data';
import { assumptionsFor, foodPicks, stepWeapon, withFoodPlan } from '../src/lib/foodPlan';
import { aggregateShopping } from '../src/lib/shopping';
import { emptyProgress } from '../src/lib/progress';
import { stepReadiness } from '../src/lib/readiness';
import { nameKey, type OwnedItem, type OwnedState } from '../src/lib/checklist';
import { gearById } from '../src/services/gearAdvisor';
import type { GearState } from '../src/services/runeliteBridge';
import type { Progress } from '../src/types';

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
    expect(assumptionsFor(stepById.get('S3-08')!, allSteps, progress)).toBeNull();
  });

  it('S4-03 starts where S3-08 ends, with the Adamant scimitar it asks for', () => {
    const a = assumptionsFor(stepById.get('S4-03')!, allSteps, progress)!;
    expect(a.xp).toEqual({ strength: 4470, attack: 13363 });
    expect(a.weapon?.name).toBe('Adamant scimitar');
    expect(stepWeapon(stepById.get('S3-08')!)?.name).toBe('Mithril scimitar');
  });
});

describe('the picks', () => {
  const picks = foodPicks(allSteps, progress, live);

  it('S3-08 and S4-03 get one, the trip a bag and the total the plan', () => {
    expect(Object.keys(picks).sort()).toEqual(['S3-08', 'S4-03']);
    expect(picks['S3-08'].trip).toBe(26);
    expect(picks['S3-08'].total).toBeGreaterThan(60);
    expect(picks['S4-03'].trip).toBe(26);
    // Hill Giants at Defence 1 eat far more per XP than Minotaurs.
    expect(picks['S4-03'].total).toBeGreaterThan(picks['S3-08'].total * 2);
  });

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
  const s = stepById.get('S3-08')!;
  const picked = withFoodPlan(s, { trip: 26, total: 110, hpPerKill: 3.4 });

  it('the food asks for one trip and carries the whole goal; other items are untouched', () => {
    const salmon = picked.itemsRequired!.find((i) => i.nameEn === 'Salmon')!;
    expect(salmon).toMatchObject({ amount: 26, totalAmount: 110 });
    expect(picked.itemsRequired!.find((i) => i.nameEn === 'Mithril scimitar')).toBe(s.itemsRequired!.find((i) => i.nameEn === 'Mithril scimitar'));
    expect(withFoodPlan(s, undefined)).toBe(s);
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

  it('no food needed at all: the food is not asked for', () => {
    expect(withFoodPlan(s, { trip: 0, total: 0, hpPerKill: 0 }).itemsRequired!.some((i) => i.nameEn === 'Salmon')).toBe(false);
  });
});

describe('one number to buy', () => {
  it('the food row is about the trip and names the whole-goal purchase', () => {
    const picked = withFoodPlan(stepById.get('S3-08')!, { trip: 26, total: 110, hpPerKill: 3.4 });
    const o: OwnedState = owned({ 'Mithril scimitar': 1, Salmon: 13, Trout: 0, Tuna: 0, Lobster: 0, Swordfish: 0 });
    const row = stepReadiness({ step: picked, steps: allSteps, progress, qp: 20, mode: 'f2p', stats, owned: o, gear })
      .requirements.find((q) => q.label.startsWith('Salmon'))!;
    expect(row.detail).toBe('have 13, 13 short; buy about 97 for the whole goal');
  });
});

describe('the food line in the game', () => {
  it('the pace carries the health a kill costs; the level 12 Minotaur about 3 to 4 at Defence 1 in iron', () => {
    const pick = foodPicks(allSteps, progress, live)['S3-08'];
    expect(pick.hpPerKill).toBeGreaterThan(2.5);
    expect(pick.hpPerKill).toBeLessThan(4.5);
    expect(withFoodPlan(stepById.get('S3-08')!, pick).pacing!.foodHpPerKill).toBe(pick.hpPerKill);
    // Health that comes back faster than it goes: nothing to send.
    expect(withFoodPlan(stepById.get('S3-08')!, { trip: 0, total: 0, hpPerKill: 0 }).pacing!.foodHpPerKill).toBeUndefined();
  });
});
