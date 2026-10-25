import { describe, expect, it } from 'vitest';
import { estimateStep } from '../../src/lib/combatEstimate';
import { evaluatePlans } from '../../src/lib/combatRoute/plans';
import { xpForLevel } from '../../src/lib/xp';
import { HISTORICAL, planInput } from './fixture';

describe('mandatory retained loot and combat duration', () => {
  it('budgets a bank visit for fifty nonstacking bones even when no food banking is needed', () => {
    const input = planInput({ stats: { attack: 30, strength: 99, defence: 99, hitpoints: 99 } });
    const base = estimateStep(input.step, input.ctx)[0];
    expect(base.trips.mid).toBe(1);
    const route = evaluatePlans(input)!.plans[0].phases[0];
    expect(route.requiredLootTrips).toBe(2);
    // One more visit to the spot's own bank (the Hill Giants': Edgeville, through the trapdoor).
    const trip = base.bankTripMinutes!;
    expect(trip.mid).toBeLessThan(4.5);
    expect(route.minutes.mid).toBeCloseTo(base.totalMinutes.mid + trip.mid, 8);
    expect(route.minutes.low).toBeCloseTo(base.totalMinutes.low + trip.low, 8);
    expect(route.minutes.high).toBeCloseTo(base.totalMinutes.high + trip.high, 8);
  });

  it('uses only missing bones and does not add loot trips on top of an already longer food-bank schedule', () => {
    const input = planInput();
    const base = estimateStep(input.step, input.ctx)[0];
    expect(base.trips.mid).toBeGreaterThan(2);
    expect(evaluatePlans(input)!.plans[0].minutes.mid).toBeCloseTo(base.totalMinutes.mid, 8);
    const partial = planInput({ stats: { attack: 30, strength: 99, defence: 99, hitpoints: 99 }, items: { 'Big bones': [0, 30] } });
    expect(evaluatePlans(partial)!.plans[0].phases[0].requiredLootTrips).toBe(1);
  });

  it('estimates the full fifty-kill fight instead of multiplying a one-kill free-health buffer', () => {
    const input = planInput({ stats: { ...HISTORICAL.stats, attack: 39 }, xp: { ...HISTORICAL.xp, attack: xpForLevel(40) - 1 } });
    const r = evaluatePlans(input)!;
    expect(r.plans[0].phases[0].kills).toBe(50);
    expect(r.plans[0].food.mid).toBeGreaterThan(20);
    for (const plan of r.plans.filter(p => p.id === 'defence-first')) {
      const last = plan.phases.at(-1)!;
      expect(last.kills).toBeGreaterThanOrEqual(50);
      expect(last.food.mid).toBeGreaterThan(0);
    }
  });
});
