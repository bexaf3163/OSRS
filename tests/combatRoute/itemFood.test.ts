import { describe, expect, it } from 'vitest';
import { combatPlanView } from '../../src/lib/combatPlan';
import { foodPicks, withFoodPlan } from '../../src/lib/foodPlan';
import { emptyProgress } from '../../src/lib/progress';
import { xpForLevel } from '../../src/lib/xp';
import { evaluatePlans } from '../../src/lib/combatRoute/plans';
import { resolvePick, withCombatPlan } from '../../src/lib/combatRoute/pick';
import { toInGameTarget } from '../../src/services/runeliteBridge';
import { HISTORICAL, planInput } from './fixture';

const afterAttack = () => planInput({
  stats: { ...HISTORICAL.stats, attack: 40 },
  xp: { ...HISTORICAL.xp, attack: xpForLevel(40) },
  items: { 'Big bones': [0, 0], Salmon: [0, 0] },
});

describe('retained item combat and food use the same objective', () => {
  it('still budgets all fifty Hill Giant kills after Attack 40, rather than dropping the food estimate', () => {
    const input = afterAttack();
    const view = combatPlanView(input.step, { ...input.ctx, owned: input.owned });
    expect(view).not.toBeNull();
    expect(view!.primary.kills).toBe(50);
    expect(view!.plan).toBeGreaterThan(25);
    const picks = foodPicks([input.step], emptyProgress(), { ...input.ctx, owned: input.owned });
    expect(picks[input.step.id].total).toBe(view!.plan);
    expect(picks[input.step.id].trip).toBeLessThanOrEqual(26);
    const resolved = withFoodPlan(input.step, picks[input.step.id]);
    expect(resolved.itemsRequired!.find(i => i.nameEn === 'Salmon')!.totalAmount).toBe(view!.plan);
    expect(toInGameTarget(resolved)!.completionTrigger).toEqual(input.step.inGame!.completionTrigger);
  });

  it.each(['split', 'item-first'])('%s item phase retains a full collection estimate if its projected XP was reached elsewhere', key => {
    const original = planInput();
    const report = evaluatePlans(original)!;
    const input = afterAttack();
    const pick = resolvePick(report, key, { xp: input.ctx.xp ?? null, held: () => 0 })!;
    expect(pick.kind).toBe('item');
    const resolved = withCombatPlan(input.step, pick);
    const view = combatPlanView(resolved, { ...input.ctx, owned: input.owned });
    expect(view).not.toBeNull();
    expect(view!.primary.kills).toBe(50);
    expect(view!.plan).toBeGreaterThan(25);
    expect(foodPicks([resolved], emptyProgress(), { ...input.ctx, owned: input.owned })[resolved.id].total).toBe(view!.plan);
    expect(toInGameTarget(resolved)!.completionTrigger).toEqual(input.step.inGame!.completionTrigger);
    expect(JSON.stringify(toInGameTarget(resolved))).not.toContain('trainingSkill');
  });

  it('adds no collection workload after the required stock and Attack goal are both complete', () => {
    const input = afterAttack();
    input.owned!.items.get('big bones')!.bank = 50;
    expect(combatPlanView(input.step, { ...input.ctx, owned: input.owned })).toBeNull();
  });

  it('sizes only the missing retained stock and does not collect Big bones from cows', () => {
    const input = afterAttack();
    input.owned!.items.get('big bones')!.bank = 30;
    const view = combatPlanView(input.step, { ...input.ctx, owned: input.owned })!;
    expect(view.primary.kills).toBe(20);
    expect(view.plan).toBeGreaterThan(0);
    expect(combatPlanView({ ...input.step, foes: ['Cow'] }, { ...input.ctx, owned: input.owned })).toBeNull();
  });
});
