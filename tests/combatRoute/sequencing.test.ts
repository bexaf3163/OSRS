import { describe, expect, it } from 'vitest';
import { evaluatePlans } from '../../src/lib/combatRoute/plans';
import { currentPhase, phaseDone, phaseInstruction, resolvePick, withCombatPlan } from '../../src/lib/combatRoute/pick';
import { xpForLevel } from '../../src/lib/xp';
import { stepById } from '../../src/data';
import { HISTORICAL, planInput } from './fixture';
import { estimateStep, xpPerKill } from '../../src/lib/combatEstimate';

describe('combined combat objectives', () => {
  it('carries only unused whole Strength doses into the next phase', () => {
    const input = planInput();
    const ctx = { ...input.ctx, strengthDoses: 2 };
    const short = estimateStep({ ...input.step, pacing: { ...input.step.pacing!, targetExp: HISTORICAL.xp.attack + 140 } }, ctx)[0];
    const long = estimateStep(input.step, ctx)[0];
    expect(short.strengthDosesLeft).toBe(1);
    expect(long.strengthDosesLeft).toBe(0);
  });
  it('credits Attack XP from collecting the bones before estimating the remaining cows', () => {
    const r = evaluatePlans(planInput())!;
    const first = r.plans.find(p => p.key === 'item-first')!;
    const split = r.plans.find(p => p.key === 'split')!;
    expect(first.phases[0].item).toEqual({ name: 'Big bones', count: 50 });
    expect(first.phases[0].kills).toBe(50);
    const earned = 50 * xpPerKill(first.phases[0].foe);
    expect(first.phases[0].goals[0].exp).toBe(HISTORICAL.xp.attack + earned);
    expect(first.phases[1].kills).toBe(Math.ceil((xpForLevel(40) - HISTORICAL.xp.attack - earned) / xpPerKill(first.phases[1].foe)));
    expect(first.phases[1].kills).toBeLessThan(split.phases[0].kills);
    expect(phaseInstruction(first.phases[0])).toContain('on Accurate');
    expect(currentPhase(first, { xp: HISTORICAL.xp, held: () => null })).toBe(0);
    // Owning the bones cannot manufacture the projected XP: the next phase still uses real XP.
    expect(currentPhase(first, { xp: HISTORICAL.xp, held: () => 50 })).toBe(1);
    const pick = resolvePick(r, 'item-first', { xp: HISTORICAL.xp, held: () => 0 })!;
    const applied = withCombatPlan(stepById.get('S4-03')!, pick);
    expect(applied.combatPlan?.now).toContain('on Accurate');
    expect(applied.inGame?.completionTrigger).toEqual(stepById.get('S4-03')!.inGame?.completionTrigger);
    expect(applied.pacing?.targetExp).toBe(HISTORICAL.xp.attack + earned);
  });

  it('collects only missing bones and still compares faster XP targets once all bones are owned', () => {
    const partial = evaluatePlans(planInput({ items: { 'Big bones': [0, 30] } }))!;
    expect(partial.plans.find(p => p.key === 'item-first')?.phases[0].kills).toBe(20);
    const owned = evaluatePlans(planInput({ items: { 'Big bones': [0, 50] } }))!;
    const spots = owned.plans.filter(p => p.id === 'xp-only');
    // Every spot is compared on its own once there is nothing left to collect.
    expect(spots.map(p => p.phases[0].foe.name)).toEqual(expect.arrayContaining(['Cow', 'Minotaur', 'Barbarian', 'Monk', 'Al Kharid warrior']));
    for (const xp of spots) {
      expect(xp.key).toBe(`xp-only:${xp.phases[0].foe.name}`);
      expect(xp.phases).toHaveLength(1);
      expect(xp.phases[0].item).toBeUndefined();
      expect(xp.phases[0].goals[0].exp).toBe(xpForLevel(40));
    }
  });

  it('can estimate the outstanding item objective after Attack 40 is reached', () => {
    const r = evaluatePlans(planInput({ stats: { ...HISTORICAL.stats, attack: 40 }, xp: { ...HISTORICAL.xp, attack: xpForLevel(40) }, items: { 'Big bones': [0, 38] } }))!;
    expect(r).not.toBeNull();
    expect(r.plans[0].phases[0].kills).toBe(12);
    expect(r.plans[0].phases[0].item?.count).toBe(50);
  });

  it('every Defence-first plan budgets the missing bones even when one kill would finish Attack', () => {
    const r = evaluatePlans(planInput({ stats: { ...HISTORICAL.stats, attack: 39 }, xp: { ...HISTORICAL.xp, attack: xpForLevel(40) - 1 } }))!;
    for (const p of r.plans.filter(p => p.id === 'defence-first')) {
      const last = p.phases.at(-1)!;
      expect(last.kills).toBeGreaterThanOrEqual(50);
      expect(last.item).toEqual({ name: 'Big bones', count: 50 });
      expect(phaseDone(last, { xp: { attack: xpForLevel(40) }, held: () => 49 })).toBe(false);
      expect(phaseDone(last, { xp: { attack: xpForLevel(40) }, held: () => 50 })).toBe(true);
      expect(phaseInstruction(last)).toContain('50 Big bones');
    }
  });
});
