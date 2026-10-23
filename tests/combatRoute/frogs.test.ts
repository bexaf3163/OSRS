import { describe, expect, it } from 'vitest';
import { allSteps, stepById } from '../../src/data';
import { evaluatePlans } from '../../src/lib/combatRoute/plans';
import { resolvePick, withCombatPlan } from '../../src/lib/combatRoute/pick';
import { planInput } from './fixture';

describe('the real S4-03 route separates training from funding', () => {
  const step = stepById.get('S4-03')!;
  const report = () => evaluatePlans({ ...planInput(), step, steps: allSteps })!;
  it('finishes at Attack 40 without forcing a quota, banking or a second target', () => {
    expect(step.inGame?.completionTrigger).toEqual({ type: 'SKILL_LEVEL', levels: [{ skill: 'attack', level: 40 }] });
    const r = report();
    expect(r.objective).toBe('Attack to 40');
    expect(r.plans.some(p => p.id === 'split' || p.id === 'item-first')).toBe(false);
    expect(r.plans.every(p => p.phases.every(ph => !ph.item))).toBe(true);
    // Stale adopted keys from old saves cannot resurrect the removed bone phase.
    expect(resolvePick(r, 'item-first', { xp: { attack: 20000 }, held: () => 0 })).toBeNull();
  });
  it('offers surface frogs through the same estimate and guide pipeline', () => {
    const r = report();
    const frog = r.plans[0];
    const training = frog.phases.find(ph => ph.kind === 'route')!;
    expect(frog.phases[0]).toMatchObject({ kind: 'defence', goals: [{ skill: 'defence', exp: 1154 }] });
    expect(frog.phases[1]).toMatchObject({ kind: 'armour', armour: [1165, 1125, 1077, 1195] });
    expect(training.foe).toMatchObject({ name: 'Giant frog', combat: 13, hitpoints: 23, maxHit: 2 });
    expect(training.kills).toBe(Math.ceil((37224 - 13363) / 92));
    expect(training.spot.place.plane).toBe(0);
    const p = r.plans.find(p => p.key === r.recommended)!;
    expect(p.eligible).toBe(true);
    const pick = resolvePick(r, p.key, { xp: { attack: 13363, strength: 2000, defence: 0 }, held: () => 0 });
    const applied = withCombatPlan(step, pick ?? undefined);
    expect(applied.inGame?.completionTrigger?.items).toBeUndefined();
    expect(applied.quickSteps?.[0]).toContain('Defensive until Defence 10');
    expect(applied.quickSteps?.[1]).toContain('Black full helm');
    expect(applied.fields?.some(f => f.label === 'Armour')).toBe(true);
    expect(p.phases.every(ph => ph.foe.name !== 'Hill Giant')).toBe(true);
    expect(p.food.mid).toBeGreaterThanOrEqual(0);
    expect(p.minutes.mid).toBeGreaterThan(0);
    const pure = evaluatePlans({ ...planInput(), step, steps: allSteps, keepDefenceOne: true })!;
    expect(pure.recommended).toBe('route');
    expect(pure.plans[0].phases[0].foe.name).toBe('Giant frog');
  });
});
