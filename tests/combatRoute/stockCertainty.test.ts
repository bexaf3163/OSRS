import { describe, expect, it } from 'vitest';
import { itemGoal } from '../../src/lib/combatObjectives';
import { evaluatePlans } from '../../src/lib/combatRoute/plans';
import { planInput } from './fixture';

describe('required combat loot uses per-item bank certainty', () => {
  it.each(['absent', 'unreported'] as const)('an opened bank with an %s item quantity is still unchecked', source => {
    const input = planInput({ items: { 'Big bones': [0, 0] } });
    if (source === 'absent') input.owned!.items.delete('big bones');
    else input.owned!.items.get('big bones')!.bank = undefined;
    expect(itemGoal(input.step, input.owned)).toMatchObject({ missing: 50, unread: true });
    for (const plan of evaluatePlans(input)!.plans) {
      expect(plan.risks.some(r => /Big bones bank quantity is not checked/.test(r))).toBe(true);
    }
  });

  it('confirmed carried stock can satisfy the item goal while the rest of the bank is unknown', () => {
    const input = planInput({ items: { 'Big bones': [50, 0] } });
    input.owned!.items.get('big bones')!.bank = undefined;
    expect(itemGoal(input.step, input.owned)).toMatchObject({ held: 50, missing: 0, unread: true });
    expect(evaluatePlans(input)!.plans.some(p => p.phases.some(ph => ph.item))).toBe(false);
  });

  it('an explicitly reported zero is complete evidence, distinct from an absent quantity', () => {
    const input = planInput({ items: { 'Big bones': [0, 0] } });
    expect(itemGoal(input.step, input.owned)).toMatchObject({ held: 0, missing: 50, unread: false });
    expect(evaluatePlans(input)!.plans.every(p => !p.risks.some(r => /bank quantity is not checked/.test(r)))).toBe(true);
  });
});
